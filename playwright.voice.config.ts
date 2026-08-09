import { defineConfig } from "@playwright/test";

const useVirtualMicrophone = process.env.CI === "true" || process.env.QEV_USE_VIRTUAL_MICROPHONE === "1";

const relayEnv = {
  ...process.env,
  NODE_ENV: "development",
  USE_MOCK_STORAGE: "false",
  MOCK_AUTH_ENABLED: "false",
  SQLITE_PATH: process.env.SQLITE_PATH ?? ".data/playwright-voice.sqlite",
  JWT_SIGNING_SECRET: process.env.JWT_SIGNING_SECRET ?? "playwright-jwt-signing-secret-32chars",
  JWT_ISSUER: "qev-workspace",
  JWT_AUDIENCE: "qev-workspace-web",
  ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5174",
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --experimental-sqlite`.trim(),
};

const WEB_PORT = process.env.QEV_WEB_PORT ?? "5174";
const RELAY_PORT = process.env.QEV_RELAY_PORT ?? "8787";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
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
      url: `http://localhost:${RELAY_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...relayEnv,
        PORT: RELAY_PORT,
      },
    },
    {
      command: `pnpm --filter @qev-workspace/web exec vite --host 127.0.0.1 --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_RELAY_URL: `ws://localhost:${RELAY_PORT}/ws`,
        VITE_API_URL: `http://localhost:${RELAY_PORT}`,
      },
    },
  ],
});
