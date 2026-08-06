import { expect, test } from "@playwright/test";
import { registerUser, seedToken } from "./helpers/auth";

test("sending room messages updates the UI and survives refresh", async ({ page, request, context }) => {
  const user = await registerUser(request, { displayName: "Bryan" });
  await seedToken(context, user.token);

  const roomName = `Chat room ${Date.now()}`;
  const firstContent = `First chat message ${Date.now()}`;
  const secondContent = `Second chat message ${Date.now()}`;

  await page.goto("/");
  await page.getByTestId("room-name-input").fill(roomName);
  await page.getByTestId("create-room-button").click();

  const roomCard = page.getByTestId("room-card").filter({ hasText: roomName });
  await expect(roomCard).toBeVisible();
  await roomCard.getByRole("button", { name: "Join" }).click();

  await expect(page.getByTestId("chat-box")).toBeVisible();
  await expect(page.getByTestId("chat-sender-label")).toContainText("Bryan");

  await page.getByTestId("chat-message-input").fill(firstContent);
  await page.getByTestId("chat-send-button").click();
  await expect(page.getByTestId("chat-message").filter({ hasText: firstContent })).toBeVisible();

  await page.getByTestId("chat-message-input").fill(secondContent);
  await page.getByTestId("chat-send-button").click();
  await expect(page.getByTestId("chat-message").filter({ hasText: secondContent })).toBeVisible();

  const renderedMessages = await page.getByTestId("chat-message").allTextContents();
  expect(renderedMessages.findIndex((message) => message.includes(firstContent))).toBeLessThan(
    renderedMessages.findIndex((message) => message.includes(secondContent)),
  );

  const roomId = await page.getByTestId("active-room-id").textContent();
  expect(roomId).toBeTruthy();

  const apiResponse = await request.get(
    `http://127.0.0.1:8787/api/rooms/${encodeURIComponent(roomId!)}/messages`,
    {
      headers: { authorization: `Bearer ${user.token}` },
    },
  );
  expect(apiResponse.ok()).toBeTruthy();
  const storedMessages = await apiResponse.json() as Array<{
    id: string;
    sender: string;
    timestamp: number;
    content: string;
  }>;

  expect(storedMessages.map((message) => message.content)).toEqual([firstContent, secondContent]);
  expect(storedMessages.every((message) => message.sender === "Bryan")).toBeTruthy();
  expect(storedMessages.every((message) => Boolean(message.id))).toBeTruthy();
  expect(storedMessages[0].timestamp).toBeLessThanOrEqual(storedMessages[1].timestamp);

  await page.reload();
  await expect(page.getByTestId("chat-box")).toBeVisible();
  await expect(page.getByTestId("chat-message").filter({ hasText: firstContent })).toBeVisible();
  await expect(page.getByTestId("chat-message").filter({ hasText: secondContent })).toBeVisible();
});
