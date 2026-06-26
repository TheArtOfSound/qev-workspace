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

const validCommands = ["install", "download", "doctor", "status", "open-release", "release", "open-web", "web", "version", "--version", "-v", "help"];

const command = process.argv[2] || "help";

if (!validCommands.includes(command)) {
  console.error(`Unknown command: ${command}`);
  console.error("Try 'qev-workspace --help' for a list of available commands.");
  process.exit(1);
}

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

// ... rest of the code remains the same ...
