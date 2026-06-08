import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();

const checks = [
  {
    area: "Build system",
    id: "root-build-and-typecheck-scripts",
    file: "package.json",
    severity: "fail",
    why: "The repo needs repeatable commands for build and type validation.",
    must: ['"build:web"', '"typecheck"', '"build:packages"'],
  },
  {
    area: "Web build",
    id: "web-vite-and-tsc-scripts",
    file: "apps/web/package.json",
    severity: "fail",
    why: "The web app must have a deterministic Vite build and TypeScript check.",
    must: ['"build": "vite build"', '"typecheck": "tsc -p tsconfig.json --noEmit"'],
  },
  {
    area: "React mount",
    id: "index-root-and-main-entry",
    file: "apps/web/index.html",
    severity: "fail",
    why: "A blank page often starts with a missing root mount or wrong Vite entry.",
    must: ['<div id="root"></div>', 'src="/src/main.tsx"'],
  },
  {
    area: "Crash protection",
    id: "render-error-boundary",
    file: "apps/web/src/main.tsx",
    severity: "warn",
    why: "The app should show a useful render failure instead of a blank black screen.",
    must: ["QevErrorBoundary", "componentDidCatch", "App render failed"],
  },
  {
    area: "Core crypto",
    id: "app-layer-aes-gcm",
    file: "packages/crypto/src/index.ts",
    severity: "fail",
    why: "QEV private app data depends on peer-derived AES-GCM encryption.",
    must: ["derivePeerSessionKey", "encryptJson", "decryptJson", "AES-GCM"],
  },
  {
    area: "Private peer data",
    id: "webrtc-private-data-channel",
    file: "apps/web/src/webrtc.ts",
    severity: "fail",
    why: "Encrypted chat, private proof, and control intents require a peer data channel.",
    must: ["qev-private-data", "sendEncrypted", "onEncryptedData"],
  },
  {
    area: "Media capability truth",
    id: "media-privacy-detection",
    file: "apps/web/src/mediaPrivacy.ts",
    severity: "fail",
    why: "The UI must honestly distinguish WebRTC transport encryption from QEV frame encryption.",
    must: ["detectMediaPrivacyCapability", "WebRTC transport encryption only", "QEV frame encryption"],
  },
  {
    area: "Frame crypto",
    id: "experimental-frame-crypto-failure-mode",
    file: "apps/web/src/mediaFrameCrypto.ts",
    severity: "warn",
    why: "Experimental frame encryption must fail closed by dropping frames rather than leaking plaintext.",
    must: ["AES-GCM", "QEV1", "drop frames", "encryptFrame", "decryptFrame"],
  },
  {
    area: "Room privacy",
    id: "room-passphrase-lock",
    file: "apps/web/src/App.tsx",
    severity: "fail",
    why: "Room passphrases should gate app-layer private data and not ride inside invite links.",
    must: ["computeRoomLockHash", "roomLockHash", "Share separately from invite link"],
  },
  {
    area: "Safety verification",
    id: "private-actions-gated",
    file: "apps/web/src/App.tsx",
    severity: "fail",
    why: "Screen/video/chat/control must not be trusted until the user verifies the safety number.",
    must: ["canUsePrivateLayer", "Verify the QEV safety number", "safetyVerified"],
  },
  {
    area: "Trusted peers",
    id: "peer-key-pinning",
    file: "apps/web/src/App.tsx",
    severity: "fail",
    why: "Known peers should be locally pinned and key changes should warn the user.",
    must: ["TRUSTED_PEERS_STORAGE_KEY", "devicePublicKeyFingerprint", "rememberVerifiedPeer", "remembered key changed"],
  },
  {
    area: "Private proof",
    id: "encrypted-private-channel-proof",
    file: "apps/web/src/App.tsx",
    severity: "fail",
    why: "Users need a simple proof that the app-layer private channel is actually working.",
    must: ["qev.private-proof.v1", "verifyPrivateChannel", "respondToPrivateProof", "privateChannelStatus"],
  },
  {
    area: "Local privacy",
    id: "encrypted-transcript-export",
    file: "apps/web/src/App.tsx",
    severity: "fail",
    why: "Transcript export must be encrypted locally and never downloaded as plaintext.",
    must: ["encryptTranscriptExport", "PBKDF2", "qev-encrypted-transcript-v1", "Clear local session data"],
  },
  {
    area: "Room lifecycle",
    id: "burn-room-cleanup",
    file: "apps/web/src/App.tsx",
    severity: "fail",
    why: "Users need a clear way to burn a room and clear stale local session state.",
    must: ["burnRoom", "clearRoomFromUrl", "roomLifecycleStatus", "Room burned locally"],
  },
  {
    area: "User organization",
    id: "workspace-tabs-and-theme",
    file: "apps/web/src/App.tsx",
    severity: "fail",
    why: "The app should be navigable by sections and have a visible theme switcher.",
    must: ["WorkspaceSection", "themeMode", "workspace-switcher", "theme-switcher"],
  },
  {
    area: "User organization",
    id: "section-layout-css",
    file: "apps/web/src/styles.css",
    severity: "warn",
    why: "Security/control/workspace pages should not collapse into unreadable long-scroll columns.",
    must: ['data-section="security"', "workspace-chrome", "theme-switcher", "consent-panel", "control-panel"],
  },
];

