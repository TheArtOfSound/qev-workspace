import { expect, test } from "@playwright/test";
import { registerUser, seedToken } from "./helpers/auth";

const relayBase = () =>
  process.env.QEV_RELAY_URL
  ?? (process.env.QEV_RELAY_PORT ? `http://localhost:${process.env.QEV_RELAY_PORT}` : "http://localhost:8787");

test("invite another user, chat, leave, and rename profile", async ({ browser, request }) => {
  const owner = await registerUser(request, { displayName: "Owner" });
  const guest = await registerUser(request, { displayName: "Guest" });

  // Owner creates a room (server auto-issues invite token on create)
  const create = await request.post(`${relayBase()}/api/rooms`, {
    headers: { authorization: `Bearer ${owner.token}` },
    data: { name: `Flow room ${Date.now()}` },
  });
  expect(create.status()).toBe(201);
  const room = await create.json() as { id: string; name: string; inviteToken?: string };
  expect(room.inviteToken).toBeTruthy();

  // Guest joins via invite API
  const joined = await request.post(`${relayBase()}/api/invites/join`, {
    headers: { authorization: `Bearer ${guest.token}` },
    data: { inviteToken: room.inviteToken },
  });
  expect(joined.ok()).toBeTruthy();

  // Guest posts a message
  const message = await request.post(`${relayBase()}/api/rooms/${room.id}/messages`, {
    headers: { authorization: `Bearer ${guest.token}` },
    data: { content: "hello from guest" },
  });
  expect(message.status()).toBe(201);
  const body = await message.json() as { sender: string; content: string };
  expect(body.sender).toBe("Guest");
  expect(body.content).toBe("hello from guest");

  // Members list includes both
  const members = await request.get(`${relayBase()}/api/rooms/${room.id}/members`, {
    headers: { authorization: `Bearer ${owner.token}` },
  });
  expect(members.ok()).toBeTruthy();
  const list = await members.json() as Array<{ displayName: string }>;
  expect(list.map((m) => m.displayName).sort()).toEqual(["Guest", "Owner"]);

  // Profile rename
  const renamed = await request.patch(`${relayBase()}/api/auth/me`, {
    headers: { authorization: `Bearer ${guest.token}` },
    data: { displayName: "Guest Two" },
  });
  expect(renamed.ok()).toBeTruthy();
  const profile = await renamed.json() as { token: string; user: { displayName: string } };
  expect(profile.user.displayName).toBe("Guest Two");
  expect(profile.token.split(".")).toHaveLength(3);

  // Leave
  const left = await request.post(`${relayBase()}/api/rooms/${room.id}/leave`, {
    headers: { authorization: `Bearer ${guest.token}` },
  });
  expect(left.status()).toBe(204);

  // Guest can no longer read messages
  const blocked = await request.get(`${relayBase()}/api/rooms/${room.id}/messages`, {
    headers: { authorization: `Bearer ${guest.token}` },
  });
  expect(blocked.status()).toBe(403);
});

test("UI invite button and people list work", async ({ page, request, context }) => {
  const user = await registerUser(request, { displayName: "Host" });
  await seedToken(context, user.token);

  await page.goto("/");
  await page.getByTestId("room-name-input").fill(`UI flow ${Date.now()}`);
  await page.getByTestId("create-room-button").click();
  await expect(page.getByTestId("room-view")).toBeVisible();

  await page.getByTestId("invite-people-button").click();
  await expect(page.getByTestId("invite-bar")).toBeVisible();
  const link = await page.getByTestId("invite-link").textContent();
  expect(link).toContain("invite=");

  await page.getByTestId("people-button").click();
  await expect(page.getByTestId("people-bar")).toBeVisible();
  await expect(page.getByTestId("people-bar")).toContainText("Host");

  await page.getByTestId("open-profile-button").click();
  await expect(page.getByTestId("profile-modal")).toBeVisible();
  await page.getByTestId("profile-name-input").fill("Hosty");
  await page.getByTestId("profile-save-button").click();
  await expect(page.getByTestId("session-user-name")).toHaveText("Hosty");
});
