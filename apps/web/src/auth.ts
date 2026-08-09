import type { AuthToken, JwtTokenPayload, UserProfile } from "./types";

export const QEV_TOKEN_STORAGE_KEY = "qev_token";

type AuthResponse = {
  token?: unknown;
  user?: unknown;
  error?: unknown;
  expiresAt?: unknown;
};

type ImportMetaEnvironment = {
  DEV?: boolean;
  PROD?: boolean;
  MODE?: string;
  VITE_AUTH_API_URL?: string;
  VITE_API_URL?: string;
  VITE_RELAY_URL?: string;
  VITE_ROOMS_URL?: string;
};

export class AuthenticationError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export async function register(email: string, password: string, displayName?: string): Promise<string> {
  return authenticateAt("/api/auth/register", email, password, displayName);
}

export async function login(email: string, password: string): Promise<string> {
  return authenticateAt("/api/auth/login", email, password);
}

async function authenticateAt(
  path: string,
  email: string,
  password: string,
  displayName?: string,
): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new AuthenticationError("Email and password are required.");
  }

  let response: Response;
  try {
    response = await fetch(resolveAuthUrl(path), {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        ...(displayName ? { displayName } : {}),
      }),
    });
  } catch (reason) {
    throw new AuthenticationError(
      reason instanceof Error ? `Unable to reach the login service: ${reason.message}` : "Unable to reach the login service.",
    );
  }

  const payload = await readAuthResponse(response);
  if (!response.ok) {
    throw new AuthenticationError(readErrorMessage(payload) ?? "Login failed.", response.status);
  }

  if (typeof payload.token !== "string" || !isJwtShape(payload.token)) {
    throw new AuthenticationError("The login service returned an invalid JWT.", response.status);
  }

  if (!isAccessTokenValid(payload.token)) {
    throw new AuthenticationError("The login service returned an expired JWT.", response.status);
  }

  localStorage.setItem(QEV_TOKEN_STORAGE_KEY, payload.token);
  return payload.token;
}

export async function refreshAccessToken(): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(resolveAuthUrl("/api/auth/refresh"), {
      method: "POST",
      credentials: "include",
      headers: { accept: "application/json" },
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    clearStoredToken();
    return null;
  }

  const payload = await readAuthResponse(response);
  if (typeof payload.token !== "string" || !isAccessTokenValid(payload.token)) {
    clearStoredToken();
    return null;
  }

  localStorage.setItem(QEV_TOKEN_STORAGE_KEY, payload.token);
  return payload.token;
}

export async function logout(): Promise<void> {
  try {
    await fetch(resolveAuthUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json",
        ...authorizationHeader(),
      },
    });
  } catch {
    // Local logout still proceeds.
  } finally {
    clearStoredToken();
  }
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const token = getStoredToken();
  if (!token) return null;

  let response: Response;
  try {
    response = await fetch(resolveAuthUrl("/api/auth/me"), {
      method: "GET",
      credentials: "include",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return profileFromToken(token);
  }

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return null;
    return fetchCurrentUser();
  }

  if (!response.ok) return null;
  const payload = await readAuthResponse(response);
  const user = payload.user as Partial<UserProfile> | undefined;
  if (!user || typeof user.id !== "string" || typeof user.email !== "string" || typeof user.displayName !== "string") {
    return profileFromToken(token);
  }
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export function getStoredToken(): AuthToken | null {
  if (typeof localStorage === "undefined") return null;
  const token = localStorage.getItem(QEV_TOKEN_STORAGE_KEY);
  if (!token || !isAccessTokenValid(token)) {
    if (token) clearStoredToken();
    return null;
  }
  return token;
}

export function clearStoredToken(): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(QEV_TOKEN_STORAGE_KEY);
}

export function decodeToken(token: AuthToken): JwtTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Partial<JwtTokenPayload>;
    if (
      typeof payload.sub !== "string"
      || typeof payload.email !== "string"
      || typeof payload.name !== "string"
      || typeof payload.iat !== "number"
      || typeof payload.exp !== "number"
    ) {
      return null;
    }
    return payload as JwtTokenPayload;
  } catch {
    return null;
  }
}

