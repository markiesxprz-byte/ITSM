export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
export const addMinutesIso = (mins) => new Date(Date.now() + mins * 60000).toISOString();

// Ticket numbers like INC0042. Uses MAX(existing)+1 rather than COUNT+1 so numbers
// stay unique even if a row is ever deleted.
export async function nextNumber(db, prefix, table) {
  const row = await db.get(
    `SELECT COALESCE(MAX(CAST(SUBSTR(number, ?) AS INTEGER)), 0) AS n FROM ${table}`,
    prefix.length + 1
  );
  return `${prefix}${String(row.n + 1).padStart(4, '0')}`;
}

const DEFAULT_SLA = {
  P1: { response: 15, resolution: 240 },
  P2: { response: 30, resolution: 480 },
  P3: { response: 120, resolution: 1440 },
  P4: { response: 480, resolution: 4320 },
};

export async function getSla(db, appliesTo, priority) {
  const p = await db.get('SELECT * FROM sla_policies WHERE applies_to = ? AND priority = ?', appliesTo, priority);
  if (p) return { response: p.response_time_mins, resolution: p.resolution_time_mins, business: !!p.use_business_hours };
  return { ...(DEFAULT_SLA[priority] || DEFAULT_SLA.P3), business: false };
}

export async function audit(db, entityType, entityId, action, userId, details) {
  await db.run(
    `INSERT INTO audit_log (id, entity_type, entity_id, action, user_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newId(), entityType, entityId, action, userId || null, details ? JSON.stringify(details) : null, nowIso()
  );
}

// Parse a JSON body without throwing on empty/invalid input.
export async function body(c) {
  try { return (await c.req.json()) || {}; } catch { return {}; }
}

// Run background work (emails) without delaying the response.
export function fire(c, promise) {
  const p = Promise.resolve(promise).catch((e) => console.error('[background]', e?.message || e));
  try { c.executionCtx.waitUntil(p); } catch { /* no execution context (tests) */ }
}

// ---- Calendar dates as plain 'YYYY-MM-DD' strings (no time zones to get wrong) ----
export const todayUtc = () => new Date().toISOString().slice(0, 10);

export function isValidDay(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; // rejects 2026-02-30
}

// Add whole calendar months, clamping to the end of a shorter month:
// 31 Jan + 1 month = 28 Feb (29 in a leap year), not 3 March.
export function addMonths(str, n) {
  const [y, m, d] = str.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
