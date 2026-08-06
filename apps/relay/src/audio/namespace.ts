import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { createAuthGuards, getAuth } from "../auth/middleware.js";
import { createId, getDb, nowIso, sha256 } from "../db/client.js";
import { requireMembership } from "../rooms/store.js";
import { clientIp, consumeRateLimit } from "../security/rateLimit.js";

type IncomingMessageData = { toString(): string };

type AudioSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  on(event: "message", callback: (raw: IncomingMessageData) => void): void;
  on(event: "close", callback: () => void): void;
};

type AudioSignalMessage = {
  type: string;
  roomId?: unknown;
  description?: unknown;
  candidate?: unknown;
  ticket?: unknown;
};

type AudioMembership = {
  roomId: string;
  userId: string;
  connectionId: string;
  joinedAt: number;
};

const MAX_AUDIO_PARTICIPANTS = 2;
const MAX_SIGNAL_BYTES = 16_384;
const audioRooms = new Map<string, Set<AudioSocket>>();
const audioSocketMembership = new WeakMap<AudioSocket, AudioMembership>();

export function registerAudioNamespace(
  app: FastifyInstance,
  config: AppConfig,
  isAllowedOrigin: (origin: string) => boolean,
): void {
  const { requireAuth } = createAuthGuards(config);

  app.post<{ Body: { roomId?: unknown } }>(
    "/api/voice/ticket",
    { preHandler: requireAuth },
    async (request, reply) => {
      const auth = getAuth(request);
      if (!auth) return reply.code(401).send({ error: "authentication_required" });

      const roomId = typeof request.body?.roomId === "string" ? request.body.roomId.trim() : "";
      if (!roomId) return reply.code(400).send({ error: "room_id_required" });
      if (!requireMembership(roomId, auth.user.id)) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const limited = consumeRateLimit(
        `voice:ticket:${auth.user.id}:${clientIp(request)}`,
        30,
        config.rateLimitWindowMs,
      );
      if (!limited.allowed) return reply.code(429).send({ error: "rate_limited" });

      const rawTicket = createId("wst") + randomBytes(16).toString("hex");
      const id = createId("tkt");
      const createdAt = nowIso();
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      getDb().run(
        `INSERT INTO ws_tickets (id, user_id, room_id, purpose, token_hash, created_at, expires_at, consumed_at)
         VALUES (?, ?, ?, 'audio', ?, ?, ?, NULL)`,
        [id, auth.user.id, roomId, sha256(rawTicket), createdAt, expiresAt],
      );

      return {
        ticket: rawTicket,
        roomId,
        expiresAt,
        maxParticipants: MAX_AUDIO_PARTICIPANTS,
      };
    },
  );

  app.get("/api/webrtc/ice", { preHandler: requireAuth }, async (request, reply) => {
    const auth = getAuth(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    return buildIceServers(config, auth.user.id);
  });

  app.get("/ws/audio", { websocket: true }, (connection, request) => {
    const origin = request.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
      connection.close(1008, "origin_not_allowed");
      return;
    }

    const limited = consumeRateLimit(
      `voice:ws:${clientIp(request)}`,
      60,
      config.rateLimitWindowMs,
    );
    if (!limited.allowed) {
      connection.close(1008, "rate_limited");
      return;
    }

    const socket = connection as unknown as AudioSocket;

    socket.on("message", (raw) => {
      if (raw.toString().length > MAX_SIGNAL_BYTES) {
        send(socket, { type: "audio.error", code: "message_too_large" });
        return;
      }

      let message: AudioSignalMessage;
      try {
        message = JSON.parse(raw.toString()) as AudioSignalMessage;
      } catch {
        send(socket, { type: "audio.error", code: "bad_json" });
        return;
      }

      handleAudioMessage(socket, message);
    });

    socket.on("close", () => removeAudioSocket(socket));
  });
}

