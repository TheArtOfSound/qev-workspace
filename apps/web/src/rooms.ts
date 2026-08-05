import type { Room } from "./types";

const CURRENT_ROOM_STORAGE_KEY = "currentRoom";
const MEMBER_STORAGE_KEY = "qev.workspace.memberId";

function getRoomsBaseUrl(): string {
  const fallback = import.meta.env.DEV ? "http://localhost:8787" : "https://qev-workspace.onrender.com";
  const configured = import.meta.env.VITE_ROOMS_URL ?? import.meta.env.VITE_RELAY_URL ?? fallback;

  return configured
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/ws\/?$/, "")
    .replace(/\/$/, "");
}

function getMemberId(): string {
  const existing = localStorage.getItem(MEMBER_STORAGE_KEY);
  if (existing) return existing;

  const memberId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `member_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(MEMBER_STORAGE_KEY, memberId);
  return memberId;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");

  const response = await fetch(`${getRoomsBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim();

    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // The status line is sufficient when the response is not JSON.
    }

    throw new Error(`Rooms request failed: ${detail}`);
  }

  return response;
}

export async function createRoom(name: string): Promise<Room> {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Room name is required.");

  const response = await request("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: normalizedName,
      memberId: getMemberId(),
    }),
  });

  return (await response.json()) as Room;
}

export async function getRooms(): Promise<Room[]> {
  const response = await request("/rooms");
  return (await response.json()) as Room[];
}

export async function joinRoom(roomId: string): Promise<void> {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) throw new Error("Room id is required.");

  await request(`/rooms/${encodeURIComponent(normalizedRoomId)}/join`, {
    method: "POST",
    body: JSON.stringify({ memberId: getMemberId() }),
  });

  localStorage.setItem(CURRENT_ROOM_STORAGE_KEY, normalizedRoomId);
}
