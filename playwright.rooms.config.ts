import { defineConfig } from "@playwright/test";

const relayEnv = {
  ...process.env,
  NODE_ENV: "development",
  USE_MOCK_STORAGE: "false",
  MOCK_AUTH_ENABLED: "false",
  SQLITE_PATH: process.env.SQLITE_PATH ?? ".data/playwright-rooms.sqlite",
  JWT_SIGNING_SECRET: process.env.JWT_SIGNING_SECRET ?? "playwright-jwt-signing-secret-32chars",
  JWT_ISSUER: "qev-workspace",
  JWT_AUDIENCE: "qev-workspace-web",
  ALLOWED_ORIGINS: "http://localhost:5173",
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --experimental-sqlite`.trim(),
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @qev-workspace/relay dev",
      url: "http://localhost:8787/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: relayEnv,
    },
    {
      command: "pnpm --filter @qev-workspace/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_RELAY_URL: "ws://localhost:8787/ws",
        VITE_API_URL: "http://localhost:8787",
      },
    },
  ],
});
