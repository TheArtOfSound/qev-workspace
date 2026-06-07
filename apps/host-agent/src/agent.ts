import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type Grant = {
  grantId: string;
  expiresAt: string;
  roomCode?: string;
  scopes?: string[];
};

type PointerIntent = {
  kind: "pointer.move" | "pointer.click" | "keyboard.intent";
  grantId: string;
  x?: number;
  y?: number;
  button?: "left";
  key?: string;
};

const PORT = Number(process.env.QEV_LOCAL_AGENT_PORT ?? "39483");
const SCREEN_WIDTH = Number(process.env.QEV_SCREEN_WIDTH ?? "1440");
const SCREEN_HEIGHT = Number(process.env.QEV_SCREEN_HEIGHT ?? "900");

let activeGrant: Grant | null = null;

console.log("");
console.log("QEV LOCAL HOST AGENT");
console.log("Visible local execution bridge. No silent access. No unattended control.");
console.log(`Listening on http://127.0.0.1:${PORT}`);
console.log(`Screen map: ${SCREEN_WIDTH}x${SCREEN_HEIGHT}`);
console.log("Emergency stop: CTRL+C");
console.log("");

const server = createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, {
        ok: true,
        agent: "qev-local-host-agent",
        grantActive: isGrantActive(),
        grantId: activeGrant?.grantId ?? null,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/grant") {
      const body = await readJson<Grant>(req);

      if (!body.grantId || !body.expiresAt) {
        sendJson(res, 400, { ok: false, error: "missing_grant" });
        return;
      }

      activeGrant = body;
      console.log(`Grant armed: ${body.grantId} until ${body.expiresAt}`);
      sendJson(res, 200, { ok: true, grantActive: true });
      return;
    }

    if (req.method === "POST" && req.url === "/intent") {
      const intent = await readJson<PointerIntent>(req);

      if (!activeGrant || !isGrantActive()) {
        sendJson(res, 403, { ok: false, error: "no_active_grant" });
        return;
      }

      if (intent.grantId !== activeGrant.grantId) {
        sendJson(res, 403, { ok: false, error: "grant_mismatch" });
        return;
      }

      if (intent.kind === "keyboard.intent") {
        console.log(`Keyboard blocked: ${intent.key ?? "unknown"}`);
        sendJson(res, 403, { ok: false, error: "keyboard_blocked_in_mvp" });
        return;
      }

      if (typeof intent.x !== "number" || typeof intent.y !== "number") {
        sendJson(res, 400, { ok: false, error: "missing_pointer_coordinates" });
        return;
      }

      const x = Math.round(clamp(intent.x) * SCREEN_WIDTH);
      const y = Math.round(clamp(intent.y) * SCREEN_HEIGHT);

      if (intent.kind === "pointer.move") {
        await runCliclick([`m:${x},${y}`]);
        console.log(`move ${x},${y}`);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (intent.kind === "pointer.click") {
        await runCliclick([`c:${x},${y}`]);
        console.log(`click ${x},${y}`);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (req.method === "POST" && req.url === "/revoke") {
      activeGrant = null;
      console.log("Grant revoked.");
      sendJson(res, 200, { ok: true, grantActive: false });
      return;
    }

    sendJson(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error(message);
    sendJson(res, 500, { ok: false, error: message });
  }
});

server.listen(PORT, "127.0.0.1");

function isGrantActive(): boolean {
  if (!activeGrant) return false;
  return new Date(activeGrant.expiresAt).getTime() > Date.now();
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function runCliclick(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("cliclick", args, { stdio: ["ignore", "pipe", "pipe"] });
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

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += String(chunk);
      if (raw.length > 200_000) {
        reject(new Error("request_too_large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}") as T);
      } catch {
        reject(new Error("invalid_json"));
      }
    });

    req.on("error", reject);
  });
}
