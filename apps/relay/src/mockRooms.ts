import { createId } from "@qev-workspace/protocol";
import type { FastifyInstance } from "fastify";
import { registerMockAuthRoutes } from "./mockAuth.js";

type MockRoom = {
  id: string;
  name: string;
  members: string[];
};

type CreateRoomBody = {
  name?: unknown;
  memberId?: unknown;
};

type JoinRoomBody = {
  memberId?: unknown;
};

type RoomParams = {
  id: string;
};

export const mockRooms: MockRoom[] = [];

export function registerMockRoomRoutes(app: FastifyInstance): void {
  registerMockAuthRoutes(app);

  app.get("/rooms", async () => mockRooms.map(cloneRoom));

  app.post<{ Body: CreateRoomBody }>("/rooms", async (request, reply) => {
    const name = normalizeString(request.body?.name);
    if (!name) return reply.code(400).send({ error: "room_name_required" });

    const memberId = normalizeString(request.body?.memberId);
    const room: MockRoom = {
      id: createId("room"),
      name: name.slice(0, 100),
      members: memberId ? [memberId] : [],
    };

    mockRooms.unshift(room);
    return reply.code(201).send(cloneRoom(room));
  });

  app.post<{ Params: RoomParams; Body: JoinRoomBody }>("/rooms/:id/join", async (request, reply) => {
    const room = mockRooms.find((candidate) => candidate.id === request.params.id);
    if (!room) return reply.code(404).send({ error: "room_not_found" });

    const memberId = normalizeString(request.body?.memberId) || createId("member");
    if (!room.members.includes(memberId)) room.members.push(memberId);

    return reply.code(204).send();
  });
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cloneRoom(room: MockRoom): MockRoom {
  return {
    ...room,
    members: [...room.members],
  };
}
