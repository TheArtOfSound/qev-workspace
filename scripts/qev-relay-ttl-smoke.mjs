import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createEnvelope } from "../packages/protocol/dist/index.js";

const root = process.cwd();
const port = 8799;
const baseUrl = `http://127.0.0.1:${port}`;
const wsUrl = `ws://127.0.0.1:${port}/ws`;
const results = [];

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

function device(id, name) {
  return {
    deviceId: id,
    displayName: name,
    publicKeyJwk: {
      kty: "EC",
      crv: "P-256",
      x: "relay-smoke-x",
      y: "relay-smoke-y",
    },
    createdAt: new Date().toISOString(),
  };
}

function pnpmCmd() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

async function waitForHealth(timeoutMs = 20_000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // wait
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("relay did not become healthy");
}

function openSocket(label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const messages = [];
    const closes = [];

    const timer = setTimeout(() => {
      reject(new Error(`${label} websocket open timeout`));
    }, 10_000);

    ws.addEventListener("open", () => {
      clearTimeout(timer);
      ws.messages = messages;
      ws.closes = closes;
      resolve(ws);
    });

    ws.addEventListener("message", (event) => {
      messages.push(JSON.parse(String(event.data)));
    });

    ws.addEventListener("close", (event) => {
      closes.push({ code: event.code, reason: event.reason });
    });

    ws.addEventListener("error", () => {
      reject(new Error(`${label} websocket error`));
    });
  });
}

function send(ws, message) {
  ws.send(JSON.stringify(message));
}

async function waitForMessage(ws, predicate, label, timeoutMs = 8_000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const found = ws.messages.find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`timeout waiting for ${label}`);
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const relay = spawn(
  pnpmCmd(),
  ["--filter", "@qev-workspace/relay", "start"],
  {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ROOM_TTL_MS: "1000",
      ALLOWED_ORIGINS: "*",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let relayOutput = "";
relay.stdout.on("data", (chunk) => {
  relayOutput += chunk.toString();
});
relay.stderr.on("data", (chunk) => {
  relayOutput += chunk.toString();
});

try {
  await waitForHealth();

  await step("relay: one-peer invite expires after TTL", async () => {
    const host = await openSocket("host-expiring");
    const lateViewer = await openSocket("late-viewer");

    send(host, createEnvelope("room.create", { device: device("dev_host_expiring", "Host Expiring") }, { senderDeviceId: "dev_host_expiring" }));

    const created = await waitForMessage(host, (msg) => msg.type === "room.created", "room.created");
    const roomCode = created.payload.roomCode;

    await delay(1300);

    send(lateViewer, createEnvelope("room.join", { roomCode, device: device("dev_late", "Late Viewer") }, { roomCode, senderDeviceId: "dev_late" }));

    const error = await waitForMessage(
      lateViewer,
      (msg) => msg.type === "error" && msg.payload?.code === "room_not_found_or_expired",
      "late join expiry error",
    );

    assert(error.payload.code === "room_not_found_or_expired", "late join was not rejected as expired");

    host.close(1000, "test_done");
    lateViewer.close(1000, "test_done");
  });

  await step("relay: active two-peer room survives invite TTL", async () => {
    const host = await openSocket("host-active");
    const viewer = await openSocket("viewer-active");

    send(host, createEnvelope("room.create", { device: device("dev_host_active", "Host Active") }, { senderDeviceId: "dev_host_active" }));

    const created = await waitForMessage(host, (msg) => msg.type === "room.created", "room.created");
    const roomCode = created.payload.roomCode;

    send(viewer, createEnvelope("room.join", { roomCode, device: device("dev_viewer_active", "Viewer Active") }, { roomCode, senderDeviceId: "dev_viewer_active" }));

    await waitForMessage(viewer, (msg) => msg.type === "room.joined", "room.joined");
    await waitForMessage(host, (msg) => msg.type === "room.peer_joined", "room.peer_joined");

    await delay(1500);

    send(host, createEnvelope("heartbeat", { smoke: "active-room-still-open" }, { roomCode, senderDeviceId: "dev_host_active" }));

    const heartbeat = await waitForMessage(
      viewer,
      (msg) => msg.type === "heartbeat" && msg.payload?.smoke === "active-room-still-open",
      "heartbeat after invite TTL",
    );

    assert(heartbeat.payload.smoke === "active-room-still-open", "active room did not forward heartbeat after invite TTL");

    host.close(1000, "test_done");
    viewer.close(1000, "test_done");
  });
} finally {
  relay.kill("SIGTERM");
}

const counts = {
  pass: results.filter((item) => item.status === "PASS").length,
  fail: results.filter((item) => item.status === "FAIL").length,
};

mkdirSync(resolve(root, "audit"), { recursive: true });

const markdown = [
  "# QEV Relay TTL Smoke Report",
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
  ...results.map((item) => `| ${item.status} | ${item.name} | ${String(item.detail).replaceAll("\\n", "<br>")} |`),
  "",
  "## Meaning",
  "",
  "This proves the invite/join window expires for unjoined rooms, while an active two-peer room survives past the invite TTL.",
  "",
  "## Relay Output",
  "",
  "```txt",
  relayOutput.trim().slice(-4000),
  "```",
  "",
].join("\\n");

writeFileSync(resolve(root, "audit/qev-relay-ttl-smoke-report.md"), markdown);
writeFileSync(resolve(root, "audit/qev-relay-ttl-smoke-report.json"), JSON.stringify({ counts, results, relayOutput }, null, 2));

console.log(markdown);

if (counts.fail > 0) process.exit(1);
