import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { createAuthGuards, getAuth } from "../auth/middleware.js";
import { clientIp, consumeRateLimit } from "../security/rateLimit.js";
import {
  createInvite,
  createRoom,
  getRoomForUser,
  joinRoom,
  leaveRoom,
  listMembers,
  listRoomsForUser,
} from "./store.js";

type CreateRoomBody = { name?: unknown };
type JoinRoomBody = { inviteToken?: unknown };
type RoomParams = { roomId: string };

export function registerRoomRoutes(app: FastifyInstance, config: AppConfig): void {
  const { requireAuth } = createAuthGuards(config);

  app.get("/api/rooms", { preHandler: requireAuth }, async (request, reply) => {
    const auth = getAuth(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    return listRoomsForUser(auth.user.id);
  });

  // Compatibility path used by the existing web client.
  app.get("/rooms", { preHandler: requireAuth }, async (request, reply) => {
    const auth = getAuth(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    return listRoomsForUser(auth.user.id);
  });

  app.post<{ Body: CreateRoomBody }>("/api/rooms", { preHandler: requireAuth }, async (request, reply) => {
    return createRoomHandler(request, reply, config);
  });

  app.post<{ Body: CreateRoomBody }>("/rooms", { preHandler: requireAuth }, async (request, reply) => {
    return createRoomHandler(request, reply, config);
  });

  app.get<{ Params: RoomParams }>("/api/rooms/:roomId", { preHandler: requireAuth }, async (request, reply) => {
    const auth = getAuth(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const room = getRoomForUser(request.params.roomId, auth.user.id);
    if (!room) return reply.code(404).send({ error: "room_not_found" });
    return room;
  });

  app.post<{ Params: RoomParams; Body: JoinRoomBody }>(
    "/api/rooms/:roomId/join",
    { preHandler: requireAuth },
    async (request, reply) => joinRoomHandler(request, reply),
  );

  app.post<{ Params: { id: string }; Body: JoinRoomBody }>(
    "/rooms/:id/join",
    { preHandler: requireAuth },
    async (request, reply) => {
      return joinRoomHandler(
        Object.assign(request, { params: { roomId: request.params.id } }) as FastifyRequest<{
          Params: RoomParams;
          Body: JoinRoomBody;
        }>,
        reply,
      );
    },
  );

  app.post<{ Params: RoomParams }>(
    "/api/rooms/:roomId/leave",
    { preHandler: requireAuth },
    async (request, reply) => {
      const auth = getAuth(request);
      if (!auth) return reply.code(401).send({ error: "authentication_required" });
      try {
        leaveRoom(request.params.roomId, auth.user.id);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof Error && error.message === "not_a_member") {
          return reply.code(404).send({ error: "not_a_member" });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: RoomParams }>(
    "/api/rooms/:roomId/members",
    { preHandler: requireAuth },
    async (request, reply) => {
      const auth = getAuth(request);
      if (!auth) return reply.code(401).send({ error: "authentication_required" });
      if (!getRoomForUser(request.params.roomId, auth.user.id)) {
        return reply.code(404).send({ error: "room_not_found" });
      }
      return listMembers(request.params.roomId);
    },
  );

  app.post<{ Params: RoomParams }>(
    "/api/rooms/:roomId/invites",
    { preHandler: requireAuth },
    async (request, reply) => {
      const auth = getAuth(request);
      if (!auth) return reply.code(401).send({ error: "authentication_required" });
      try {
        return createInvite(request.params.roomId, auth.user.id);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return reply.code(403).send({ error: "forbidden" });
        }
        throw error;
      }
    },
  );
}

async function createRoomHandler(
  request: FastifyRequest<{ Body: CreateRoomBody }>,
  reply: FastifyReply,
  config: AppConfig,
) {
  const auth = getAuth(request);
  if (!auth) return reply.code(401).send({ error: "authentication_required" });

  const limited = consumeRateLimit(
    `rooms:create:${auth.user.id}:${clientIp(request)}`,
    30,
    config.rateLimitWindowMs,
  );
  if (!limited.allowed) {
    return reply.code(429).send({ error: "rate_limited" });
  }

  const name = typeof request.body?.name === "string" ? request.body.name : "";
  try {
    const room = createRoom({ name, createdBy: auth.user.id });
    return reply.code(201).send(room);
  } catch (error) {
    if (error instanceof Error && error.message === "room_name_required") {
      return reply.code(400).send({ error: "room_name_required" });
    }
    throw error;
  }
}

async function joinRoomHandler(
  request: FastifyRequest<{ Params: RoomParams; Body: JoinRoomBody }>,
  reply: FastifyReply,
) {
  const auth = getAuth(request);
  if (!auth) return reply.code(401).send({ error: "authentication_required" });

  const inviteToken = typeof request.body?.inviteToken === "string" ? request.body.inviteToken : undefined;
  try {
    const room = joinRoom(request.params.roomId, auth.user.id, inviteToken);
    return reply.code(200).send(room);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    switch (error.message) {
      case "room_not_found":
        return reply.code(404).send({ error: "room_not_found" });
      case "invite_invalid":
      case "invite_expired":
        return reply.code(403).send({ error: error.message });
      default:
        throw error;
    }
  }
}
