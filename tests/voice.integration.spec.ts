import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { registerUser, seedToken } from "./helpers/auth";

type RoomResponse = {
  id: string;
  name: string;
};

test("two browser windows exchange real WebRTC audio tracks", async ({ browser, request }) => {
  const owner = await registerUser(request, { displayName: "Voice Owner" });
  const guest = await registerUser(request, { displayName: "Voice Guest" });

  const roomName = `Voice room ${Date.now()}`;
  const relayBase = process.env.QEV_RELAY_URL
    ?? (process.env.QEV_RELAY_PORT ? `http://localhost:${process.env.QEV_RELAY_PORT}` : "http://localhost:8787");

  const roomResponse = await request.post(`${relayBase}/api/rooms`, {
    headers: { authorization: `Bearer ${owner.token}` },
    data: { name: roomName },
  });

  expect(roomResponse.status()).toBe(201);
  const room = (await roomResponse.json()) as RoomResponse;

  const joinGuest = await request.post(`${relayBase}/api/rooms/${room.id}/join`, {
    headers: { authorization: `Bearer ${guest.token}` },
    data: {},
  });
  expect(joinGuest.ok()).toBeTruthy();

  const firstContext = await createVoiceContext(browser.newContext.bind(browser), room, owner.token);
  const secondContext = await createVoiceContext(browser.newContext.bind(browser), room, guest.token);

  try {
    const firstPage = await openVoiceRoom(firstContext);
    await firstPage.getByTestId("voice-rejoin-button").click();
    await expect(firstPage.getByTestId("local-audio-track-count")).toHaveText("1");
    await expect(firstPage.getByTestId("voice-participant-limit")).toContainText("2");

    const secondPage = await openVoiceRoom(secondContext);
    await secondPage.getByTestId("voice-rejoin-button").click();
    await expect(secondPage.getByTestId("local-audio-track-count")).toHaveText("1");

    await expect(firstPage.getByTestId("voice-channel")).toHaveAttribute("data-connection-state", "connected");
    await expect(secondPage.getByTestId("voice-channel")).toHaveAttribute("data-connection-state", "connected");

    await expect(firstPage.getByTestId("remote-audio-track-count")).toHaveText("1");
    await expect(secondPage.getByTestId("remote-audio-track-count")).toHaveText("1");

    await expect.poll(() => getLiveRemoteAudioTrackCount(firstPage)).toBe(1);
    await expect.poll(() => getLiveRemoteAudioTrackCount(secondPage)).toBe(1);

    await firstPage.getByTestId("voice-mute-button").click();
    await expect(firstPage.getByTestId("voice-mute-button")).toHaveText("Unmute");
    await expect(firstPage.getByTestId("voice-status")).toContainText("muted");

    await firstPage.getByTestId("voice-mute-button").click();
    await expect(firstPage.getByTestId("voice-mute-button")).toHaveText("Mute");

    await secondPage.getByTestId("voice-leave-button").click();
    await expect(secondPage.getByTestId("voice-status")).toHaveText("Not in voice");
    await expect(firstPage.getByTestId("voice-status")).toContainText("waiting");
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});

async function createVoiceContext(
  createContext: (options?: Parameters<import("@playwright/test").Browser["newContext"]>[0]) => Promise<BrowserContext>,
  room: RoomResponse,
  token: string,
): Promise<BrowserContext> {
  const context = await createContext({
    baseURL: process.env.QEV_WEB_BASE_URL ?? "http://localhost:5174",
    permissions: ["microphone"],
  });

  await seedToken(context, token, room);
  return context;
}

async function openVoiceRoom(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("room-view")).toBeVisible();
  await expect(page.getByTestId("voice-channel")).toBeVisible();
  return page;
}

async function getLiveRemoteAudioTrackCount(page: Page): Promise<number> {
  return page.getByTestId("remote-audio").evaluate((element) => {
    const audio = element as HTMLAudioElement;
    const stream = audio.srcObject;
    if (!(stream instanceof MediaStream)) return 0;
    return stream.getAudioTracks().filter((track) => track.readyState === "live").length;
  });
}
