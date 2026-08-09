import { expect, test } from "@playwright/test";

test("login stores a JWT, opens the app, and remains authenticated after reload", async ({ page }) => {
  const email = `auth_${Date.now()}@qev.local`;
  const password = "qev-test-password";

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId("login-view")).toBeVisible();

  await page.getByTestId("switch-to-register").click();
  await page.getByTestId("register-display-name").fill("Auth Tester");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();

  await expect(page.getByTestId("room-list")).toBeVisible();
  await expect(page.getByTestId("session-bar")).toBeVisible();
  await expect(page.getByTestId("session-user-name")).toHaveText("Auth Tester");

  const token = await page.evaluate(() => localStorage.getItem("qev_token"));
  expect(token).toBeTruthy();
  expect(token?.split(".")).toHaveLength(3);

  await page.reload();

  await expect(page.getByTestId("room-list")).toBeVisible();
  await expect(page.getByTestId("login-view")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("qev_token"))).toBeTruthy();

  await page.getByTestId("logout-button").click();
  await expect(page.getByTestId("login-view")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("qev_token"))).toBeNull();
});
