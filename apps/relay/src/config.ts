export type AppConfig = {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  useMockStorage: boolean;
  mockAuthEnabled: boolean;
  databaseUrl: string | null;
  sqlitePath: string;
  jwtSigningSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  allowedOrigins: Set<string>;
  webOrigin: string | null;
  roomTtlMs: number;
  turnUrl: string | null;
  turnUsername: string | null;
  turnCredential: string | null;
  turnCredentialTtlSeconds: number;
  bodyLimitBytes: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  authRateLimitMax: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";
  const useMockStorage = parseBoolean(env.USE_MOCK_STORAGE, false);
  const mockAuthEnabled = parseBoolean(env.MOCK_AUTH_ENABLED, !isProduction && useMockStorage);

  const jwtSigningSecret =
    env.JWT_SIGNING_SECRET?.trim()
    || (isProduction ? "" : env.MOCK_JWT_SECRET?.trim() || "qev-development-jwt-secret-change-me");

  if (isProduction) {
    if (useMockStorage) {
      throw new Error("USE_MOCK_STORAGE must be false in production.");
    }
    if (mockAuthEnabled) {
      throw new Error("MOCK_AUTH_ENABLED must be false in production.");
    }
    if (!jwtSigningSecret || jwtSigningSecret.length < 32) {
      throw new Error("JWT_SIGNING_SECRET must be set to a secret of at least 32 characters in production.");
    }
    if (!env.DATABASE_URL?.trim() && !env.SQLITE_PATH?.trim()) {
      throw new Error("Production requires DATABASE_URL (postgres) or SQLITE_PATH (single-instance SQLite).");
    }
  }

  return {
    port: Number(env.PORT ?? 8787),
    nodeEnv,
    isProduction,
    useMockStorage,
    mockAuthEnabled,
    databaseUrl: env.DATABASE_URL?.trim() || null,
    sqlitePath: env.SQLITE_PATH?.trim()
      || (env.DATABASE_URL?.startsWith("file:") ? env.DATABASE_URL.replace(/^file:/, "") : "")
      || ".data/qev-workspace.sqlite",
    jwtSigningSecret,
    jwtIssuer: env.JWT_ISSUER?.trim() || "qev-workspace",
    jwtAudience: env.JWT_AUDIENCE?.trim() || "qev-workspace-web",
    accessTokenTtlSeconds: Number(env.ACCESS_TOKEN_TTL_SECONDS ?? 15 * 60),
    refreshTokenTtlSeconds: Number(env.REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 14),
    allowedOrigins: parseAllowedOrigins(
      env.ALLOWED_ORIGINS ?? env.ALLOWED_ORIGIN ?? env.WEB_ORIGIN ?? "http://localhost:5173,https://theartofsound.github.io",
    ),
    webOrigin: env.WEB_ORIGIN?.trim() || null,
    roomTtlMs: Number(env.ROOM_TTL_MS ?? 5 * 60 * 1000),
    turnUrl: env.TURN_URL?.trim() || env.VITE_TURN_URL?.trim() || null,
    turnUsername: env.TURN_USERNAME?.trim() || null,
    turnCredential: env.TURN_CREDENTIAL?.trim() || null,
    turnCredentialTtlSeconds: Number(env.TURN_CREDENTIAL_TTL_SECONDS ?? 60 * 60),
    bodyLimitBytes: Number(env.BODY_LIMIT_BYTES ?? 64 * 1024),
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    rateLimitMax: Number(env.RATE_LIMIT_MAX ?? 120),
    authRateLimitMax: Number(env.AUTH_RATE_LIMIT_MAX ?? 20),
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseAllowedOrigins(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

export function isAllowedOrigin(origin: string, allowed: Set<string>): boolean {
  const normalized = origin.trim().replace(/\/$/, "");
  return allowed.has("*") || allowed.has(normalized);
}
