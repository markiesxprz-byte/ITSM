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
  if (p) return { response: p.response_time_mins, resolution: p.resolution_time_mins };
  return DEFAULT_SLA[priority] || DEFAULT_SLA.P3;
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
