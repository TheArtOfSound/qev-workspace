import type { AuthToken, JwtTokenPayload, UserProfile } from "./types";

export const QEV_TOKEN_STORAGE_KEY = "qev_token";
export const PRODUCTION_LOGIN_ENDPOINT = "https://example.com/api/login";

type LoginResponse = {
  token?: unknown;
  user?: unknown;
  error?: unknown;
};

type ImportMetaEnvironment = {
  DEV?: boolean;
  VITE_AUTH_API_URL?: string;
};

export class AuthenticationError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export async function login(email: string, password: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new AuthenticationError("Email and password are required.");
  }

  let response: Response;

  try {
    response = await fetch(resolveLoginEndpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
  } catch (reason) {
    throw new AuthenticationError(
      reason instanceof Error ? `Unable to reach the login service: ${reason.message}` : "Unable to reach the login service.",
    );
  }

  const payload = await readLoginResponse(response);

  if (!response.ok) {
    throw new AuthenticationError(readErrorMessage(payload) ?? "Login failed.", response.status);
  }

  if (typeof payload.token !== "string" || !isJwt(payload.token)) {
    throw new AuthenticationError("The login service returned an invalid JWT.", response.status);
  }

  localStorage.setItem(QEV_TOKEN_STORAGE_KEY, payload.token);
  return payload.token;
}

export function getStoredToken(): AuthToken | null {
  if (typeof localStorage === "undefined") return null;
  const token = localStorage.getItem(QEV_TOKEN_STORAGE_KEY);
  return token && isJwt(token) ? token : null;
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

export function profileFromToken(token: AuthToken): UserProfile | null {
  const payload = decodeToken(token);
  if (!payload) return null;
  return {
    id: payload.sub,
    email: payload.email,
    displayName: payload.name,
  };
}

function resolveLoginEndpoint(): string {
  const environment = (import.meta as ImportMeta & { env?: ImportMetaEnvironment }).env;
  const configured = environment?.VITE_AUTH_API_URL?.trim();
  if (configured) return configured;
  return environment?.DEV ? "/api/login" : PRODUCTION_LOGIN_ENDPOINT;
}

async function readLoginResponse(response: Response): Promise<LoginResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};

  try {
    return await response.json() as LoginResponse;
  } catch {
    return {};
  }
}

function readErrorMessage(payload: LoginResponse): string | null {
  return typeof payload.error === "string" && payload.error.trim() ? payload.error.trim() : null;
}

function isJwt(token: string): boolean {
  return token.split(".").length === 3;
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
