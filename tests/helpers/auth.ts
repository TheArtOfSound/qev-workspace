import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

export type TestUser = {
  email: string;
  password: string;
  displayName: string;
  token: string;
  userId: string;
};

const RELAY = process.env.QEV_RELAY_URL ?? "http://localhost:8787";

export async function registerUser(
  request: APIRequestContext,
  overrides?: Partial<Pick<TestUser, "email" | "password" | "displayName">>,
): Promise<TestUser> {
  const email = overrides?.email ?? `user_${Date.now()}_${Math.random().toString(36).slice(2)}@qev.local`;
  const password = overrides?.password ?? "qev-test-password";
  const displayName = overrides?.displayName ?? "Test User";

  const response = await request.post(`${RELAY}/api/auth/register`, {
    data: { email, password, displayName },
  });

  if (!response.ok()) {
    throw new Error(`Registration failed: ${response.status()} ${await response.text()}`);
  }

  const body = await response.json() as {
    token: string;
    user: { id: string; email: string; displayName: string };
  };

  return {
    email,
    password,
    displayName,
    token: body.token,
    userId: body.user.id,
  };
}

export async function loginAs(page: Page, user: Pick<TestUser, "email" | "password">): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(user.email);
  await page.getByTestId("login-password").fill(user.password);
  await page.getByTestId("login-submit").click();
}

export async function seedToken(context: BrowserContext, token: string, room?: { id: string; name: string }): Promise<void> {
  await context.addInitScript(
    ({ nextToken, roomId, roomName }) => {
      localStorage.setItem("qev_token", nextToken);
      if (roomId) {
        localStorage.setItem("currentRoom", roomId);
        localStorage.setItem("currentRoomName", roomName ?? roomId);
      }
    },
    { nextToken: token, roomId: room?.id, roomName: room?.name },
  );
}
