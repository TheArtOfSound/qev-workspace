import { expect, test } from "@playwright/test";
import { registerUser, seedToken } from "./helpers/auth";

test("room creation, listing, and joining persist across refreshes", async ({ page, request, context }) => {
  const user = await registerUser(request, { displayName: "Room Tester" });
  await seedToken(context, user.token);

  const roomName = `Persistent room ${Date.now()}`;

  await page.goto("/");
  await expect(page.getByTestId("room-list")).toBeVisible();

  await page.getByTestId("room-name-input").fill(roomName);
  await page.getByTestId("create-room-button").click();

  await expect(page.getByTestId("room-view")).toBeVisible();
  await expect(page.getByTestId("room-card").filter({ hasText: roomName })).toBeVisible();

  const activeRoomId = await page.getByTestId("active-room-id").textContent();
  expect(activeRoomId).toBeTruthy();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("currentRoom"))).toBe(activeRoomId);

  await page.reload();
  await expect(page.getByTestId("room-view")).toBeVisible();
  await expect(page.getByTestId("active-room-id")).toHaveText(activeRoomId!);
  await expect(page.getByTestId("room-card").filter({ hasText: roomName })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("qev_token"))).toBeTruthy();
});
