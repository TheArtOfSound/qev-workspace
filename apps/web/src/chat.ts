import { relayRequest } from "./rooms";
import type { ChatMessage } from "./types";

export async function getMessages(roomId: string, options?: { before?: string; limit?: number }): Promise<ChatMessage[]> {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) throw new Error("Room id is required.");

  const params = new URLSearchParams();
  if (options?.before) params.set("before", options.before);
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString() ? `?${params.toString()}` : "";

  const response = await relayRequest(`/api/rooms/${encodeURIComponent(normalizedRoomId)}/messages${query}`);
  const messages = (await response.json()) as ChatMessage[];

  return dedupeAndSort(messages);
}

export async function sendMessage(roomId: string, content: string): Promise<ChatMessage> {
  const normalizedRoomId = roomId.trim();
  const normalizedContent = content.trim();

  if (!normalizedRoomId) throw new Error("Room id is required.");
  if (!normalizedContent) throw new Error("Message content is required.");

  const response = await relayRequest(`/api/rooms/${encodeURIComponent(normalizedRoomId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: normalizedContent }),
  });

  return (await response.json()) as ChatMessage;
}

function dedupeAndSort(messages: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of messages) {
    const key = message.id ?? `${message.timestamp}:${message.sender}:${message.content}`;
    byId.set(key, message);
  }

  return [...byId.values()].sort((left, right) => {
    if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
    return (left.id ?? "").localeCompare(right.id ?? "");
  });
}
