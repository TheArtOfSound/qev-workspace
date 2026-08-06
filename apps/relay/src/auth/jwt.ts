import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "../config.js";

export type AccessTokenClaims = {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  jti: string;
};

export function signAccessToken(
  config: AppConfig,
  profile: { id: string; email: string; displayName: string },
  nowSeconds = Math.floor(Date.now() / 1000),
): { token: string; claims: AccessTokenClaims } {
  const claims: AccessTokenClaims = {
    sub: profile.id,
    email: profile.email,
    name: profile.displayName,
    iat: nowSeconds,
    exp: nowSeconds + config.accessTokenTtlSeconds,
    iss: config.jwtIssuer,
    aud: config.jwtAudience,
    jti: randomBytes(16).toString("hex"),
  };

  return { token: signJwt(claims, config.jwtSigningSecret), claims };
}

export function verifyAccessToken(config: AppConfig, token: string): AccessTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;

  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", config.jwtSigningSecret).update(unsigned).digest("base64url");
  const actual = parts[2];

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return null;

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Partial<AccessTokenClaims>;
    if (
      typeof payload.sub !== "string"
      || typeof payload.email !== "string"
      || typeof payload.name !== "string"
      || typeof payload.iat !== "number"
      || typeof payload.exp !== "number"
      || typeof payload.iss !== "string"
      || typeof payload.aud !== "string"
      || typeof payload.jti !== "string"
    ) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;
    if (payload.iss !== config.jwtIssuer) return null;
    if (payload.aud !== config.jwtAudience) return null;

    return payload as AccessTokenClaims;
  } catch {
    return null;
  }
}

function signJwt(payload: AccessTokenClaims, secret: string): string {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encodeBase64Url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
