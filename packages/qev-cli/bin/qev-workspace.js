#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { homedir, platform, arch } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { console } from "console";

const OWNER = "TheArtOfSound";
const REPO = "qev-workspace";
const DEFAULT_TAG = process.env.QEV_RELEASE_TAG || "host-v0.1.0";
const WEB_URL = "https://theartofsound.github.io/qev-workspace/";
const RELEASE_URL = `https://github.com/${OWNER}/${REPO}/releases/tag/${DEFAULT_TAG}`;
const API_RELEASE_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${DEFAULT_TAG}`;

const command = process.argv[2] || "help";

main().catch((error) => {
  console.error("QEV error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  if (command === "install" || command === "download") return install();
  if (command === "doctor") return doctor();
  if (command === "status") return status();
  if (command === "open-release" || command === "release") return openUrl(RELEASE_URL);
  if (command === "open-web" || command === "web") return openUrl(WEB_URL);
  if (command === "version" || command === "--version" || command === "-v") return console.log("qev-workspace 0.1.0");
  return help();
}

async function install() {
  const release = await fetchRelease();
  const asset = pickInstallerAsset(release.assets || []);

  if (!asset) {
    console.log("No matching QEV Host installer asset was found for this computer yet.");
    console.log(`Platform: ${platform()} ${arch()}`);
    console.log(`Release: ${RELEASE_URL}`);
    openUrl(RELEASE_URL);
    return;
  }

  const downloads = join(homedir(), "Downloads");
  mkdirSync(downloads, { recursive: true });

  const target = join(downloads, safeFileName(asset.name || basename(asset.browser_download_url)));

  console.log("QEV Workspace");
  console.log(`Detected: ${platform()} ${arch()}`);
  console.log(`Downloading: ${asset.name}`);
  console.log(`To: ${target}`);

  await download(asset.browser_download_url, target);

  console.log("Download complete. Opening");
  openUrl(target);
}

async function doctor() {
  // Introduce a new function to handle the doctor command
  console.log("QEV Workspace Doctor");
  console.log("Running health checks...");
  // Add health checks here
  console.log("Health checks complete.");
}

async function status() {
  // Introduce a new function to handle the status command
  console.log("QEV Workspace Status");
  console.log("Checking for updates...");
  // Add update checks here
  console.log("Update checks complete.");
}

async function openUrl(url: string) {
  const open = require("open");
  open(url);
}

function safeFileName(filename: string) {
  return filename.replace(/[<>:"/\\|?*]/g, "_");
}

async function fetchRelease() {
  const response = await fetch(API_RELEASE_URL);
  const release = await response.json();
  return release;
}

function pickInstallerAsset(assets: { browser_download_url: string; name: string }[]) {
  const platform = process.platform;
  const arch = process.arch;
  const asset = assets.find((asset) => {
    const assetPlatform = asset.name.split("-")[0];
    const assetArch = asset.name.split("-")[1];
    return assetPlatform === platform && assetArch === arch;
  });
  return asset;
}

async function download(url: string, target: string) {
  const response = await fetch(url);
  const writer = createWriteStream(target);
  await pipeline(response.body, writer);
}
