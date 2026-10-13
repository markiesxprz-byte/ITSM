// Connects the pure SLA maths (lib/sla.js) to tickets and settings.
import { normalizeConfig, addSla, measureSla, computeSla } from './sla.js';
import { getSla } from './helpers.js';

export async function loadSlaConfig(db) {
  const row = await db.get("SELECT value FROM settings WHERE key = 'sla_config'");
  let raw = {};
  try { raw = row ? JSON.parse(row.value) : {}; } catch { raw = {}; }
  return normalizeConfig(raw);
}

// The configuration as the settings screen edits it (the inverse of normalizeConfig).
export function configForUi(cfg) {
  const t = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { offset: cfg.offset, days: [...cfg.days].sort(), start: t(cfg.startMin), end: t(cfg.endMin), holidays: [...cfg.holidays].sort(), atRiskPct: cfg.atRiskPct, raisePriority: cfg.raisePriority };
}

const iso = (ms) => new Date(ms).toISOString();

// Due dates for a brand-new ticket.
export async function slaForNewTicket(db, appliesTo, priority, startIso, cfg) {
  const sla = await getSla(db, appliesTo, priority);
  const mode = sla.business ? 'business' : 'calendar';
  const start = Date.parse(startIso);
  return { sla_mode: mode, sla_response_due: iso(addSla(start, sla.response, mode, cfg)), sla_resolution_due: iso(addSla(start, sla.resolution, mode, cfg)) };
}

// What happens to a ticket's SLA when its status or priority changes. Returns the columns to write.
//  - Entering "on hold" stops the clock. Leaving it credits the time held by pushing the unfinished due dates back.
//  - Changing the priority recalculates the due dates from the ticket's creation, keeping the hold time already credited.
// `next` = { status, priority, responded, resolved } (the values AFTER this update).
export async function slaOnUpdate(db, appliesTo, ticket, next, nowIsoStr, cfg) {
  const mode = ticket.sla_mode === 'business' ? 'business' : 'calendar';
  const now = Date.parse(nowIsoStr);
  let pausedAt = ticket.sla_paused_at || null;
  let hold = ticket.sla_hold_mins || 0;
  let respDue = ticket.sla_response_due, resDue = ticket.sla_resolution_due;

  if (pausedAt && next.status !== 'on_hold') {                       // leaving hold: credit the time
    const held = Math.round(measureSla(Date.parse(pausedAt), now, mode, cfg));
    hold += held;
    if (held > 0) {
      if (respDue && !next.responded) respDue = iso(addSla(Date.parse(respDue), held, mode, cfg));
      if (resDue && !next.resolved) resDue = iso(addSla(Date.parse(resDue), held, mode, cfg));
    }
    pausedAt = null;
  }
  if (!pausedAt && next.status === 'on_hold' && !next.resolved) pausedAt = nowIsoStr; // entering hold

  if (next.priority !== ticket.priority && !next.resolved) {         // priority change: new targets, same creation time
    const sla = await getSla(db, appliesTo, next.priority);
    const created = Date.parse(ticket.created_at);
    if (!next.responded && ticket.sla_response_due) respDue = iso(addSla(created, sla.response + hold, mode, cfg));
    if (ticket.sla_resolution_due) resDue = iso(addSla(created, sla.resolution + hold, mode, cfg));
  }
  return { sla_paused_at: pausedAt, sla_hold_mins: hold, sla_response_due: respDue, sla_resolution_due: resDue };
}

// Attach the computed SLA state to a row (staff only; requesters never see it).
export const withSla = (row, nowMs, cfg, done) => ({ ...row, sla: computeSla(row, nowMs, cfg, !done.includes(row.status)) });
// Requesters may see their ticket's due dates (as before), but never the internal SLA bookkeeping:
// whether it was warned, breached or escalated, whether the clock is paused, and how it is counted.
const INTERNAL = ['sla_mode', 'sla_paused_at', 'sla_hold_mins', 'sla_warned_at', 'sla_resp_breached_at', 'sla_res_breached_at', 'sla_escalated_at'];
export const forRequester = (row) => { const o = { ...row }; for (const k of INTERNAL) delete o[k]; return o; };
export const forUser = (row, user) => (user.role === 'requester' ? forRequester(row) : row);
export const INCIDENT_DONE = ['resolved', 'closed'];
export const REQUEST_DONE = ['fulfilled', 'rejected', 'closed'];
