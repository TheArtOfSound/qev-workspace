import { createServer } from "node:http";
import { existsSync, createReadStream, statSync } from "node:fs";
import { join, normalize, resolve, extname } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export async function startStaticServer({
  rootDir = "apps/web/dist",
  host = "127.0.0.1",
  port = 0,
} = {}) {
  const root = resolve(process.cwd(), rootDir);

  if (!existsSync(root)) {
    throw new Error(`Missing built web output: ${root}. Run pnpm run build:web first.`);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    const pathname = decodeURIComponent(url.pathname);
    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    let filePath = resolve(root, `.${safePath}`);

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(root, "index.html");
    }

    const type = MIME[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": "no-store",
    });

    createReadStream(filePath).pipe(res);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, resolveListen);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Static server did not return a TCP address.");
  }

  const baseUrl = `http://${host}:${address.port}`;

  return {
    baseUrl,
    close: () =>
      new Promise((resolveClose) => {
        server.close(() => resolveClose());
      }),
  };
}
