import { defineConfig } from "@playwright/test";

const useVirtualMicrophone = process.env.CI === "true" || process.env.QEV_USE_VIRTUAL_MICROPHONE === "1";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    launchOptions: {
      args: useVirtualMicrophone
        ? [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
          ]
        : ["--autoplay-policy=no-user-gesture-required"],
    },
  },
  webServer: [
    {
      command: "pnpm --filter @qev-workspace/relay dev",
      url: "http://localhost:8787/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @qev-workspace/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
