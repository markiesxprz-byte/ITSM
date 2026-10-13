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
  // when the one-month pilot ends. Written as a guarded code migration because SQLite has no
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

  // v3: counters for sign-in throttling and form-spam limits (see lib/throttle.js).
  {
    version: 3,
    sql: `CREATE TABLE IF NOT EXISTS auth_attempts (
      key TEXT PRIMARY KEY,
      fails INTEGER NOT NULL,
      first_at INTEGER NOT NULL
    )`,
  },

  // v4: what kind of request this is, the visitor's message, and a record of the consent they gave.
  // All additive. SQLite has no "ADD COLUMN IF NOT EXISTS", so each column is checked first, and a
  // "duplicate column" error from a racing instance is ignored (same reasoning as v2).
  {
    version: 4,
    run: async (db) => {
      for (const [col, type] of [['kind', 'TEXT'], ['message', 'TEXT'], ['consent', 'INTEGER'], ['consent_at', 'TEXT'], ['consent_version', 'TEXT']]) {
        const has = await db.get("SELECT COUNT(*) AS c FROM pragma_table_info('leads') WHERE name = ?", col);
        if (has.c) continue;
        try { await db.run(`ALTER TABLE leads ADD COLUMN ${col} ${type}`); }
        catch (err) { if (!/duplicate column/i.test(String(err && err.message))) throw err; }
      }
      await db.run('CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)');
    },
  },

  // v5: SLA management — business hours, pause on hold, breach tracking. All additive; existing tickets keep their
  // due dates and behave exactly as before (a missing sla_mode means 'calendar', i.e. 24x7).
  {
    version: 5,
    run: async (db) => {
      const add = async (table, col, type) => {
        const has = await db.get(`SELECT COUNT(*) AS c FROM pragma_table_info('${table}') WHERE name = ?`, col);
        if (has.c) return;
        try { await db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); }
        catch (err) { if (!/duplicate column/i.test(String(err && err.message))) throw err; }
      };
      for (const table of ['incidents', 'service_requests']) {
        await add(table, 'sla_mode', 'TEXT');                       // 'calendar' | 'business', fixed when the ticket is created
        await add(table, 'sla_paused_at', 'TEXT');                  // set while the ticket is on hold: the clock is stopped
        await add(table, 'sla_hold_mins', 'INTEGER NOT NULL DEFAULT 0'); // minutes of hold already credited, in the ticket's own mode
        await add(table, 'sla_warned_at', 'TEXT');                  // "at risk" alert sent
        await add(table, 'sla_resp_breached_at', 'TEXT');           // response-breach alert sent
        await add(table, 'sla_res_breached_at', 'TEXT');            // resolution-breach alert sent
        await add(table, 'sla_escalated_at', 'TEXT');               // escalated when the resolution target was breached
      }
      await add('service_requests', 'responded_at', 'TEXT');        // incidents already had it
      await add('sla_policies', 'use_business_hours', 'INTEGER NOT NULL DEFAULT 0');
    },
  },

  // v6: PayPal billing. Tables only (additive). A workspace can have several subscriptions over time (cancelling and
  // re-subscribing is how the number of agents is changed); the newest row is the current one.
  {
    version: 6,
    run: async (db) => {
      await db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        paypal_subscription_id TEXT UNIQUE NOT NULL,
        paypal_plan_id TEXT,
        status TEXT NOT NULL,              -- pending | active | past_due | suspended | cancelled | expired
        seats INTEGER NOT NULL,            -- billable agents at the time of subscribing
        currency TEXT,
        next_billing_at TEXT,
        last_payment_at TEXT,
        last_payment_amount TEXT,
        failed_payments INTEGER NOT NULL DEFAULT 0,
        cancel_requested_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      // One row per webhook event PayPal has delivered. The primary key is what makes processing idempotent.
      await db.run(`CREATE TABLE IF NOT EXISTS billing_events (
        event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, paypal_subscription_id TEXT, received_at TEXT NOT NULL, outcome TEXT)`);
      await db.run(`CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,               -- PayPal's sale id
        paypal_subscription_id TEXT, amount TEXT, currency TEXT, paid_at TEXT, status TEXT, created_at TEXT NOT NULL)`);
      await db.run('CREATE INDEX IF NOT EXISTS idx_payments_sub ON payments(paypal_subscription_id, paid_at)');
    },
  },

  // v7: billing region (South Africa with VAT / international without), trial tracking, and what the access rules need:
  // when a subscription lapsed, and how far it had been paid. Additive.
  {
    version: 7,
    run: async (db) => {
      const add = async (col, type) => {
        const has = await db.get("SELECT COUNT(*) AS c FROM pragma_table_info('subscriptions') WHERE name = ?", col);
        if (has.c) return;
        try { await db.run(`ALTER TABLE subscriptions ADD COLUMN ${col} ${type}`); }
        catch (err) { if (!/duplicate column/i.test(String(err && err.message))) throw err; }
      };
      await add('region', "TEXT NOT NULL DEFAULT 'ZA'");   // ZA = priced with 15% VAT; INTL = no VAT added
      await add('in_trial', 'INTEGER NOT NULL DEFAULT 0');  // PayPal says the free trial is still running
      await add('trial_ends_at', 'TEXT');
      await add('paid_through', 'TEXT');                    // the end of the period PayPal has been paid for
      await add('lapsed_at', 'TEXT');                       // when it stopped being in good standing; cleared when active again
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