export function isAccessTokenValid(token: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!isJwtShape(token)) return false;
  const payload = decodeToken(token);
  if (!payload) return false;
  // Small skew allowance for clock drift.
  return payload.exp > nowSeconds + 5;
}

export function profileFromToken(token: AuthToken): UserProfile | null {
  const payload = decodeToken(token);
  if (!payload || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return {
    id: payload.sub,
    email: payload.email,
    displayName: payload.name,
  };
}

export function authorizationHeader(): Record<string, string> {
  const token = getStoredToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function resolveAuthUrl(path: string): string {
  const environment = readRuntimeEnv();
  const configured = environment.VITE_AUTH_API_URL?.trim()
    || environment.VITE_API_URL?.trim()
    || "";

  if (configured) {
    return joinUrl(configured, path);
  }

  if (environment.DEV) {
    // Vite proxies /api to the local relay during development.
    return path.startsWith("/") ? path : `/${path}`;
  }

  // Production builds must not silently fall back to example.com.
  const relay = environment.VITE_RELAY_URL?.trim() || environment.VITE_ROOMS_URL?.trim();
  if (relay) {
    const httpBase = relay
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:")
      .replace(/\/ws\/?$/, "")
      .replace(/\/$/, "");
    return joinUrl(httpBase, path);
  }

  throw new ConfigurationError(
    "Production authentication is not configured. Set VITE_AUTH_API_URL (or VITE_API_URL / VITE_RELAY_URL) at build time.",
  );
}

function readRuntimeEnv(): ImportMetaEnvironment {
  const metaEnv = (import.meta as ImportMeta & { env?: ImportMetaEnvironment }).env ?? {};
  // process.env fallback supports unit tests (import.meta.env is module-local under Node).
  const proc = typeof process !== "undefined" ? process.env : undefined;
  const devFromProcess = proc?.VITE_DEV === "true" || proc?.NODE_ENV === "development";
  return {
    DEV: typeof metaEnv.DEV === "boolean" ? metaEnv.DEV : devFromProcess,
    PROD: typeof metaEnv.PROD === "boolean" ? metaEnv.PROD : proc?.NODE_ENV === "production",
    MODE: metaEnv.MODE ?? proc?.NODE_ENV,
    VITE_AUTH_API_URL: metaEnv.VITE_AUTH_API_URL ?? proc?.VITE_AUTH_API_URL,
    VITE_API_URL: metaEnv.VITE_API_URL ?? proc?.VITE_API_URL,
    VITE_RELAY_URL: metaEnv.VITE_RELAY_URL ?? proc?.VITE_RELAY_URL,
    VITE_ROOMS_URL: metaEnv.VITE_ROOMS_URL ?? proc?.VITE_ROOMS_URL,
  };
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedBase = base.replace(/\/$/, "");
  if (normalizedBase.endsWith("/api") && path.startsWith("/api/")) {
    return `${normalizedBase.slice(0, -4)}${path}`;
  }
  if (path.startsWith("/")) return `${normalizedBase}${path}`;
  return `${normalizedBase}/${path}`;
}

async function readAuthResponse(response: Response): Promise<AuthResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  try {
    return await response.json() as AuthResponse;
  } catch {
    return {};
  }
}

function readErrorMessage(payload: AuthResponse): string | null {
  return typeof payload.error === "string" && payload.error.trim() ? payload.error.trim() : null;
}

function isJwtShape(token: string): boolean {
  return token.split(".").length === 3 && token.split(".").every((part) => part.length > 0);
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);

  if (typeof atob === "function") {
    return decodeURIComponent(
      Array.from(atob(`${normalized}${padding}`), (character) =>
        `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
      ).join(""),
    );
  }

  const bufferConstructor = (globalThis as typeof globalThis & {
    Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } };
  }).Buffer;

  if (!bufferConstructor) throw new Error("No base64 decoder is available.");
  return bufferConstructor.from(`${normalized}${padding}`, "base64").toString("utf8");
}
