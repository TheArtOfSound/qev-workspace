import { authorizationHeader, getStoredToken, refreshAccessToken, clearStoredToken } from "./auth";
import type { Room } from "./types";

const CURRENT_ROOM_STORAGE_KEY = "currentRoom";
const CURRENT_ROOM_NAME_STORAGE_KEY = "currentRoomName";

export type RoomMember = {
  userId: string;
  role: string;
  joinedAt: string;
  displayName: string;
  email: string;
};

export type InviteResult = {
  token: string;
  expiresAt: string;
  roomId: string;
};

export function getRelayHttpBaseUrl(): string {
  const fallback = import.meta.env.DEV ? "http://localhost:8787" : "";
  const configured = import.meta.env.VITE_API_URL
    ?? import.meta.env.VITE_ROOMS_URL
    ?? import.meta.env.VITE_RELAY_URL
    ?? fallback;

  if (!configured) {
    throw new Error("Can't reach the server. Try again later.");
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
      // status line is enough
    }
    throw new Error(friendlyRoomError(detail));
  }

  return response;
}

function friendlyRoomError(detail: string): string {
  switch (detail) {
    case "forbidden":
      return "You don't have access to that.";
    case "invite_invalid":
      return "That invite link is invalid.";
    case "invite_expired":
      return "That invite link expired. Ask for a new one.";
    case "room_not_found":
      return "Room not found.";
    case "not_a_member":
      return "You're not in that room.";
    case "rate_limited":
      return "Too many tries. Wait a moment.";
    default:
      return detail.startsWith("Relay request failed") ? detail : `Couldn't do that: ${detail}`;
  }
}

export async function createRoom(name: string): Promise<Room & { inviteToken?: string }> {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Give the room a name.");

  const response = await relayRequest("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name: normalizedName }),
  });

  return (await response.json()) as Room & { inviteToken?: string };
}

export async function getRooms(): Promise<Room[]> {
  const response = await relayRequest("/api/rooms");
  return (await response.json()) as Room[];
}

export async function joinRoom(roomId: string, inviteToken?: string): Promise<Room> {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) throw new Error("Room is missing.");

  const response = await relayRequest(`/api/rooms/${encodeURIComponent(normalizedRoomId)}/join`, {
    method: "POST",
    body: JSON.stringify(inviteToken ? { inviteToken } : {}),
  });

  localStorage.setItem(CURRENT_ROOM_STORAGE_KEY, normalizedRoomId);
  return (await response.json()) as Room;
}

export async function joinWithInvite(inviteToken: string): Promise<Room> {
  const token = inviteToken.trim();
  if (!token) throw new Error("Invite is missing.");

  const response = await relayRequest("/api/invites/join", {
    method: "POST",
    body: JSON.stringify({ inviteToken: token }),
  });

  const room = (await response.json()) as Room;
  localStorage.setItem(CURRENT_ROOM_STORAGE_KEY, room.id);
  localStorage.setItem(CURRENT_ROOM_NAME_STORAGE_KEY, room.name);
  return room;
}

export async function leaveRoomApi(roomId: string): Promise<void> {
  await relayRequest(`/api/rooms/${encodeURIComponent(roomId)}/leave`, {
    method: "POST",
  });
  localStorage.removeItem(CURRENT_ROOM_STORAGE_KEY);
  localStorage.removeItem(CURRENT_ROOM_NAME_STORAGE_KEY);
}

export async function listRoomMembers(roomId: string): Promise<RoomMember[]> {
  const response = await relayRequest(`/api/rooms/${encodeURIComponent(roomId)}/members`);
  return (await response.json()) as RoomMember[];
}

export async function createRoomInvite(roomId: string): Promise<InviteResult> {
  const response = await relayRequest(`/api/rooms/${encodeURIComponent(roomId)}/invites`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return (await response.json()) as InviteResult;
}

export function buildInviteLink(roomId: string, inviteToken: string): string {
  const url = new URL(window.location.href);
  // Keep app base path; replace query.
  url.search = "";
  url.hash = "";
  url.searchParams.set("invite", inviteToken);
  url.searchParams.set("room", roomId);
  return url.toString();
}
