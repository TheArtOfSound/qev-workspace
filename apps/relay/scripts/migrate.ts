import { loadConfig } from "../src/config.js";
import { openDatabase, runMigrations } from "../src/db/client.js";

const config = loadConfig({
  ...process.env,
  USE_MOCK_STORAGE: "false",
});

const db = openDatabase(config);
runMigrations(db);
console.log(JSON.stringify({ ok: true, sqlitePath: config.sqlitePath }, null, 2));
db.close();
