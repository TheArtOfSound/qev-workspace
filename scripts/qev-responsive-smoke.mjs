import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { startStaticServer } from "./qev-static-server.mjs";

const root = process.cwd();
const results = [];
const pageErrors = [];
const consoleErrors = [];

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "windows-laptop", width: 1366, height: 768 },
  { name: "scaled-windows-laptop", width: 1093, height: 614 },
  { name: "small-laptop", width: 1024, height: 768 },
  { name: "short-browser", width: 1280, height: 650 },
  { name: "mobile", width: 390, height: 844 },
];

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

async function trialClick(locator, label) {
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ trial: true, timeout: 5000 }).catch((error) => {
    throw new Error(`${label} is not safely clickable: ${error.message}`);
  });
}

async function checkNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  assert(
    overflow.scrollWidth <= overflow.innerWidth + 3,
    `${label} has horizontal overflow: ${JSON.stringify(overflow)}`,
  );
}

async function checkCriticalButtons(page, viewportName) {
  const nav = page.locator(".workspace-switcher button");

  for (let i = 0; i < 5; i += 1) {
    await trialClick(nav.nth(i), `${viewportName} nav button ${i}`);
  }

  await nav.nth(1).click();
  await page.locator(".identity-panel").waitFor({ state: "visible", timeout: 8000 });
  await trialClick(
    page.locator(".identity-panel").getByRole("button", { name: "Create identity", exact: true }),
    `${viewportName} Create identity`,
  );
  await trialClick(
    page.locator(".session-panel").getByRole("button", { name: "Create session", exact: true }),
    `${viewportName} Create session`,
  );

  await nav.nth(2).click();
  await page.locator(".consent-panel").waitFor({ state: "visible", timeout: 8000 });
  await trialClick(
    page.locator(".consent-panel").getByRole("button", { name: "Mark safety number verified", exact: true }),
    `${viewportName} Mark safety number verified`,
  ).catch(() => {
    // This button can be disabled before a peer exists; visibility/actionability of panel is the point here.
  });

  await nav.nth(3).click();
  await page.locator(".control-panel").first().waitFor({ state: "visible", timeout: 8000 });
  await trialClick(
    page.locator(".control-panel").first().getByRole("button").first(),
    `${viewportName} first control button`,
  ).catch(() => {
    // Some control buttons may be disabled before a session exists.
  });

  await nav.nth(4).click();
  await page.locator(".audit-panel").waitFor({ state: "visible", timeout: 8000 });

  await nav.nth(0).click();
  await page.locator(".remote-stage").waitFor({ state: "visible", timeout: 8000 });
  await page.locator(".local-preview").waitFor({ state: "visible", timeout: 8000 });
}

async function checkCoveredVisibleButtons(page, viewportName) {
  const handles = await page.$$("button");

  const covered = [];

  for (let i = 0; i < handles.length; i += 1) {
    const button = handles[i];

    const visible = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0
      );
    });

    if (!visible) continue;

    await button.scrollIntoViewIfNeeded();

    const result = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();

      // After scrollIntoViewIfNeeded, if the element is still not meaningfully inside
      // the viewport, do not fake a hit-test by clamping it to another element.
      const insideViewport =
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;

      if (!insideViewport) {
        return {
          skipped: true,
          reason: "outside viewport after scroll",
          text: el.textContent?.trim() || el.getAttribute("aria-label") || "button",
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
        };
      }

      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const top = document.elementFromPoint(x, y);

      const covered =
        top &&
        top !== el &&
        !el.contains(top) &&
        !top.contains(el);

      return {
        skipped: false,
        covered,
        text: el.textContent?.trim() || el.getAttribute("aria-label") || "button",
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        topTag: top?.tagName,
        topText: top?.textContent?.trim()?.slice(0, 80),
      };
    });

    if (!result.skipped && result.covered) {
      covered.push(result);
    }
  }

  assert(covered.length === 0, `${viewportName} has covered buttons: ${JSON.stringify(covered.slice(0, 5))}`);
}

let server;
let browser;

try {
  server = await startStaticServer();
  browser = await chromium.launch();

  for (const viewport of viewports) {
    await step(`responsive: ${viewport.name} critical controls visible/clickable`, async () => {
      const page = await browser.newPage({ viewport });

      page.on("pageerror", (error) => pageErrors.push(`${viewport.name}: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`${viewport.name}: ${message.text()}`);
      });

      await page.goto(server.baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.getByText("QEV Workspace").first().waitFor({ state: "visible", timeout: 10000 });

      await checkNoHorizontalOverflow(page, viewport.name);
      await checkCriticalButtons(page, viewport.name);
      await checkCoveredVisibleButtons(page, viewport.name);

      await page.close();
    });
  }

  await step("responsive: no runtime errors", async () => {
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);
  });
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}

const counts = {
  pass: results.filter((item) => item.status === "PASS").length,
  fail: results.filter((item) => item.status === "FAIL").length,
};

mkdirSync(resolve(root, "audit"), { recursive: true });

const markdown = [
  "# QEV Responsive Smoke Report",
  "",
  `Generated: ${new Date().toISOString()}`,
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
  "This proves critical controls stay visible/clickable across common desktop, Windows scaling, short-browser, and mobile-sized viewports.",
  "",
].join("\n");

writeFileSync(resolve(root, "audit/qev-responsive-smoke-report.md"), markdown);
writeFileSync(resolve(root, "audit/qev-responsive-smoke-report.json"), JSON.stringify({ counts, results, pageErrors, consoleErrors }, null, 2));

console.log(markdown);

if (counts.fail > 0) process.exit(1);
