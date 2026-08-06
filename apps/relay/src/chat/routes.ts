import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { createAuthGuards, getAuth } from "../auth/middleware.js";
import { clientIp, consumeRateLimit } from "../security/rateLimit.js";
import { createMessage, listMessages } from "./store.js";

type RoomParams = { roomId?: string; id?: string };
type CreateMessageBody = { content?: unknown; sender?: unknown };
type MessageQuery = { before?: string; limit?: string };

export function registerChatRoutes(app: FastifyInstance, config: AppConfig): void {
  const { requireAuth } = createAuthGuards(config);

  const listHandler = async (
    request: { params: RoomParams; query: MessageQuery },
    reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  ) => {
    const auth = getAuth(request as never);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });

    const roomId = request.params.roomId ?? request.params.id;
    if (!roomId) return reply.code(400).send({ error: "room_id_required" });

    try {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      return listMessages({
        roomId,
        userId: auth.user.id,
        before: request.query.before,
        limit: Number.isFinite(limit) ? limit : undefined,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "forbidden") {
        return reply.code(403).send({ error: "forbidden" });
      }
      throw error;
    }
  };

  const createHandler = async (
    request: {
      params: RoomParams;
      body: CreateMessageBody;
      log: { error: (obj: object, msg: string) => void };
    },
    reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  ) => {
    const auth = getAuth(request as never);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });

    const roomId = request.params.roomId ?? request.params.id;
    if (!roomId) return reply.code(400).send({ error: "room_id_required" });

    const limited = consumeRateLimit(
      `chat:post:${auth.user.id}:${clientIp(request as never)}`,
      60,
      config.rateLimitWindowMs,
    );
    if (!limited.allowed) {
      return reply.code(429).send({ error: "rate_limited" });
    }

    const content = typeof request.body?.content === "string" ? request.body.content : "";

    try {
      const message = createMessage({
        roomId,
        senderUserId: auth.user.id,
        content,
      });
      return reply.code(201).send(message);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      switch (error.message) {
        case "forbidden":
          return reply.code(403).send({ error: "forbidden" });
        case "message_content_required":
          return reply.code(400).send({ error: "message_content_required" });
        case "message_too_long":
          return reply.code(400).send({ error: "message_too_long" });
        default:
          request.log.error({ err: error }, "message_create_failed");
          return reply.code(500).send({ error: "message_create_failed" });
      }
    }
  };

  app.get<{ Params: RoomParams; Querystring: MessageQuery }>(
    "/api/rooms/:roomId/messages",
    { preHandler: requireAuth },
    async (request, reply) => listHandler(request, reply),
  );

  app.get<{ Params: RoomParams; Querystring: MessageQuery }>(
    "/rooms/:id/messages",
    { preHandler: requireAuth },
    async (request, reply) => listHandler(request, reply),
  );

  app.post<{ Params: RoomParams; Body: CreateMessageBody }>(
    "/api/rooms/:roomId/messages",
    { preHandler: requireAuth },
    async (request, reply) => createHandler(request, reply),
  );

  app.post<{ Params: RoomParams; Body: CreateMessageBody }>(
    "/rooms/:id/messages",
    { preHandler: requireAuth },
    async (request, reply) => createHandler(request, reply),
  );
}
