import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { startStaticServer } from "./qev-static-server.mjs";

const root = process.cwd();
const results = [];
const consoleErrors = [];
const pageErrors = [];

function record(status, name, detail = "ok") {
  results.push({ status, name, detail });
}

async function step(name, fn) {
  try {
    await fn();
    record("PASS", name);
  } catch (error) {
    record("FAIL", name, error instanceof Error ? error.message : String(error));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let staticServer;
let browser;

try {
  staticServer = await startStaticServer();

  browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });

  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 920,
    },
  });

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await step("ui: app renders production build without blank page", async () => {
    await page.goto(staticServer.baseUrl, { waitUntil: "networkidle" });

    await page.getByText("QEV Workspace").first().waitFor({
      state: "visible",
      timeout: 10_000,
    });

    const bodyText = await page.locator("body").innerText();
    assert(bodyText.includes("Consent-first remote workspace"), "main app copy did not render");
    assert(!bodyText.includes("App render failed"), "error boundary is showing render failure");
  });

  await step("ui: theme switcher works", async () => {
    await page.locator(".theme-switcher").getByRole("button", { name: "Light" }).click();
    assert(
      (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light",
      "light theme did not apply",
    );

    await page.locator(".theme-switcher").getByRole("button", { name: "Dark" }).click();
    assert(
      (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark",
      "dark theme did not apply",
    );

    await page.locator(".theme-switcher").getByRole("button", { name: "System" }).click();
    assert(
      (await page.evaluate(() => document.documentElement.hasAttribute("data-theme"))) === false,
      "system theme did not clear data-theme",
    );
  });

  await step("ui: setup can create local identity", async () => {
    await page.locator(".workspace-switcher button").nth(1).click();
    await page.locator(".identity-panel").getByRole("button", { name: "Create identity", exact: true }).click();

    await page.waitForFunction(() => document.body.innerText.includes("dev_"), null, {
      timeout: 8_000,
    });
  });

  await step("ui: security tab is readable and not smashed", async () => {
    await page.locator(".workspace-switcher button").nth(2).click();

    await page.getByText("Consent state").waitFor({
      state: "visible",
      timeout: 8_000,
    });

    const layout = await page.evaluate(() => {
      const panel = document.querySelector(".consent-panel");
      if (!panel) return { ok: false, reason: "missing .consent-panel" };

      const rect = panel.getBoundingClientRect();
      const kvWidths = [...panel.querySelectorAll(":scope > .kv")].map((el) => el.getBoundingClientRect().width);
      const tinyRows = kvWidths.filter((width) => width < 150).length;

      return {
        ok: rect.width >= 520 && tinyRows === 0,
        rectWidth: rect.width,
        tinyRows,
        kvWidths,
      };
    });

    assert(layout.ok, `security layout is still squeezed: ${JSON.stringify(layout)}`);
  });

  await step("ui: control tab is organized into usable panels", async () => {
    await page.locator(".workspace-switcher button").nth(3).click();

    await page.locator(".control-panel").first().waitFor({
      state: "visible",
      timeout: 8_000,
    });

    const layout = await page.evaluate(() => {
      const panels = [...document.querySelectorAll(".control-panel")]
        .filter((panel) => getComputedStyle(panel).display !== "none")
        .map((panel) => panel.getBoundingClientRect().width);

      return {
        panels,
        ok: panels.length >= 2 && panels.every((width) => width >= 320),
      };
    });

    assert(layout.ok, `control panels are not usable: ${JSON.stringify(layout)}`);
  });

  await step("ui: logs tab renders audit trail", async () => {
    await page.locator(".workspace-switcher button").nth(4).click();

    await page.getByText("Audit").waitFor({
      state: "visible",
      timeout: 8_000,
    });

    await page.getByText("No session active.").waitFor({
      state: "visible",
      timeout: 8_000,
    });
  });

  await step("ui: no browser runtime errors", async () => {
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);
  });
} finally {
  if (browser) await browser.close();
  if (staticServer) await staticServer.close();
}

const counts = {
  pass: results.filter((item) => item.status === "PASS").length,
  fail: results.filter((item) => item.status === "FAIL").length,
};

mkdirSync(resolve(root, "audit"), { recursive: true });

const markdown = [
  "# QEV Headless UI Smoke Report",
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
  "## Browser Errors",
  "",
  `Page errors: ${pageErrors.length ? pageErrors.join(" | ") : "none"}`,
  "",
  `Console errors: ${consoleErrors.length ? consoleErrors.join(" | ") : "none"}`,
  "",
].join("\n");

writeFileSync(resolve(root, "audit/qev-ui-smoke-report.md"), markdown);
writeFileSync(resolve(root, "audit/qev-ui-smoke-report.json"), JSON.stringify({ counts, results, pageErrors, consoleErrors }, null, 2));

console.log(markdown);

if (counts.fail > 0) process.exit(1);
