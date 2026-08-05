import { expect, test } from "@playwright/test";

test("login stores a JWT, opens the app, and remains authenticated after reload", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId("login-view")).toBeVisible();

  await page.getByTestId("login-email").fill("bryan@qev.local");
  await page.getByTestId("login-password").fill("qev-test-password");
  await page.getByTestId("login-submit").click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("room-list")).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem("qev_token"));
  expect(token).toBeTruthy();
  expect(token?.split(".")).toHaveLength(3);

  await page.reload();

  await expect(page.getByTestId("room-list")).toBeVisible();
  await expect(page.getByTestId("login-view")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("qev_token"))).toBe(token);
});