const truthNotes = [
  {
    title: "Media privacy truth",
    note:
      "QEV chat/control/transcript data can be app-layer encrypted. Browser video/screen media is WebRTC transport-encrypted unless frame crypto successfully attaches. The UI must not claim frame-level QEV media encryption unless the frame crypto status says attached.",
  },
  {
    title: "Relay visibility truth",
    note:
      "The relay may still see signaling metadata such as room code, message type, and timing. It should not receive plaintext QEV encrypted chat/control payloads.",
  },
  {
    title: "Consent truth",
    note:
      "Control must remain explicit, visible, time-limited, and revocable. No silent access, hidden monitoring, or unattended control should be added.",
  },
  {
    title: "Passphrase truth",
    note:
      "The invite link may include the room code. The room passphrase must be shared separately and used to reject mismatched encrypted app-layer data.",
  },
];

function readMaybe(file) {
  const path = resolve(root, file);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

function evaluate(check) {
  const content = readMaybe(check.file);

  if (content === null) {
    return {
      ...check,
      status: check.severity === "fail" ? "FAIL" : "WARN",
      missing: [`missing file: ${check.file}`],
    };
  }

  const missing = check.must.filter((pattern) => !content.includes(pattern));

  if (missing.length === 0) {
    return { ...check, status: "PASS", missing: [] };
  }

  return {
    ...check,
    status: check.severity === "fail" ? "FAIL" : "WARN",
    missing,
  };
}

const results = checks.map(evaluate);
const counts = {
  pass: results.filter((r) => r.status === "PASS").length,
  warn: results.filter((r) => r.status === "WARN").length,
  fail: results.filter((r) => r.status === "FAIL").length,
};

const generatedAt = new Date().toISOString();

mkdirSync(resolve(root, "audit"), { recursive: true });

const markdown = [
  "# QEV Workspace Audit Report",
  "",
  `Generated: ${generatedAt}`,
  "",
  "## Summary",
  "",
  `- PASS: ${counts.pass}`,
  `- WARN: ${counts.warn}`,
  `- FAIL: ${counts.fail}`,
  "",
  counts.fail === 0
    ? "**Gate:** PASS — no required audit checks failed."
    : "**Gate:** FAIL — required checks failed. Do not claim the build is complete until these are fixed.",
  "",
  "## Checks",
  "",
  "| Status | Area | Check | File | Why | Missing |",
  "|---|---|---|---|---|---|",
  ...results.map((r) => {
    const missing = r.missing.length ? r.missing.map((m) => `\`${m}\``).join("<br>") : "—";
    return `| ${r.status} | ${r.area} | ${r.id} | \`${r.file}\` | ${r.why} | ${missing} |`;
  }),
  "",
  "## Truth Notes",
  "",
  ...truthNotes.flatMap((item) => [`### ${item.title}`, "", item.note, ""]),
  "## Next Manual Audit",
  "",
  "1. Open the app in two browsers.",
  "2. Create a room.",
  "3. Join from the second browser.",
  "4. Verify the safety number.",
  "5. Start screen/video.",
  "6. Send encrypted chat.",
  "7. Run private-channel proof.",
  "8. Export encrypted transcript and confirm no plaintext chat appears in the JSON.",
  "9. Burn the room and confirm room code, URL, media, chat, grants, and passphrase clear.",
  "",
].join("\n");

writeFileSync(resolve(root, "audit/qev-audit-report.md"), markdown);
writeFileSync(
  resolve(root, "audit/qev-audit-report.json"),
  JSON.stringify({ generatedAt, counts, results, truthNotes }, null, 2),
);

console.log(markdown);

if (counts.fail > 0) {
  process.exitCode = 1;
}
