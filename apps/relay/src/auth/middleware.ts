import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { verifyAccessToken, type AccessTokenClaims } from "./jwt.js";
import { findUserById, toPublicUser, type PublicUser } from "./users.js";

export type AuthenticatedRequest = FastifyRequest & {
  auth?: {
    claims: AccessTokenClaims;
    user: PublicUser;
  };
};

export function createAuthGuards(config: AppConfig) {
  async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      reply.code(401).send({ error: "authentication_required" });
      return;
    }

    const token = header.slice("Bearer ".length).trim();
    const claims = verifyAccessToken(config, token);
    if (!claims) {
      reply.code(401).send({ error: "invalid_or_expired_token" });
      return;
    }

    const user = findUserById(claims.sub);
    if (!user || user.disabled_at) {
      reply.code(401).send({ error: "user_disabled_or_missing" });
      return;
    }

    (request as AuthenticatedRequest).auth = {
      claims,
      user: toPublicUser(user),
    };
  }

  return { requireAuth };
}

export function getAuth(request: FastifyRequest): AuthenticatedRequest["auth"] {
  return (request as AuthenticatedRequest).auth;
}
