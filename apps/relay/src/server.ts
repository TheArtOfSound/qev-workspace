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

const PORT = Number(process.env.PORT ?? 8787);
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS ?? 5 * 60 * 1000);
const ALLOWED_ORIGINS = parseAllowedOrigins(
  process.env.ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
);

type Peer = {
  device?: DeviceIdentityPublic;
  socket: WebSocketLike;
  joinedAt: number;
};

type WebSocketLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
};

type IncomingMessageData = {
  toString(): string;
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

const app = Fastify({ logger: true });
await app.register(websocket);

app.get("/health", async () => ({ ok: true, service: "qev-workspace-relay", time: nowIso() }));

app.get("/ws", { websocket: true }, (connection, request) => {
  const origin = request.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    connection.close(1008, "origin_not_allowed");
    return;
  }

  const socket = connection as unknown as WebSocketLike;

  connection.on("message", (raw: IncomingMessageData) => {
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

  connection.on("close", () => {
    removeSocket(socket);
  });
});

function handleMessage(socket: WebSocketLike, message: ProtocolEnvelope): void {
  cleanupExpiredRooms();

  switch (message.type) {
    case "room.create": {
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
        peers: new Map([[peerId, { socket, joinedAt: createdAt }]]),
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
      if (!room || room.expiresAt < Date.now()) {
        send(socket, createEnvelope("error", { code: "room_not_found_or_expired" }));
        return;
      }
      if (room.peers.size >= 2) {
        send(socket, createEnvelope("error", { code: "room_full" }));
        return;
      }

      const peerId = createId("peer");
      const device = payload.device && typeof payload.device === "object" ? (payload.device as DeviceIdentityPublic) : undefined;
      room.peers.set(peerId, { socket, joinedAt: Date.now(), device });
      socketToRoom.set(socket, { roomCode, peerId });

      send(socket, createEnvelope("room.joined", { roomCode, sessionId: room.sessionId }));
      broadcast(room, socket, createEnvelope("room.peer_joined", { roomCode, sessionId: room.sessionId, device }));
      return;
    }

    case "signal.offer":
    case "signal.answer":
    case "signal.ice":
    case "permission.request":
    case "permission.grant":
    case "permission.revoke":
    case "audit.event":
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
  for (let i = 0; i < 25; i += 1) {
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
  if (room.peers.size === 0) rooms.delete(membership.roomCode);
  else broadcast(room, socket, createEnvelope("session.end", { reason: "peer_disconnected" }));
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
    if (room.expiresAt < now) closeRoom(code, "room_expired");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseAllowedOrigins(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

function isAllowedOrigin(origin: string): boolean {
  const normalizedOrigin = origin.trim().replace(/\/$/, "");
  return ALLOWED_ORIGINS.has("*") || ALLOWED_ORIGINS.has(normalizedOrigin);
}

await app.listen({ port: PORT, host: "0.0.0.0" });
