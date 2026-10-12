import schemaSql from '../schema.sql';

// Self-migrating database: the Worker creates and upgrades its own tables, so deploying
// needs no `d1 migrations apply` step — connect the repo and it works.
//
// Cold starts only READ (is the schema current?). Writes happen once, the first time a
// fresh database is seen, or when a new migration is added below.
//
// IMPORTANT for future edits: several isolates can start at once, so every statement in a
// migration must be idempotent (CREATE ... IF NOT EXISTS, INSERT OR IGNORE). For an
// ALTER TABLE, guard it by checking pragma_table_info first.
const MIGRATIONS = [{ version: 1, sql: schemaSql }];

// D1 batches take one statement per entry, so strip SQL comments and split on ';'.
// (No schema statement contains a ';' or '--' inside a string literal.)
const statements = (sql) =>
  sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
    .split(';').map((s) => s.trim()).filter(Boolean);

let current = false; // per-isolate: schema already verified

export async function migrate(db) {
  if (current) return;
  let version = 0;
  const hasSettings = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'");
  if (hasSettings) {
    const row = await db.get("SELECT value FROM settings WHERE key = 'schema_version'");
    version = row ? Number(row.value) : 0;
  }
  for (const m of MIGRATIONS.filter((x) => x.version > version)) {
    await db.batch(statements(m.sql).map((s) => [s]));
    await db.run(
      "INSERT INTO settings (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(m.version)
    );
  }
  current = true;
}
