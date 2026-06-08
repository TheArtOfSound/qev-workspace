import { startStaticServer } from "./qev-static-server.mjs";

const server = await startStaticServer({
  host: "localhost",
  port: 5173,
});

console.log(`QEV production build running at ${server.baseUrl}`);
console.log("Press Ctrl+C to stop.");

await new Promise(() => {});
