import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, "../src/db/migrations");
const target = join(root, "../dist/db/migrations");

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`Copied migrations to ${target}`);
