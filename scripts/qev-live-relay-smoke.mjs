import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { startStaticServer } from "./qev-static-server.mjs";

const root = process.cwd();
const results = [];
const pageErrors = [];
const consoleErrors = [];

let staticServer = null;
let browser = null;
let pageA = null;
let pageB = null;

const GLOBAL_TIMEOUT_MS = 420_000;
const globalTimeout = setTimeout(() => {
  console.error(`[live] HARD TIMEOUT after ${GLOBAL_TIMEOUT_MS / 1000}s`);
  process.exit(124);
}, GLOBAL_TIMEOUT_MS);

function record(status, name, detail = "ok") {
  results.push({ status, name, detail });
}

async function step(name, fn) {
  console.log(`[live] START ${name}`);

  try {
    await fn();
    console.log(`[live] PASS  ${name}`);
    record("PASS", name);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(`[live] FAIL  ${name}: ${detail}`);
    record("FAIL", name, detail);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tab(page, name) {
  const indexByName = {
    Workspace: 0,
    Setup: 1,
    Security: 2,
    Control: 3,
    Logs: 4,
  };

  const index = indexByName[name];

  if (index === undefined) {
    throw new Error(`Unknown QEV rail tab: ${name}`);
  }

  return page.locator(".workspace-switcher button").nth(index).click();
}

function panelButton(page, panel, name) {
  return page.locator(panel).getByRole("button", { name, exact: true });
}

async function clickPanelButton(page, panel, name) {
  await panelButton(page, panel, name).click();
}

async function waitPanelButtonEnabled(page, panel, name, timeout = 60_000) {
  await page.waitForFunction(
    ({ panel, name }) => {
      const root = document.querySelector(panel);
      if (!root) return false;
      const button = [...root.querySelectorAll("button")].find((item) => item.textContent?.trim() === name);
      return Boolean(button && !button.disabled);
    },
    { panel, name },
    { timeout },
  );
}

async function waitTextContent(page, text, timeout = 60_000) {
  await page.waitForFunction(
    (expected) => document.body.textContent?.includes(expected),
    text,
    { timeout },
  );
}

async function waitInputValue(page, selector, predicateSource, timeout = 60_000) {
  await page.waitForFunction(
    ({ selector, predicateSource }) => {
      const input = document.querySelector(selector);
      if (!(input instanceof HTMLInputElement)) return false;
      const predicate = new Function("value", `return (${predicateSource})(value);`);
      return Boolean(predicate(input.value));
    },
    { selector, predicateSource },
    { timeout },
  );
}

async function screenshotOnFailure() {
  const failed = results.some((item) => item.status === "FAIL");
  if (!failed) return;

  try {
    if (pageA) await pageA.screenshot({ path: resolve(root, "audit/qev-live-page-a.png"), fullPage: true });
    if (pageB) await pageB.screenshot({ path: resolve(root, "audit/qev-live-page-b.png"), fullPage: true });
  } catch {
    // Screenshot failure should not hide the real test result.
  }
}

function writeReport() {
  const counts = {
    pass: results.filter((item) => item.status === "PASS").length,
    fail: results.filter((item) => item.status === "FAIL").length,
  };

  mkdirSync(resolve(root, "audit"), { recursive: true });

  const markdown = [
    "# QEV Live Relay Headless Smoke Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Base URL: ${staticServer?.baseUrl ?? "not started"}`,
    "",
    `PASS: ${counts.pass}`,
    `FAIL: ${counts.fail}`,
    "",
    "## Results",
    "",
    "| Status | Check | Detail |",
    "|---|---|---|",
    ...results.map((item) => `| ${item.status} | ${item.name} | ${String(item.detail).replaceAll("\n", "<br>")} |`),
    "",
    "## Meaning",
    "",
    "This test uses two isolated headless Chromium browser contexts, the production web build, the configured live relay, fake camera/mic devices, safety verification, WebRTC media startup, and the encrypted private-channel proof.",
    "",
    "A pass means the browser + relay + QEV key + media/data-channel path is actually connecting in automation.",
    "",
    "A failure report is still written even when the runner fails early.",
    "",
    "Important: this runner serves the local production build from http://localhost:5173 because the hosted relay allowlist accepts that origin. Random 127.0.0.1 ports are expected to fail the relay origin gate.",
    "",
    "## Browser Errors",
    "",
    `Page errors: ${pageErrors.length ? pageErrors.join(" | ") : "none"}`,
    "",
    `Console errors: ${consoleErrors.length ? consoleErrors.join(" | ") : "none"}`,
    "",
    "## Debug Artifacts",
    "",
    results.some((item) => item.status === "FAIL")
      ? "- audit/qev-live-page-a.png\n- audit/qev-live-page-b.png"
      : "No failure screenshots needed.",
    "",
  ].join("\n");

  writeFileSync(resolve(root, "audit/qev-live-relay-smoke-report.md"), markdown);
  writeFileSync(
    resolve(root, "audit/qev-live-relay-smoke-report.json"),
    JSON.stringify({ counts, results, pageErrors, consoleErrors, baseUrl: staticServer?.baseUrl ?? null }, null, 2),
  );

  console.log(markdown);

  if (counts.fail > 0) process.exitCode = 1;
}

try {
  staticServer = await startStaticServer({
    host: "localhost",
    port: 5173,
  });

  browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const contextA = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 920 } });

  await contextA.grantPermissions(["camera", "microphone"], { origin: staticServer.baseUrl });
  await contextB.grantPermissions(["camera", "microphone"], { origin: staticServer.baseUrl });

  pageA = await contextA.newPage();
  pageB = await contextB.newPage();

  for (const page of [pageA, pageB]) {
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
  }

  let roomCode = "";

  await step("live: load two independent production app contexts", async () => {
    console.log(`[live] serving production build from ${staticServer.baseUrl}`);

    await pageA.goto(staticServer.baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await pageB.goto(staticServer.baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await pageA.getByText("QEV Workspace").first().waitFor({ state: "visible", timeout: 10_000 });
    await pageB.getByText("QEV Workspace").first().waitFor({ state: "visible", timeout: 10_000 });

    const bodyA = await pageA.locator("body").innerText();
    const bodyB = await pageB.locator("body").innerText();

    assert(bodyA.includes("Consent-first remote workspace"), "browser A did not render QEV app");
    assert(bodyB.includes("Consent-first remote workspace"), "browser B did not render QEV app");
  });

  await step("live: browser A creates identity and room through relay", async () => {
    await tab(pageA, "Setup");
    await clickPanelButton(pageA, ".identity-panel", "Create identity");
    await waitTextContent(pageA, "dev_", 10_000);

    await clickPanelButton(pageA, ".session-panel", "Create session");

    await waitInputValue(
      pageA,
      'input[placeholder="QEV-1234-ALPHA"]',
      '(value) => /^QEV-\\d{4}-[A-Z]+$/.test(value)',
      120_000,
    );

    roomCode = await pageA.locator('input[placeholder="QEV-1234-ALPHA"]').inputValue();
    assert(/^QEV-\d{4}-[A-Z]+$/.test(roomCode), `bad room code from relay: ${roomCode}`);
  });

  await step("live: browser B creates identity and joins room through relay", async () => {
    assert(roomCode, "browser A did not create a room code");

    await tab(pageB, "Setup");
    await clickPanelButton(pageB, ".identity-panel", "Create identity");
    await waitTextContent(pageB, "dev_", 10_000);

    await pageB.locator('input[placeholder="QEV-1234-ALPHA"]').fill(roomCode);
    await waitPanelButtonEnabled(pageB, ".session-panel", "Join session", 30_000);
    await clickPanelButton(pageB, ".session-panel", "Join session");
  });

  await step("live: both browsers establish QEV key with peer", async () => {
    await tab(pageA, "Security");
    await tab(pageB, "Security");

    await pageA.waitForFunction(
      () => document.querySelector(".shell")?.getAttribute("data-qev-key") === "established",
      null,
      { timeout: 120_000 },
    );

    await pageB.waitForFunction(
      () => document.querySelector(".shell")?.getAttribute("data-qev-key") === "established",
      null,
      { timeout: 120_000 },
    );

    await pageA.waitForFunction(
      () => document.querySelector(".shell")?.getAttribute("data-peer-connected") === "true",
      null,
      { timeout: 30_000 },
    );

    await pageB.waitForFunction(
      () => document.querySelector(".shell")?.getAttribute("data-peer-connected") === "true",
      null,
      { timeout: 30_000 },
    );
  });

  await step("live: safety verification unlocks private actions", async () => {
    await waitPanelButtonEnabled(pageA, ".consent-panel", "Mark safety number verified", 30_000);
    await waitPanelButtonEnabled(pageB, ".consent-panel", "Mark safety number verified", 30_000);

    await clickPanelButton(pageA, ".consent-panel", "Mark safety number verified");
    await clickPanelButton(pageB, ".consent-panel", "Mark safety number verified");

    await waitTextContent(pageA, "Private actions are unlocked", 30_000);
    await waitTextContent(pageB, "Private actions are unlocked", 30_000);
  });

  await step("live: fake-camera private video starts and peer data channel opens", async () => {
    await tab(pageA, "Setup");
    await waitPanelButtonEnabled(pageA, ".session-panel", "Start private video call", 60_000);
    await clickPanelButton(pageA, ".session-panel", "Start private video call");

    await pageA.waitForFunction(
      () => document.body.textContent?.includes("QEV peer data channel opened."),
      null,
      { timeout: 120_000 },
    );

    await pageB.waitForFunction(
      () => document.body.textContent?.includes("QEV peer data channel opened."),
      null,
      { timeout: 120_000 },
    );
  });

  await step("live: encrypted private-channel proof completes", async () => {
    await tab(pageA, "Security");

    await waitPanelButtonEnabled(pageA, ".consent-panel", "Verify private channel", 60_000);
    await pageA.waitForTimeout(750);
    await clickPanelButton(pageA, ".consent-panel", "Verify private channel");

    await pageA.waitForFunction(
      () => document.querySelector(".shell")?.getAttribute("data-private-channel") === "verified",
      null,
      { timeout: 60_000 },
    );
  });

  await step("live: no browser runtime errors", async () => {
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);
  });
} catch (error) {
  record("FAIL", "live: fatal runner error", error instanceof Error ? error.message : String(error));
} finally {
  await screenshotOnFailure();

  if (browser) await browser.close();
  if (staticServer) await staticServer.close();

  clearTimeout(globalTimeout);
  writeReport();
}
