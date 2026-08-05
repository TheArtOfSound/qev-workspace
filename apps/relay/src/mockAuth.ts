import { createHash, createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

type MockJwtPayload = {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
};

const JWT_TTL_SECONDS = 60 * 60 * 8;
const MOCK_JWT_SECRET = process.env.MOCK_JWT_SECRET ?? "qev-development-jwt-secret-change-me";

export function registerMockAuthRoutes(app: FastifyInstance): void {
  app.post<{ Body: LoginBody }>("/api/login", async (request, reply) => {
    const email = normalizeEmail(request.body?.email);
    const password = normalizePassword(request.body?.password);

    if (!isValidEmail(email) || password.length < 8) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const profile = {
      id: createUserId(email),
      email,
      displayName: displayNameFromEmail(email),
    };
    const payload: MockJwtPayload = {
      sub: profile.id,
      email: profile.email,
      name: profile.displayName,
      iat: issuedAt,
      exp: issuedAt + JWT_TTL_SECONDS,
    };

    return reply.code(200).send({
      token: signJwt(payload),
      user: profile,
    });
  });
}

function signJwt(payload: MockJwtPayload): string {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encodeBase64Url(JSON.stringify(payload));
  const unsignedToken = `${header}.${body}`;
  const signature = createHmac("sha256", MOCK_JWT_SECRET).update(unsignedToken).digest("base64url");
  return `${unsignedToken}.${signature}`;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function createUserId(email: string): string {
  return `usr_${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
}

function displayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "QEV user";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "QEV user";
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePassword(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
