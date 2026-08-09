import Fastify from "fastify";
import websocket from "@fastify/websocket";
import {
  createEnvelope,
  createId,
  generateRoomCode,
  isProtocolEnvelope,
  nowIso,
  type DeviceIdentityPublic,
  type ProtocolEnvelope,
  type RoomCreatedPayload,
} from "@qev-workspace/protocol";
import { registerAudioNamespace } from "./audio/namespace.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerChatRoutes } from "./chat/routes.js";
import { isAllowedOrigin, loadConfig } from "./config.js";
import { openDatabase, runMigrations } from "./db/client.js";
import { registerRoomRoutes } from "./rooms/routes.js";
import { clientIp, consumeRateLimit } from "./security/rateLimit.js";

// Keep development mock modules available when explicitly enabled.
import { registerMockAudioNamespace } from "./mockAudio.js";
import { registerMockChatRoutes } from "./mockChat.js";
import { registerMockRoomRoutes } from "./mockRooms.js";

const config = loadConfig();

if (!config.useMockStorage) {
  const db = openDatabase(config);
  runMigrations(db);
}

const PORT = config.port;
const ROOM_TTL_MS = config.roomTtlMs;
const ALLOWED_ORIGINS = config.allowedOrigins;

type IncomingMessageData = { toString(): string };

type WebSocketLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  on(event: "message", cb: (raw: IncomingMessageData) => void): void;
  on(event: "close", cb: () => void): void;
};

type Peer = {
  peerId: string;
  device?: DeviceIdentityPublic;
  socket: WebSocketLike;
  joinedAt: number;
};

type Room = {
  roomCode: string;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  peers: Map<string, Peer>;
};

const rooms = new Map<string, Room>();
const socketToRoom = new WeakMap<WebSocketLike, { roomCode: string; peerId: string }>();

const app = Fastify({
  logger: true,
  bodyLimit: config.bodyLimitBytes,
  trustProxy: true,
});
await app.register(websocket);

app.addHook("onRequest", async (request, reply) => {
  reply.header("x-content-type-options", "nosniff");
  reply.header("x-frame-options", "DENY");
  reply.header("referrer-policy", "no-referrer");
  reply.header("permissions-policy", "camera=(self), microphone=(self), display-capture=(self)");
  reply.header("cross-origin-opener-policy", "same-origin");
  reply.header("cross-origin-resource-policy", "same-site");

  if (!request.url.startsWith("/ws")) {
    const limited = consumeRateLimit(
      `http:${clientIp(request)}:${request.method}`,
      config.rateLimitMax,
      config.rateLimitWindowMs,
    );
    reply.header("x-ratelimit-remaining", String(limited.remaining));
    if (!limited.allowed) {
      reply.header("retry-after", String(Math.ceil(limited.retryAfterMs / 1000) || 1));
      return reply.code(429).send({ error: "rate_limited" });
    }
  }

  const origin = request.headers.origin;
  if (origin && isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
    reply.header("access-control-allow-origin", origin);
    reply.header("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
    reply.header(
      "access-control-allow-headers",
      "content-type, authorization",
    );
    reply.header("access-control-allow-credentials", "true");
    reply.header("vary", "Origin");
  }

  if (request.method === "OPTIONS") return reply.code(204).send();
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "request_failed");
  if (reply.sent) return;
  const status = typeof error === "object" && error && "statusCode" in error
    ? Number((error as { statusCode?: number }).statusCode) || 500
    : 500;
  reply.code(status >= 400 && status < 600 ? status : 500).send({
    error: config.isProduction ? "internal_error" : (error instanceof Error ? error.message : "internal_error"),
  });
});

if (config.useMockStorage) {
  registerMockRoomRoutes(app);
  registerMockChatRoutes(app);
  registerMockAudioNamespace(app, (origin) => isAllowedOrigin(origin, ALLOWED_ORIGINS));
} else {
  registerAuthRoutes(app, config);
  registerRoomRoutes(app, config);
  registerChatRoutes(app, config);
  registerAudioNamespace(app, config, (origin) => isAllowedOrigin(origin, ALLOWED_ORIGINS));
}

app.get("/", async () => ({
  ok: true,
  service: "qev-workspace-relay",
  health: "/health",
  websocket: "/ws",
  audioWebsocket: "/ws/audio",
  storage: config.useMockStorage ? "mock" : "sqlite",
  rooms: rooms.size,
  time: nowIso(),
}));

app.get("/health", async () => ({
  ok: true,
  service: "qev-workspace-relay",
  storage: config.useMockStorage ? "mock" : "sqlite",
  rooms: rooms.size,
  time: nowIso(),
}));

app.get("/ws", { websocket: true }, (connection, request) => {
  cleanupExpiredRooms();

  const origin = request.headers.origin;
  if (origin && !isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
    connection.close(1008, "origin_not_allowed");
    return;
  }

  const socket = connection as unknown as WebSocketLike;

  socket.on("message", (raw: IncomingMessageData) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      send(socket, createEnvelope("error", { code: "bad_json" }));
      return;
    }

    if (!isProtocolEnvelope(parsed)) {
      send(socket, createEnvelope("error", { code: "bad_envelope" }));
      return;
    }

    handleMessage(socket, parsed);
  });

  socket.on("close", () => removeSocket(socket));
});

