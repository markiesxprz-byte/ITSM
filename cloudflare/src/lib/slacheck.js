// Runs every few minutes (Cron Trigger). Finds tickets whose SLA is at risk or breached and alerts the right people,
// once per event. Paused (on hold) tickets are skipped: their clock is stopped.
import { makeDb } from './db.js';
import { migrate } from './migrate.js';
import { audit } from './helpers.js';
import { loadSlaConfig } from './slaengine.js';
import { computeSla } from './sla.js';
import { makeNotifierFromEnv } from './mail.js';

const KINDS = [
  { table: 'incidents', type: 'incident', done: ['resolved', 'closed'] },
  { table: 'service_requests', type: 'service_request', done: ['fulfilled', 'rejected', 'closed'] },
];
const RAISE = { P4: 'P3', P3: 'P2', P2: 'P1' };

export async function runSlaChecks(env, nowMs = Date.now()) {
  const db = makeDb(env.DB);
  await migrate(db);
  const cfg = await loadSlaConfig(db);
  const n = makeNotifierFromEnv(env, env.APP_URL || '');
  const admins = await db.all("SELECT id, name, email FROM users WHERE role = 'admin' AND is_active = 1");
  const out = { checked: 0, at_risk: 0, response_breached: 0, resolution_breached: 0, escalated: 0 };

  for (const k of KINDS) {
    const marks = k.done.map(() => '?').join(',');
    const rows = await db.all(`SELECT * FROM ${k.table} WHERE status NOT IN (${marks}) AND sla_paused_at IS NULL`, ...k.done);
    for (const t of rows) {
      out.checked++;
      const s = computeSla(t, nowMs, cfg, true);
      if (!s) continue;
      const assignee = t.assigned_to ? await db.get('SELECT id, name, email FROM users WHERE id = ? AND is_active = 1', t.assigned_to) : null;
      const base = { ticketType: k.type, number: t.number, title: t.title };
      const nowIso = new Date(nowMs).toISOString();

      if (s.resolution && s.resolution.state === 'at_risk' && !t.sla_warned_at) {
        await db.run(`UPDATE ${k.table} SET sla_warned_at = ? WHERE id = ?`, nowIso, t.id);
        for (const u of assignee ? [assignee] : admins) await n.slaAtRisk({ to: u.email, name: u.name, remaining: s.resolution.remaining_mins, ...base });
        await audit(db, k.type, t.id, 'sla_at_risk', null, { pct_used: s.resolution.pct_used });
        out.at_risk++;
      }
      if (s.response && s.response.state === 'breached' && !s.response.at && !t.sla_resp_breached_at) {
        await db.run(`UPDATE ${k.table} SET sla_resp_breached_at = ? WHERE id = ?`, nowIso, t.id);
        for (const u of dedupe(assignee, admins)) await n.slaBreached({ to: u.email, name: u.name, what: 'response', ...base });
        await audit(db, k.type, t.id, 'sla_response_breached', null, null);
        out.response_breached++;
      }
      if (s.resolution && s.resolution.state === 'breached' && !t.sla_res_breached_at) {
        // Escalation: tell the assignee and every administrator, and (if the administrator has switched it on) raise the priority.
        let raised = null;
        if (cfg.raisePriority && RAISE[t.priority]) raised = RAISE[t.priority];
        await db.run(`UPDATE ${k.table} SET sla_res_breached_at = ?, sla_escalated_at = ?${raised ? ', priority = ?' : ''} WHERE id = ?`,
          ...(raised ? [nowIso, nowIso, raised, t.id] : [nowIso, nowIso, t.id]));
        for (const u of dedupe(assignee, admins)) await n.slaBreached({ to: u.email, name: u.name, what: 'resolution', escalated: true, ...base });
        await audit(db, k.type, t.id, 'sla_resolution_breached', null, { escalated: true, priority_raised_to: raised });
        out.resolution_breached++; out.escalated++;
      }
    }
  }
  return out;
}

function dedupe(assignee, admins) {
  const seen = new Set(), list = [];
  for (const u of [assignee, ...admins]) if (u && !seen.has(u.email)) { seen.add(u.email); list.push(u); }
  return list;
}
