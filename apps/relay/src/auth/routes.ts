import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { clientIp, consumeRateLimit } from "../security/rateLimit.js";
import { signAccessToken } from "./jwt.js";
import { createAuthGuards, getAuth } from "./middleware.js";
import {
  authenticateUser,
  createRefreshToken,
  createUser,
  findUserById,
  isValidEmail,
  normalizeEmail,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  toPublicUser,
} from "./users.js";

const REFRESH_COOKIE = "qev_refresh";

type AuthBody = {
  email?: unknown;
  password?: unknown;
  displayName?: unknown;
};

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig): void {
  const { requireAuth } = createAuthGuards(config);

  app.post<{ Body: AuthBody }>("/api/auth/register", async (request, reply) => {
    if (!enforceAuthRateLimit(request, reply, config)) return;

    const email = normalizeEmail(request.body?.email);
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const displayName = typeof request.body?.displayName === "string" ? request.body.displayName : undefined;

    if (!isValidEmail(email) || password.length < 8) {
      return reply.code(400).send({ error: "invalid_registration" });
    }

    try {
      const user = createUser({ email, password, displayName });
      return issueSession(reply, config, user, request);
    } catch (error) {
      if (error instanceof Error && error.message === "email_taken") {
        return reply.code(409).send({ error: "email_taken" });
      }
      request.log.error({ err: error }, "registration_failed");
      return reply.code(500).send({ error: "registration_failed" });
    }
  });

  app.post<{ Body: AuthBody }>("/api/auth/login", async (request, reply) => {
    if (!enforceAuthRateLimit(request, reply, config)) return;

    const email = normalizeEmail(request.body?.email);
    const password = typeof request.body?.password === "string" ? request.body.password : "";

    if (!isValidEmail(email) || password.length < 8) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }

    const user = authenticateUser(email, password);
    if (!user) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }

    return issueSession(reply, config, user, request);
  });

  // Compatibility route used by earlier clients and tests.
  app.post<{ Body: AuthBody }>("/api/login", async (request, reply) => {
    if (!enforceAuthRateLimit(request, reply, config)) return;

    const email = normalizeEmail(request.body?.email);
    const password = typeof request.body?.password === "string" ? request.body.password : "";

    if (!isValidEmail(email) || password.length < 8) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }

    const user = authenticateUser(email, password);
    if (!user) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }

    return issueSession(reply, config, user, request);
  });

  app.post("/api/auth/refresh", async (request, reply) => {
    if (!enforceAuthRateLimit(request, reply, config)) return;

    const rawToken = readRefreshCookie(request);
    if (!rawToken) {
      return reply.code(401).send({ error: "refresh_required" });
    }

    const rotated = rotateRefreshToken({
      rawToken,
      ttlSeconds: config.refreshTokenTtlSeconds,
      userAgent: request.headers["user-agent"] ?? null,
      ipAddress: clientIp(request),
    });

    if (!rotated) {
      clearRefreshCookie(reply, config);
      return reply.code(401).send({ error: "refresh_invalid" });
    }

    const { token, claims } = signAccessToken(config, toPublicUser(rotated.user));
    setRefreshCookie(reply, config, rotated.rawToken);

    return {
      token,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      user: toPublicUser(rotated.user),
    };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const rawToken = readRefreshCookie(request);
    if (rawToken) revokeRefreshToken(rawToken);

    const auth = getAuth(request);
    if (auth?.user.id) {
      // Optional full-session logout when a valid access token is presented.
    }

    clearRefreshCookie(reply, config);
    return reply.code(204).send();
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    const auth = getAuth(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });

    const user = findUserById(auth.user.id);
    if (!user || user.disabled_at) {
      return reply.code(401).send({ error: "user_disabled_or_missing" });
    }

    return { user: toPublicUser(user) };
  });

  app.post("/api/auth/logout-all", { preHandler: requireAuth }, async (request, reply) => {
    const auth = getAuth(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    revokeAllRefreshTokensForUser(auth.user.id);
    clearRefreshCookie(reply, config);
    return reply.code(204).send();
  });
}

function issueSession(
  reply: FastifyReply,
  config: AppConfig,
  user: { id: string; email: string; display_name: string; disabled_at: string | null },
  request: FastifyRequest,
) {
  const publicUser = toPublicUser(user as never);
  const { token, claims } = signAccessToken(config, publicUser);
  const refresh = createRefreshToken({
    userId: user.id,
    ttlSeconds: config.refreshTokenTtlSeconds,
    userAgent: request.headers["user-agent"] ?? null,
    ipAddress: clientIp(request),
  });

  setRefreshCookie(reply, config, refresh.rawToken);

  return reply.code(200).send({
    token,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    user: publicUser,
  });
}

function enforceAuthRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
): boolean {
  const result = consumeRateLimit(
    `auth:${clientIp(request)}`,
    config.authRateLimitMax,
    config.rateLimitWindowMs,
  );
  reply.header("x-ratelimit-remaining", String(result.remaining));
  if (!result.allowed) {
    reply.header("retry-after", String(Math.ceil(result.retryAfterMs / 1000) || 1));
    reply.code(429).send({ error: "rate_limited" });
    return false;
  }
  return true;
}

function setRefreshCookie(reply: FastifyReply, config: AppConfig, rawToken: string): void {
  const secure = config.isProduction;
  reply.header(
    "set-cookie",
    [
      `${REFRESH_COOKIE}=${encodeURIComponent(rawToken)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      secure ? "Secure" : "",
      `Max-Age=${config.refreshTokenTtlSeconds}`,
    ]
      .filter(Boolean)
      .join("; "),
  );
}

function clearRefreshCookie(reply: FastifyReply, config: AppConfig): void {
  const secure = config.isProduction;
  reply.header(
    "set-cookie",
    [
      `${REFRESH_COOKIE}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      secure ? "Secure" : "",
      "Max-Age=0",
    ]
      .filter(Boolean)
      .join("; "),
  );
}

function readRefreshCookie(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === REFRESH_COOKIE) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=");
      }
    }
  }
  return null;
}