function handleMessage(socket: WebSocketLike, message: ProtocolEnvelope): void {
  cleanupExpiredRooms();

  switch (message.type) {
    case "room.create": {
      const payload = asRecord(message.payload);
      const device = asDevice(payload.device);
      const roomCode = uniqueRoomCode();
      const sessionId = createId("sess");
      const createdAt = Date.now();
      const expiresAt = createdAt + ROOM_TTL_MS;
      const peerId = createId("peer");

      const room: Room = {
        roomCode,
        sessionId,
        createdAt,
        expiresAt,
        peers: new Map([[peerId, { peerId, socket, joinedAt: createdAt, device }]]),
      };

      rooms.set(roomCode, room);
      socketToRoom.set(socket, { roomCode, peerId });

      send<RoomCreatedPayload>(
        socket,
        createEnvelope("room.created", {
          roomCode,
          sessionId,
          expiresAt: new Date(expiresAt).toISOString(),
        }),
      );
      return;
    }

    case "room.join": {
      const payload = asRecord(message.payload);
      const roomCode = String(payload.roomCode ?? "").trim().toUpperCase();
      const room = rooms.get(roomCode);
      const device = asDevice(payload.device);

      if (!room || room.expiresAt < Date.now()) {
        send(socket, createEnvelope("error", { code: "room_not_found_or_expired" }));
        return;
      }

      if (room.peers.size >= 2) {
        send(socket, createEnvelope("error", { code: "room_full" }));
        return;
      }

      const existingPeer = [...room.peers.values()][0];
      const peerId = createId("peer");
      room.peers.set(peerId, { peerId, socket, joinedAt: Date.now(), device });
      socketToRoom.set(socket, { roomCode, peerId });

      send(
        socket,
        createEnvelope("room.joined", {
          roomCode,
          sessionId: room.sessionId,
          peer: existingPeer?.device,
        }),
      );

      broadcast(
        room,
        socket,
        createEnvelope("room.peer_joined", {
          roomCode,
          sessionId: room.sessionId,
          device,
        }),
      );
      return;
    }

    case "signal.offer":
    case "signal.answer":
    case "signal.ice":
    case "pointer.move":
    case "control.request":
    case "control.grant":
    case "control.revoke":
    case "control.intent":
    case "permission.request":
    case "permission.grant":
    case "permission.revoke":
    case "audit.event":
    case "heartbeat":
    case "session.end": {
      const membership = socketToRoom.get(socket);
      if (!membership) {
        send(socket, createEnvelope("error", { code: "not_in_room" }));
        return;
      }

      const room = rooms.get(membership.roomCode);
      if (!room) {
        send(socket, createEnvelope("error", { code: "room_missing" }));
        return;
      }

      broadcast(room, socket, message);

      if (message.type === "session.end") {
        closeRoom(room.roomCode, "session_ended");
      }
      return;
    }

    default:
      send(socket, createEnvelope("error", { code: "unsupported_message", type: message.type }));
  }
}

function broadcast(room: Room, except: WebSocketLike, message: ProtocolEnvelope): void {
  const raw = JSON.stringify(message);
  for (const peer of room.peers.values()) {
    if (peer.socket !== except && peer.socket.readyState === 1) peer.socket.send(raw);
  }
}

function send<T>(socket: WebSocketLike, message: ProtocolEnvelope<T>): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

function uniqueRoomCode(): string {
  for (let i = 0; i < 50; i += 1) {
    const code = generateRoomCode();
    if (!rooms.has(code)) return code;
  }
  throw new Error("failed_to_generate_room_code");
}

function removeSocket(socket: WebSocketLike): void {
  const membership = socketToRoom.get(socket);
  if (!membership) return;

  const room = rooms.get(membership.roomCode);
  if (!room) return;

  room.peers.delete(membership.peerId);

  if (room.peers.size === 0) {
    rooms.delete(membership.roomCode);
    return;
  }

  broadcast(room, socket, createEnvelope("room.peer_left", { reason: "peer_disconnected" }));
}

function closeRoom(roomCode: string, reason: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const peer of room.peers.values()) peer.socket.close(1000, reason);
  rooms.delete(roomCode);
}

function cleanupExpiredRooms(): void {
  const now = Date.now();

  for (const [code, room] of rooms) {
    if (room.expiresAt >= now) continue;

    // Expiry is an invite/join window, not an active-session kill switch.
    if (room.peers.size >= 2) continue;

    closeRoom(code, "room_expired");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asDevice(value: unknown): DeviceIdentityPublic | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.deviceId !== "string") return undefined;
  if (typeof record.displayName !== "string") return undefined;
  if (!record.publicKeyJwk || typeof record.publicKeyJwk !== "object") return undefined;
  if (typeof record.createdAt !== "string") return undefined;
  return record as DeviceIdentityPublic;
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting_down");
  try {
    await app.close();
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: PORT, host: "0.0.0.0" });
app.log.info({
  port: PORT,
  storage: config.useMockStorage ? "mock" : "sqlite",
  accessTokenTtlSeconds: config.accessTokenTtlSeconds,
}, "qev_relay_ready");
