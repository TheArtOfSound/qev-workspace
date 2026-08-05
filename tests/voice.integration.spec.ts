import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type RoomResponse = {
  id: string;
  name: string;
};

test("two browser windows exchange real WebRTC audio tracks", async ({ browser, request }) => {
  const roomName = `Voice room ${Date.now()}`;
  const roomResponse = await request.post("http://localhost:8787/rooms", {
    data: {
      name: roomName,
      memberId: "voice-test-owner",
    },
  });

  expect(roomResponse.status()).toBe(201);
  const room = (await roomResponse.json()) as RoomResponse;

  const firstContext = await createVoiceContext(browser.newContext.bind(browser), room);
  const secondContext = await createVoiceContext(browser.newContext.bind(browser), room);

  try {
    const firstPage = await openVoiceRoom(firstContext);
    await expect(firstPage.getByTestId("local-audio-track-count")).toHaveText("1");

    const secondPage = await openVoiceRoom(secondContext);
    await expect(secondPage.getByTestId("local-audio-track-count")).toHaveText("1");

    await expect(firstPage.getByTestId("voice-channel")).toHaveAttribute("data-connection-state", "connected");
    await expect(secondPage.getByTestId("voice-channel")).toHaveAttribute("data-connection-state", "connected");

    await expect(firstPage.getByTestId("remote-audio-track-count")).toHaveText("1");
    await expect(secondPage.getByTestId("remote-audio-track-count")).toHaveText("1");

    await expect.poll(() => getLiveRemoteAudioTrackCount(firstPage)).toBe(1);
    await expect.poll(() => getLiveRemoteAudioTrackCount(secondPage)).toBe(1);

    await firstPage.getByTestId("voice-mute-button").click();
    await expect(firstPage.getByTestId("voice-mute-button")).toHaveText("Unmute");
    await expect(firstPage.getByTestId("voice-status")).toContainText("microphone muted");

    await firstPage.getByTestId("voice-mute-button").click();
    await expect(firstPage.getByTestId("voice-mute-button")).toHaveText("Mute");
    await expect(firstPage.getByTestId("voice-status")).toContainText("microphone live");

    await secondPage.getByTestId("voice-leave-button").click();
    await expect(secondPage.getByTestId("voice-status")).toHaveText("You left the voice channel.");
    await expect(firstPage.getByTestId("voice-status")).toContainText("waiting for another participant");
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});

async function createVoiceContext(
  createContext: (options?: Parameters<import("@playwright/test").Browser["newContext"]>[0]) => Promise<BrowserContext>,
  room: RoomResponse,
): Promise<BrowserContext> {
  const context = await createContext({
    baseURL: "http://localhost:5173",
    permissions: ["microphone"],
  });

  await context.addInitScript(
    ({ roomId, roomName }) => {
      localStorage.setItem("currentRoom", roomId);
      localStorage.setItem("currentRoomName", roomName);
    },
    { roomId: room.id, roomName: room.name },
  );

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