function handleAudioMessage(socket: AudioSocket, message: AudioSignalMessage): void {
  switch (message.type) {
    case "audio.join": {
      const roomId = normalizeString(message.roomId);
      const ticket = normalizeString(message.ticket);
      if (!roomId || !ticket) {
        send(socket, { type: "audio.error", code: "auth_required" });
        return;
      }

      const ticketRow = getDb().get<{
        id: string;
        user_id: string;
        room_id: string;
        expires_at: string;
        consumed_at: string | null;
      }>("SELECT * FROM ws_tickets WHERE token_hash = ? AND purpose = 'audio'", [sha256(ticket)]);

      if (!ticketRow || ticketRow.room_id !== roomId) {
        send(socket, { type: "audio.error", code: "auth_invalid" });
        return;
      }
      if (ticketRow.consumed_at) {
        send(socket, { type: "audio.error", code: "auth_reused" });
        return;
      }
      if (new Date(ticketRow.expires_at).getTime() <= Date.now()) {
        send(socket, { type: "audio.error", code: "auth_expired" });
        return;
      }
      if (!requireMembership(roomId, ticketRow.user_id)) {
        send(socket, { type: "audio.error", code: "forbidden" });
        return;
      }

      getDb().run("UPDATE ws_tickets SET consumed_at = ? WHERE id = ?", [nowIso(), ticketRow.id]);

      removeAudioSocket(socket);

      const participants = audioRooms.get(roomId) ?? new Set<AudioSocket>();
      if (participants.size >= MAX_AUDIO_PARTICIPANTS) {
        send(socket, { type: "audio.error", code: "audio_room_full" });
        return;
      }

      // Prevent same user from occupying both slots via multiple sockets.
      for (const peer of participants) {
        const membership = audioSocketMembership.get(peer);
        if (membership?.userId === ticketRow.user_id) {
          send(socket, { type: "audio.error", code: "already_joined" });
          return;
        }
      }

      const existingParticipants = [...participants];
      participants.add(socket);
      audioRooms.set(roomId, participants);
      audioSocketMembership.set(socket, {
        roomId,
        userId: ticketRow.user_id,
        connectionId: createId("acon"),
        joinedAt: Date.now(),
      });

      send(socket, {
        type: "audio.joined",
        roomId,
        participantCount: participants.size,
        maxParticipants: MAX_AUDIO_PARTICIPANTS,
      });

      for (const peer of existingParticipants) {
        send(peer, { type: "audio.peer_joined", roomId });
      }
      return;
    }

    case "audio.offer":
    case "audio.answer":
    case "audio.ice": {
      const membership = audioSocketMembership.get(socket);
      if (!membership) {
        send(socket, { type: "audio.error", code: "not_in_audio_room" });
        return;
      }

      const roomId = normalizeString(message.roomId);
      if (roomId !== membership.roomId) {
        send(socket, { type: "audio.error", code: "audio_room_mismatch" });
        return;
      }

      if (message.type === "audio.ice") {
        if (!isRecord(message.candidate)) {
          send(socket, { type: "audio.error", code: "bad_ice_candidate" });
          return;
        }
      } else if (!isSessionDescription(message.description, message.type === "audio.offer" ? "offer" : "answer")) {
        send(socket, { type: "audio.error", code: "bad_session_description" });
        return;
      }

      broadcastToAudioRoom(membership.roomId, socket, {
        type: message.type,
        roomId: membership.roomId,
        description: message.description,
        candidate: message.candidate,
      });
      return;
    }

    case "audio.leave":
      removeAudioSocket(socket);
      return;

    default:
      send(socket, { type: "audio.error", code: "unsupported_audio_message" });
  }
}

function buildIceServers(config: AppConfig, userId: string): {
  iceServers: Array<Record<string, unknown>>;
  ttlSeconds: number;
} {
  const iceServers: Array<Record<string, unknown>> = [
    { urls: "stun:stun.l.google.com:19302" },
  ];

  if (config.turnUrl) {
    if (config.turnUsername && config.turnCredential) {
      // Prefer short-lived TURN credentials derived from a shared secret when possible.
      const ttl = config.turnCredentialTtlSeconds;
      const expiry = Math.floor(Date.now() / 1000) + ttl;
      const username = `${expiry}:${userId}`;
      const credential = createHmac("sha1", config.turnCredential).update(username).digest("base64");

      // If static username is configured without secret-style rotation, fall back to static creds.
      const useStatic = config.turnUsername !== "time-limited";
      iceServers.push({
        urls: config.turnUrl,
        username: useStatic ? config.turnUsername : username,
        credential: useStatic ? config.turnCredential : credential,
      });
    } else {
      iceServers.push({ urls: config.turnUrl });
    }
  }

  return { iceServers, ttlSeconds: config.turnCredentialTtlSeconds };
}

function removeAudioSocket(socket: AudioSocket): void {
  const membership = audioSocketMembership.get(socket);
  if (!membership) return;

  const participants = audioRooms.get(membership.roomId);
  audioSocketMembership.delete(socket);
  if (!participants) return;

  participants.delete(socket);
  if (participants.size === 0) {
    audioRooms.delete(membership.roomId);
    return;
  }

  broadcastToAudioRoom(membership.roomId, socket, {
    type: "audio.peer_left",
    roomId: membership.roomId,
  });
}

function broadcastToAudioRoom(roomId: string, sender: AudioSocket, message: object): void {
  const participants = audioRooms.get(roomId);
  if (!participants) return;
  const raw = JSON.stringify(message);
  for (const participant of participants) {
    if (participant !== sender && participant.readyState === 1) participant.send(raw);
  }
}

function send(socket: AudioSocket, message: object): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isSessionDescription(value: unknown, expectedType: "offer" | "answer"): boolean {
  if (!isRecord(value)) return false;
  return value.type === expectedType && typeof value.sdp === "string" && value.sdp.length < 12_000;
}

// silence unused import warning for timingSafeEqual if tree-shaken in some builds
void timingSafeEqual;
