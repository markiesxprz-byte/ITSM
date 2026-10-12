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
const MIGRATIONS = [
  { version: 1, sql: schemaSql },

  // v2: remember when each trial workspace was set up, so the Trial Leads list can show
  // when the free month ends. Written as a guarded code migration because SQLite has no
  // "ADD COLUMN IF NOT EXISTS". If two instances race, the loser's ALTER fails with
  // "duplicate column" — that just means the winner already did it, so it is ignored.
  {
    version: 2,
    run: async (db) => {
      const has = await db.get("SELECT COUNT(*) AS c FROM pragma_table_info('leads') WHERE name = 'provisioned_at'");
      if (has.c) return;
      try {
        await db.run('ALTER TABLE leads ADD COLUMN provisioned_at TEXT');
      } catch (err) {
        if (!/duplicate column/i.test(String(err && err.message))) throw err;
      }
    },
  },
];

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
    if (m.sql) await db.batch(statements(m.sql).map((s) => [s]));
    else await m.run(db);
    await db.run(
      "INSERT INTO settings (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(m.version)
    );
  }
  current = true;
}
