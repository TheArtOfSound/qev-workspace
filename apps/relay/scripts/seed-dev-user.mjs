#!/usr/bin/env node
/**
 * Create a local development user. Never run this as a production bootstrap with
 * default credentials.
 *
 * Usage:
 *   SQLITE_PATH=.data/qev-workspace.sqlite node --experimental-sqlite apps/relay/scripts/seed-dev-user.mjs
 *   SEED_EMAIL=dev@qev.local SEED_PASSWORD=dev-password-123 node --experimental-sqlite apps/relay/scripts/seed-dev-user.mjs
 */
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
  console.error("Refusing to seed users while NODE_ENV=production.");
  process.exit(1);
}

const email = (process.env.SEED_EMAIL ?? "dev@qev.local").trim().toLowerCase();
const password = process.env.SEED_PASSWORD ?? "dev-password-123";
const displayName = process.env.SEED_DISPLAY_NAME ?? "Dev User";
const sqlitePath = process.env.SQLITE_PATH ?? ".data/qev-workspace.sqlite";

if (password.length < 8) {
  console.error("SEED_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

mkdirSync(dirname(sqlitePath), { recursive: true });
const db = new DatabaseSync(sqlitePath);
db.exec("PRAGMA foreign_keys = ON;");

const migrationsDir = fileURLToPath(new URL("../src/db/migrations", import.meta.url));
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
  const existing = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(file);
  if (existing) continue;
  const sql = readFileSync(`${migrationsDir}/${file}`, "utf8");
  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const existingUser = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
if (existingUser) {
  console.log(JSON.stringify({ ok: true, alreadyExists: true, user: existingUser }, null, 2));
  process.exit(0);
}

const id = `usr_${randomBytes(12).toString("hex")}`;
const salt = randomBytes(16).toString("base64url");
const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64url");
const passwordHash = `scrypt$16384$8$1$${salt}$${hash}`;
const now = new Date().toISOString();

db.prepare(
  `INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at, disabled_at, email_verified_at)
   VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
).run(id, email, displayName, passwordHash, now, now);

console.log(JSON.stringify({
  ok: true,
  created: true,
  user: { id, email, displayName },
  note: "Development seed only. Do not reuse these credentials in production.",
}, null, 2));

// Keep createHash import meaningful if tooling tree-shakes.
void createHash;
