import { spawn } from "node:child_process";
import process from "node:process";
import WebSocket from "ws";
import {
  createEnvelope,
  createId,
  type ProtocolEnvelope,
} from "@qev-workspace/protocol";

type ControlIntent =
  | {
      kind: "pointer.move";
      grantId: string;
      x: number;
      y: number;
      at: string;
    }
  | {
      kind: "pointer.click";
      grantId: string;
      x: number;
      y: number;
      button: "left";
      at: string;
    }
  | {
      kind: "keyboard.intent";
      grantId: string;
      key: string;
      code: string;
      at: string;
    };

type AgentConfig = {
  relayUrl: string;
  roomCode: string;
  displayName: string;
  screenWidth: number;
  screenHeight: number;
  grantId: string;
  grantExpiresAt: number;
};

const config = readConfig();

console.log("");
console.log("QEV HOST AGENT — VISIBLE CONTROL MODE");
console.log("No silent access. No unattended control. No hidden monitoring.");
console.log("");
console.log(`Relay: ${config.relayUrl}`);
console.log(`Room: ${config.roomCode}`);
console.log(`Host: ${config.displayName}`);
console.log(`Grant: ${config.grantId}`);
console.log(`Grant expires: ${new Date(config.grantExpiresAt).toLocaleString()}`);
console.log("");
console.log("Emergency stop: press CTRL+C in this Terminal.");
console.log("");

const deviceId = createId("host_agent");
const ws = new WebSocket(config.relayUrl);

ws.on("open", () => {
  console.log("Relay connected.");

  ws.send(
    JSON.stringify(
      createEnvelope(
        "room.join",
        {
          roomCode: config.roomCode,
          device: {
            deviceId,
            displayName: `${config.displayName} Host Agent`,
            publicKeyJwk: {},
            createdAt: new Date().toISOString(),
          },
        },
        {
          roomCode: config.roomCode,
          senderDeviceId: deviceId,
        },
      ),
    ),
  );
});

ws.on("message", (raw) => {
  let message: ProtocolEnvelope;

  try {
    message = JSON.parse(String(raw)) as ProtocolEnvelope;
  } catch {
    console.warn("Ignored malformed relay message.");
    return;
  }

  if (message.type !== "control.intent") return;

  const intent = message.payload as ControlIntent;
  void handleControlIntent(intent);
});

ws.on("close", () => {
  console.log("Relay closed.");
});

ws.on("error", (error) => {
  console.error("Relay error:", error.message);
});

process.on("SIGINT", () => {
  console.log("");
  console.log("Emergency stop received. Closing QEV host agent.");
  try {
    ws.close(1000, "host_agent_stopped");
  } catch {
    // ignore
  }
  process.exit(0);
});

async function handleControlIntent(intent: ControlIntent): Promise<void> {
  if (!isGrantActive(intent.grantId)) {
    console.warn("Rejected control intent: inactive or mismatched grant.");
    return;
  }

  if (intent.kind === "pointer.move") {
    const { x, y } = toScreenPoint(intent.x, intent.y);
    await cliclick(["m:" + x + "," + y]);
    console.log(`pointer.move ${x},${y}`);
    return;
  }

  if (intent.kind === "pointer.click") {
    const { x, y } = toScreenPoint(intent.x, intent.y);
    await cliclick(["c:" + x + "," + y]);
    console.log(`pointer.click ${x},${y}`);
    return;
  }

  if (intent.kind === "keyboard.intent") {
    console.warn(`Keyboard intent blocked in v0 agent: ${intent.key}`);
  }
}

function isGrantActive(grantId: string): boolean {
  if (grantId !== config.grantId) return false;
  if (Date.now() > config.grantExpiresAt) return false;
  return true;
}

function toScreenPoint(nx: number, ny: number): { x: number; y: number } {
  const safeX = Math.min(1, Math.max(0, nx));
  const safeY = Math.min(1, Math.max(0, ny));

  return {
    x: Math.round(safeX * config.screenWidth),
    y: Math.round(safeY * config.screenHeight),
  };
}

function cliclick(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("cliclick", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `cliclick exited with ${code}`));
    });
  });
}

function readConfig(): AgentConfig {
  const relayUrl = process.env.QEV_RELAY_URL ?? "wss://qev-workspace.onrender.com/ws";
  const roomCode = requireEnv("QEV_ROOM_CODE");
  const displayName = process.env.QEV_DISPLAY_NAME ?? "QEV User";
  const screenWidth = Number(process.env.QEV_SCREEN_WIDTH ?? "1440");
  const screenHeight = Number(process.env.QEV_SCREEN_HEIGHT ?? "900");
  const grantId = requireEnv("QEV_GRANT_ID");
  const grantMinutes = Number(process.env.QEV_GRANT_MINUTES ?? "5");

  return {
    relayUrl,
    roomCode,
    displayName,
    screenWidth,
    screenHeight,
    grantId,
    grantExpiresAt: Date.now() + grantMinutes * 60 * 1000,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
