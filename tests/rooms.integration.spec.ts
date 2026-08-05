import { expect, test } from "@playwright/test";

const TEST_TOKEN = "test.header.signature";

test("room creation, listing, and joining persist across refreshes", async ({ page }) => {
  const roomName = `Persistent room ${Date.now()}`;

  await page.addInitScript((token) => localStorage.setItem("qev_token", token), TEST_TOKEN);
  await page.goto("/");
  await expect(page.getByTestId("room-list")).toBeVisible();

  await page.getByTestId("room-name-input").fill(roomName);
  await page.getByTestId("create-room-button").click();

  const roomCard = page.getByTestId("room-card").filter({ hasText: roomName });
  await expect(roomCard).toBeVisible();

  await page.reload();
  const refreshedRoomCard = page.getByTestId("room-card").filter({ hasText: roomName });
  await expect(refreshedRoomCard).toBeVisible();

  await refreshedRoomCard.getByRole("button", { name: "Join" }).click();
  await expect(page.getByTestId("room-view")).toBeVisible();

  const activeRoomId = await page.getByTestId("active-room-id").textContent();
  expect(activeRoomId).toBeTruthy();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("currentRoom"))).toBe(activeRoomId);

  await page.reload();
  await expect(page.getByTestId("room-view")).toBeVisible();
  await expect(page.getByTestId("active-room-id")).toHaveText(activeRoomId!);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("qev_token"))).toBe(TEST_TOKEN);
});
