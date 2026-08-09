import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../config.js";

export type SqlValue = string | number | null | bigint | Uint8Array;

export type DbClient = {
  kind: "sqlite";
  exec(sql: string): void;
  run(sql: string, params?: SqlValue[]): { changes: number; lastInsertRowid: number | bigint };
  get<T extends Record<string, unknown>>(sql: string, params?: SqlValue[]): T | undefined;
  all<T extends Record<string, unknown>>(sql: string, params?: SqlValue[]): T[];
  transaction<T>(fn: () => T): T;
  close(): void;
};

let activeDb: DbClient | null = null;

export function getDb(): DbClient {
  if (!activeDb) throw new Error("Database has not been initialized.");
  return activeDb;
}

export function setDbForTests(db: DbClient | null): void {
  activeDb = db;
}

export function openDatabase(config: AppConfig): DbClient {
  if (config.databaseUrl && isPostgresUrl(config.databaseUrl)) {
    throw new Error(
      "PostgreSQL DATABASE_URL support is planned; set SQLITE_PATH for the current production SQLite deployment path, or use a file: DATABASE_URL.",
    );
  }

  const path = resolveSqlitePath(config);
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA journal_mode = WAL;");

  const db: DbClient = {
    kind: "sqlite",
    exec(sql) {
      sqlite.exec(sql);
    },
    run(sql, params = []) {
      const statement = sqlite.prepare(sql);
      const result = statement.run(...params);
      return {
        changes: Number(result.changes ?? 0),
        lastInsertRowid: result.lastInsertRowid ?? 0,
      };
    },
    get<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      const statement = sqlite.prepare(sql);
      return statement.get(...params) as T | undefined;
    },
    all<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      const statement = sqlite.prepare(sql);
      return statement.all(...params) as T[];
    },
    transaction<T>(fn: () => T): T {
      sqlite.exec("BEGIN");
      try {
        const value = fn();
        sqlite.exec("COMMIT");
        return value;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      sqlite.close();
    },
  };

  activeDb = db;
  return db;
}

export function runMigrations(db: DbClient): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationsDir = fileURLToPath(new URL("./migrations", import.meta.url));
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const existing = db.get<{ id: string }>("SELECT id FROM schema_migrations WHERE id = ?", [file]);
    if (existing) continue;

    const sql = readFileSync(`${migrationsDir}/${file}`, "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.run("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", [
        file,
        new Date().toISOString(),
      ]);
    });
  }
}

export function createId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function nowIso(): string {
  return new Date().toISOString();
}

function resolveSqlitePath(config: AppConfig): string {
  if (config.databaseUrl?.startsWith("file:")) {
    return config.databaseUrl.replace(/^file:/, "") || ":memory:";
  }
  if (config.sqlitePath === ":memory:" || config.sqlitePath.endsWith(":memory:")) {
    return ":memory:";
  }
  return config.sqlitePath;
}

function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}
