import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { loadConfig } from "../config.js";
import { openDatabase, runMigrations, setDbForTests } from "../db/client.js";
import { registerAuthRoutes } from "./routes.js";
import { registerRoomRoutes } from "../rooms/routes.js";
import { registerChatRoutes } from "../chat/routes.js";
import { findUserByEmail } from "./users.js";
import { verifyAccessToken } from "./jwt.js";

async function buildApp() {
  process.env.NODE_ENV = "test";
  process.env.USE_MOCK_STORAGE = "false";
  process.env.MOCK_AUTH_ENABLED = "false";
  process.env.JWT_SIGNING_SECRET = "test-jwt-signing-secret-32chars-min!!";
  process.env.SQLITE_PATH = ":memory:";
  process.env.JWT_ISSUER = "qev-workspace-test";
  process.env.JWT_AUDIENCE = "qev-workspace-web-test";

  const config = loadConfig({
    ...process.env,
    NODE_ENV: "test",
    USE_MOCK_STORAGE: "false",
    MOCK_AUTH_ENABLED: "false",
    JWT_SIGNING_SECRET: "test-jwt-signing-secret-32chars-min!!",
    SQLITE_PATH: ":memory:",
    JWT_ISSUER: "qev-workspace-test",
    JWT_AUDIENCE: "qev-workspace-web-test",
  });

  const db = openDatabase(config);
  runMigrations(db);

  const app = Fastify({ logger: false });
  registerAuthRoutes(app, config);
  registerRoomRoutes(app, config);
  registerChatRoutes(app, config);
  await app.ready();

  return { app, config, db };
}

test("register, login, me, rooms, chat authorization and durability", async (context) => {
  const { app, config, db } = await buildApp();
  context.after(async () => {
    await app.close();
    db.close();
    setDbForTests(null);
  });

  const registerResponse = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "alice@qev.local",
      password: "correct-password",
      displayName: "Alice",
    },
  });
  assert.equal(registerResponse.statusCode, 200);
  const registered = registerResponse.json<{ token: string; user: { id: string; email: string } }>();
  assert.ok(registered.token);
  assert.equal(registered.user.email, "alice@qev.local");
  assert.ok(verifyAccessToken(config, registered.token));

  const stored = findUserByEmail("alice@qev.local");
  assert.ok(stored);
  assert.notEqual(stored.password_hash, "correct-password");
  assert.ok(stored.password_hash.startsWith("scrypt$"));

  const badLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "alice@qev.local", password: "wrong-password" },
  });
  assert.equal(badLogin.statusCode, 401);
  assert.deepEqual(badLogin.json(), { error: "Invalid email or password." });

  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "alice@qev.local", password: "correct-password" },
  });
  assert.equal(loginResponse.statusCode, 200);
  const loginBody = loginResponse.json<{ token: string }>();
  const refreshCookie = loginResponse.cookies.find((cookie) => cookie.name === "qev_refresh");
  assert.ok(refreshCookie?.value);

  const me = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { authorization: `Bearer ${loginBody.token}` },
  });
  assert.equal(me.statusCode, 200);

  const unauthRooms = await app.inject({ method: "GET", url: "/api/rooms" });
  assert.equal(unauthRooms.statusCode, 401);

  const roomResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
    headers: { authorization: `Bearer ${loginBody.token}` },
    payload: { name: "Alice Room" },
  });
  assert.equal(roomResponse.statusCode, 201);
  const room = roomResponse.json<{ id: string; members: string[]; role: string }>();
  assert.equal(room.role, "owner");
  assert.ok(room.members.includes(registered.user.id));

  const messageResponse = await app.inject({
    method: "POST",
    url: `/api/rooms/${room.id}/messages`,
    headers: { authorization: `Bearer ${loginBody.token}` },
    payload: { content: "Hello durable world", sender: "spoofed" },
  });
  assert.equal(messageResponse.statusCode, 201);
  const message = messageResponse.json<{ sender: string; content: string; id: string }>();
  assert.equal(message.sender, "Alice");
  assert.equal(message.content, "Hello durable world");
  assert.ok(message.id);

  const bobRegister = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email: "bob@qev.local", password: "correct-password", displayName: "Bob" },
  });
  const bob = bobRegister.json<{ token: string }>();

  const bobRooms = await app.inject({
    method: "GET",
    url: "/api/rooms",
    headers: { authorization: `Bearer ${bob.token}` },
  });
  assert.equal(bobRooms.statusCode, 200);
  assert.deepEqual(bobRooms.json(), []);

  const bobMessages = await app.inject({
    method: "GET",
    url: `/api/rooms/${room.id}/messages`,
    headers: { authorization: `Bearer ${bob.token}` },
  });
  assert.equal(bobMessages.statusCode, 403);

  const bobJoin = await app.inject({
    method: "POST",
    url: `/api/rooms/${room.id}/join`,
    headers: { authorization: `Bearer ${bob.token}` },
    payload: {},
  });
  assert.equal(bobJoin.statusCode, 200);

  const refresh = await app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    cookies: { qev_refresh: refreshCookie!.value },
  });
  assert.equal(refresh.statusCode, 200);
  const refreshed = refresh.json<{ token: string }>();
  assert.ok(verifyAccessToken(config, refreshed.token));

  const logout = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    cookies: { qev_refresh: refresh.cookies.find((cookie) => cookie.name === "qev_refresh")?.value ?? refreshCookie!.value },
  });
  assert.equal(logout.statusCode, 204);

  const refreshAfterLogout = await app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    cookies: { qev_refresh: refreshCookie!.value },
  });
  assert.equal(refreshAfterLogout.statusCode, 401);
});

test("production config rejects mock storage", () => {
  assert.throws(
    () => loadConfig({
      NODE_ENV: "production",
      USE_MOCK_STORAGE: "true",
      JWT_SIGNING_SECRET: "production-secret-at-least-32-characters",
      SQLITE_PATH: ".data/prod.sqlite",
    }),
    /USE_MOCK_STORAGE must be false/,
  );
});
