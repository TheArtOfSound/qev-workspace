import { relayRequest } from "./rooms";
import type { ChatMessage } from "./types";

export async function getMessages(roomId: string): Promise<ChatMessage[]> {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) throw new Error("Room id is required.");

  const response = await relayRequest(`/rooms/${encodeURIComponent(normalizedRoomId)}/messages`);
  const messages = (await response.json()) as ChatMessage[];

  return [...messages].sort((left, right) => left.timestamp - right.timestamp);
}

export async function sendMessage(
  roomId: string,
  input: Pick<ChatMessage, "sender" | "content">,
): Promise<ChatMessage> {
  const normalizedRoomId = roomId.trim();
  const sender = input.sender.trim();
  const content = input.content.trim();

  if (!normalizedRoomId) throw new Error("Room id is required.");
  if (!sender) throw new Error("Sender name is required.");
  if (!content) throw new Error("Message content is required.");

  const response = await relayRequest(`/rooms/${encodeURIComponent(normalizedRoomId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ sender, content }),
  });

  return (await response.json()) as ChatMessage;
}
