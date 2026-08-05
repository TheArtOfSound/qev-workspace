import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerMockChatRoutes, resetMockChat } from "./mockChat.js";
import { mockRooms, registerMockRoomRoutes } from "./mockRooms.js";

test("room messages can be sent and retrieved chronologically", async (context) => {
  mockRooms.splice(0, mockRooms.length);
  resetMockChat();

  const app = Fastify();
  registerMockRoomRoutes(app);
  registerMockChatRoutes(app);
  context.after(async () => app.close());

  const roomResponse = await app.inject({
    method: "POST",
    url: "/rooms",
    payload: { name: "Chat test room", memberId: "member_owner" },
  });

  assert.equal(roomResponse.statusCode, 201);
  const room = roomResponse.json<{ id: string }>();

  const firstResponse = await app.inject({
    method: "POST",
    url: `/rooms/${room.id}/messages`,
    payload: { sender: "Bryan", content: "First message" },
  });

  assert.equal(firstResponse.statusCode, 201);
  const firstMessage = firstResponse.json<{ sender: string; timestamp: number; content: string }>();
  assert.equal(firstMessage.sender, "Bryan");
  assert.equal(firstMessage.content, "First message");
  assert.equal(typeof firstMessage.timestamp, "number");

  await new Promise((resolve) => setTimeout(resolve, 2));

  const secondResponse = await app.inject({
    method: "POST",
    url: `/rooms/${room.id}/messages`,
    payload: { sender: "Ani", content: "Second message" },
  });

  assert.equal(secondResponse.statusCode, 201);

  const listResponse = await app.inject({
    method: "GET",
    url: `/rooms/${room.id}/messages`,
  });

  assert.equal(listResponse.statusCode, 200);
  const messages = listResponse.json<Array<{ sender: string; timestamp: number; content: string }>>();
  assert.deepEqual(
    messages.map(({ sender, content }) => ({ sender, content })),
    [
      { sender: "Bryan", content: "First message" },
      { sender: "Ani", content: "Second message" },
    ],
  );
  assert.ok(messages[0].timestamp <= messages[1].timestamp);
});

test("messages are isolated by room and unknown rooms are rejected", async (context) => {
  mockRooms.splice(0, mockRooms.length);
  resetMockChat();

  const app = Fastify();
  registerMockRoomRoutes(app);
  registerMockChatRoutes(app);
  context.after(async () => app.close());

  const firstRoom = (
    await app.inject({ method: "POST", url: "/rooms", payload: { name: "First" } })
  ).json<{ id: string }>();
  const secondRoom = (
    await app.inject({ method: "POST", url: "/rooms", payload: { name: "Second" } })
  ).json<{ id: string }>();

  await app.inject({
    method: "POST",
    url: `/rooms/${firstRoom.id}/messages`,
    payload: { sender: "Bryan", content: "Only in first" },
  });

  const secondRoomMessages = await app.inject({
    method: "GET",
    url: `/rooms/${secondRoom.id}/messages`,
  });
  assert.deepEqual(secondRoomMessages.json(), []);

  const missingRoomResponse = await app.inject({
    method: "POST",
    url: "/rooms/missing/messages",
    payload: { sender: "Bryan", content: "Should fail" },
  });
  assert.equal(missingRoomResponse.statusCode, 404);
  assert.deepEqual(missingRoomResponse.json(), { error: "room_not_found" });
});
