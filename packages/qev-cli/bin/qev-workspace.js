#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { homedir, platform, arch } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

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

  console.log("Download complete. Opening installer...");
  openFile(target);
  console.log(`Web app: ${WEB_URL}`);
}

async function doctor() {
  console.log("QEV Workspace doctor");
  console.log(`Node: ${process.version}`);
  console.log(`Platform: ${platform()} ${arch()}`);
  console.log(`Release: ${RELEASE_URL}`);

  const release = await fetchRelease();
  console.log(`GitHub release: ${release.name || release.tag_name || "found"}`);

  const asset = pickInstallerAsset(release.assets || []);
  if (asset) console.log(`Matching installer: ${asset.name}`);
  else {
    console.log("Matching installer: missing for this platform");
    console.log("Available assets:");
    for (const item of release.assets || []) console.log(`- ${item.name}`);
  }
}

function status() {
  console.log("QEV Workspace status");
  console.log(`Platform: ${platform()} ${arch()}`);
  console.log(`Web app: ${WEB_URL}`);

  if (platform() === "darwin") {
    const macPath = "/Applications/QEV Host.app";
    console.log(`Mac app path: ${macPath}`);
    console.log(`Installed hint: ${existsSync(macPath) ? "yes" : "not found"}`);
  }
}

function help() {
  console.log(`QEV Workspace CLI

Usage:
  npx qev-workspace install
  qev install
  qev doctor
  qev open-release
  qev open-web
  qev status`);
}

async function fetchRelease() {
  const res = await fetch(API_RELEASE_URL, {
    headers: {
      "User-Agent": "qev-workspace-cli",
      "Accept": "application/vnd.github+json"
    }
  });

  if (!res.ok) throw new Error(`GitHub release request failed: ${res.status} ${res.statusText}`);
  return await res.json();
}

function pickInstallerAsset(assets) {
  const names = assets.filter((asset) => typeof asset?.name === "string");

  if (platform() === "darwin") {
    return names.find((asset) => /\.dmg$/i.test(asset.name)) || null;
  }

  if (platform() === "win32") {
    return (
      names.find((asset) => /\.exe$/i.test(asset.name) && /setup|nsis|x64|x86_64/i.test(asset.name)) ||
      names.find((asset) => /\.msi$/i.test(asset.name)) ||
      names.find((asset) => /\.exe$/i.test(asset.name)) ||
      null
    );
  }

  return null;
}

async function download(url, target) {
  const res = await fetch(url, { headers: { "User-Agent": "qev-workspace-cli" } });
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(target));
}

function safeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");
}

function openUrl(url) {
  if (platform() === "darwin") return spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  if (platform() === "win32") return spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  return spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function openFile(filePath) {
  if (platform() === "darwin") return spawn("open", [filePath], { detached: true, stdio: "ignore" }).unref();
  if (platform() === "win32") return spawn(filePath, [], { detached: true, stdio: "ignore" }).unref();
  return spawn("xdg-open", [filePath], { detached: true, stdio: "ignore" }).unref();
}
