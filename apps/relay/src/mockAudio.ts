import type { FastifyInstance } from "fastify";
import { mockRooms } from "./mockRooms.js";

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
};

type AudioMembership = {
  roomId: string;
};

const MAX_AUDIO_PARTICIPANTS = 2;
const audioRooms = new Map<string, Set<AudioSocket>>();
const audioSocketMembership = new WeakMap<AudioSocket, AudioMembership>();

export function registerMockAudioNamespace(
  app: FastifyInstance,
  isAllowedOrigin: (origin: string) => boolean,
): void {
  app.get("/ws/audio", { websocket: true }, (connection, request) => {
    const origin = request.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
      connection.close(1008, "origin_not_allowed");
      return;
    }

    const socket = connection as unknown as AudioSocket;

    socket.on("message", (raw) => {
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
      if (!roomId || !mockRooms.some((room) => room.id === roomId)) {
        send(socket, { type: "audio.error", code: "room_not_found" });
        return;
      }

      removeAudioSocket(socket);

      const participants = audioRooms.get(roomId) ?? new Set<AudioSocket>();
      if (participants.size >= MAX_AUDIO_PARTICIPANTS) {
        send(socket, { type: "audio.error", code: "audio_room_full" });
        return;
      }

      const existingParticipants = [...participants];
      participants.add(socket);
      audioRooms.set(roomId, participants);
      audioSocketMembership.set(socket, { roomId });

      send(socket, {
        type: "audio.joined",
        roomId,
        participantCount: participants.size,
      });

      if (existingParticipants.length > 0) {
        for (const peer of existingParticipants) {
          send(peer, { type: "audio.peer_joined", roomId });
        }
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

      broadcastToAudioRoom(membership.roomId, socket, message);
      return;
    }

    case "audio.leave":
      removeAudioSocket(socket);
      return;

    default:
      send(socket, { type: "audio.error", code: "unsupported_audio_message" });
  }
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
  return value.type === expectedType && typeof value.sdp === "string";
}
