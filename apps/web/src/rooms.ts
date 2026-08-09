import { authorizationHeader, getStoredToken, refreshAccessToken, clearStoredToken } from "./auth";
import type { Room } from "./types";

const CURRENT_ROOM_STORAGE_KEY = "currentRoom";

export function getRelayHttpBaseUrl(): string {
  const fallback = import.meta.env.DEV ? "http://localhost:8787" : "";
  const configured = import.meta.env.VITE_API_URL
    ?? import.meta.env.VITE_ROOMS_URL
    ?? import.meta.env.VITE_RELAY_URL
    ?? fallback;

  if (!configured) {
    throw new Error("Production API URL is not configured. Set VITE_API_URL or VITE_RELAY_URL.");
  }

  return configured
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/ws\/?$/, "")
    .replace(/\/$/, "");
}

export async function relayRequest(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type") && init?.body) {
    headers.set("content-type", "application/json");
  }
  headers.set("accept", "application/json");

  const auth = authorizationHeader();
  for (const [key, value] of Object.entries(auth)) headers.set(key, value);

  const response = await fetch(`${getRelayHttpBaseUrl()}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 401 && getStoredToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryHeaders = new Headers(init?.headers);
      if (!retryHeaders.has("content-type") && init?.body) {
        retryHeaders.set("content-type", "application/json");
      }
      retryHeaders.set("accept", "application/json");
      retryHeaders.set("authorization", `Bearer ${refreshed}`);
      return fetch(`${getRelayHttpBaseUrl()}${path}`, {
        ...init,
        credentials: "include",
        headers: retryHeaders,
      });
    }
    clearStoredToken();
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim();

    try {
      const body = (await response.clone().json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // The status line is sufficient when the response is not JSON.
    }

    throw new Error(`Relay request failed: ${detail}`);
  }

  return response;
}

export async function createRoom(name: string): Promise<Room> {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Room name is required.");

  const response = await relayRequest("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name: normalizedName }),
  });

  return (await response.json()) as Room;
}

export async function getRooms(): Promise<Room[]> {
  const response = await relayRequest("/api/rooms");
  return (await response.json()) as Room[];
}

export async function joinRoom(roomId: string, inviteToken?: string): Promise<Room> {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) throw new Error("Room id is required.");

  const response = await relayRequest(`/api/rooms/${encodeURIComponent(normalizedRoomId)}/join`, {
    method: "POST",
    body: JSON.stringify(inviteToken ? { inviteToken } : {}),
  });

  localStorage.setItem(CURRENT_ROOM_STORAGE_KEY, normalizedRoomId);
  return (await response.json()) as Room;
}

export async function leaveRoomApi(roomId: string): Promise<void> {
  await relayRequest(`/api/rooms/${encodeURIComponent(roomId)}/leave`, {
    method: "POST",
  });
}
