import type { FastifyInstance } from "fastify";
import { mockRooms } from "./mockRooms.js";

type MockChatMessage = {
  sender: string;
  timestamp: number;
  content: string;
};

type RoomParams = {
  id: string;
};

type CreateMessageBody = {
  sender?: unknown;
  content?: unknown;
};

export const mockMessagesByRoom: Record<string, MockChatMessage[]> = Object.create(null) as Record<
  string,
  MockChatMessage[]
>;

export function registerMockChatRoutes(app: FastifyInstance): void {
  app.get<{ Params: RoomParams }>("/rooms/:id/messages", async (request, reply) => {
    const roomId = request.params.id;
    if (!roomExists(roomId)) return reply.code(404).send({ error: "room_not_found" });

    return getRoomMessages(roomId);
  });

  app.post<{ Params: RoomParams; Body: CreateMessageBody }>(
    "/rooms/:id/messages",
    async (request, reply) => {
      const roomId = request.params.id;
      if (!roomExists(roomId)) return reply.code(404).send({ error: "room_not_found" });

      const sender = normalizeString(request.body?.sender);
      const content = normalizeString(request.body?.content);

      if (!sender) return reply.code(400).send({ error: "message_sender_required" });
      if (!content) return reply.code(400).send({ error: "message_content_required" });

      const message: MockChatMessage = {
        sender: sender.slice(0, 80),
        timestamp: Date.now(),
        content: content.slice(0, 2_000),
      };

      const roomMessages = mockMessagesByRoom[roomId] ?? [];
      roomMessages.push(message);
      mockMessagesByRoom[roomId] = roomMessages;

      return reply.code(201).send(cloneMessage(message));
    },
  );
}

export function resetMockChat(): void {
  for (const roomId of Object.keys(mockMessagesByRoom)) delete mockMessagesByRoom[roomId];
}

function roomExists(roomId: string): boolean {
  return mockRooms.some((room) => room.id === roomId);
}

function getRoomMessages(roomId: string): MockChatMessage[] {
  return [...(mockMessagesByRoom[roomId] ?? [])]
    .sort((left, right) => left.timestamp - right.timestamp)
    .map(cloneMessage);
}

function cloneMessage(message: MockChatMessage): MockChatMessage {
  return { ...message };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
