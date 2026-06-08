import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BrowserQevVaultAdapter,
  decryptJson,
  derivePeerSessionKey,
  encryptJson,
} from "../packages/crypto/dist/index.js";
import {
  createEnvelope,
  generateRoomCode,
  safetyNumber,
} from "../packages/protocol/dist/index.js";

if (!globalThis.btoa) {
  globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
}

if (!globalThis.atob) {
  globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
}

const root = process.cwd();
const results = [];

function pass(name, detail) {
  results.push({ status: "PASS", name, detail });
}

function fail(name, detail) {
  results.push({ status: "FAIL", name, detail });
}

async function check(name, fn) {
  try {
    await fn();
    pass(name, "ok");
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function publicDevice(device) {
  return {
    deviceId: device.deviceId,
    displayName: device.displayName,
    publicKeyJwk: device.publicKeyJwk,
    createdAt: device.createdAt,
  };
}

function read(file) {
  const path = resolve(root, file);
  assert(existsSync(path), `missing file: ${file}`);
  return readFileSync(path, "utf8");
}

function includes(file, patterns) {
  const content = read(file);

  for (const pattern of patterns) {
    assert(content.includes(pattern), `${file} missing required pattern: ${pattern}`);
  }
}

await check("crypto: ECDH identities derive matching AES-GCM session keys", async () => {
  const vault = new BrowserQevVaultAdapter();
  const alice = await vault.createDeviceIdentity("Alice");
  const bob = await vault.createDeviceIdentity("Bob");

  const aliceKey = await derivePeerSessionKey(alice, publicDevice(bob));
  const bobKey = await derivePeerSessionKey(bob, publicDevice(alice));

  const encrypted = await encryptJson(aliceKey, {
    kind: "qev.chat.v1",
    body: "offline smoke secret",
    sentAt: new Date().toISOString(),
  });

  assert(encrypted.alg === "ECDH-P256-AES-GCM", "unexpected encrypted payload algorithm");

  const decrypted = await decryptJson(bobKey, encrypted);
  assert(decrypted.body === "offline smoke secret", "Bob could not decrypt Alice payload");
});

await check("crypto: wrong peer key cannot decrypt payload", async () => {
  const vault = new BrowserQevVaultAdapter();
  const alice = await vault.createDeviceIdentity("Alice");
  const bob = await vault.createDeviceIdentity("Bob");
  const mallory = await vault.createDeviceIdentity("Mallory");

  const aliceToBobKey = await derivePeerSessionKey(alice, publicDevice(bob));
  const malloryKey = await derivePeerSessionKey(mallory, publicDevice(alice));

  const encrypted = await encryptJson(aliceToBobKey, {
    kind: "qev.private-proof.v1",
    proofId: "proof_smoke",
  });

  let rejected = false;

  try {
    await decryptJson(malloryKey, encrypted);
  } catch {
    rejected = true;
  }

  assert(rejected, "wrong key decrypted QEV payload");
});

await check("protocol: room code, envelope, and safety number are deterministic enough for UI flow", async () => {
  const roomCode = generateRoomCode();
  assert(/^QEV-\d{4}-[A-Z]+$/.test(roomCode), `bad room code: ${roomCode}`);

  const envelope = createEnvelope("room.create", { test: true }, {
    roomCode,
    senderDeviceId: "dev_a",
  });

  assert(envelope.type === "room.create", "wrong envelope type");
  assert(envelope.roomCode === roomCode, "room code missing from envelope");
  assert(envelope.senderDeviceId === "dev_a", "sender missing from envelope");

  const a = safetyNumber("session_1", "dev_a", "dev_b");
  const b = safetyNumber("session_1", "dev_b", "dev_a");
  assert(a === b, "safety number must be symmetric");
  assert(/^\d{3}-\d{3}-\d{3}$/.test(a), `bad safety number format: ${a}`);
});

await check("static: private app-data path is wired", async () => {
  includes("apps/web/src/webrtc.ts", [
    "qev-private-data",
    "sendEncrypted",
    "onEncryptedData",
    "RTCDataChannel",
  ]);

  includes("apps/web/src/App.tsx", [
    "receiveEncryptedPeerData",
    "sendEncryptedChat",
    "qev.chat.v1",
    "qev.private-proof.v1",
    "verifyPrivateChannel",
    "respondToPrivateProof",
  ]);
});

await check("static: room lock, safety gate, and trusted peer pinning are wired", async () => {
  includes("apps/web/src/App.tsx", [
    "computeRoomLockHash",
    "roomLockHash",
    "canUsePrivateLayer",
    "Verify the QEV safety number",
    "TRUSTED_PEERS_STORAGE_KEY",
    "devicePublicKeyFingerprint",
    "rememberVerifiedPeer",
    "remembered key changed",
  ]);
});

await check("static: local privacy export and burn-room cleanup are wired", async () => {
  includes("apps/web/src/App.tsx", [
    "encryptTranscriptExport",
    "qev-encrypted-transcript-v1",
    "PBKDF2",
    "Clear local session data",
    "burnRoom",
    "clearRoomFromUrl",
    "Room burned locally",
  ]);
});

await check("static: media truth and experimental frame crypto are wired", async () => {
  includes("apps/web/src/mediaPrivacy.ts", [
    "detectMediaPrivacyCapability",
    "WebRTC transport encryption only",
    "QEV frame encryption",
  ]);

  includes("apps/web/src/mediaFrameCrypto.ts", [
    "QEV1",
    "AES-GCM",
    "encryptFrame",
    "decryptFrame",
    "drop frames",
  ]);

  includes("apps/web/src/webrtc.ts", [
    "encodedInsertableStreams",
    "attachFrameEncryptionToSender",
    "attachFrameDecryptionToReceiver",
  ]);
});

await check("static: user-facing organization exists", async () => {
  includes("apps/web/src/App.tsx", [
    "workspace-switcher",
    "theme-switcher",
    "WorkspaceSection",
    "themeMode",
  ]);

  includes("apps/web/src/styles.css", [
    "theme-switcher",
    "workspace-chrome",
    "data-theme",
  ]);
});

const counts = {
  pass: results.filter((item) => item.status === "PASS").length,
  fail: results.filter((item) => item.status === "FAIL").length,
};

mkdirSync(resolve(root, "audit"), { recursive: true });

const markdown = [
  "# QEV Offline Smoke Report",
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
  "This proves the cryptographic and source-wiring prerequisites exist before a browser-to-browser runtime test.",
  "It does not prove the live relay, browser media permissions, or two-browser WebRTC negotiation by itself.",
  "",
].join("\n");

writeFileSync(resolve(root, "audit/qev-offline-smoke-report.md"), markdown);
writeFileSync(resolve(root, "audit/qev-offline-smoke-report.json"), JSON.stringify({ counts, results }, null, 2));

console.log(markdown);

if (counts.fail > 0) process.exit(1);
