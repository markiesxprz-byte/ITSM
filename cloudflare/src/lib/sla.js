// SLA time maths and states. Pure functions (no database, no clock of their own) so they can be tested exactly.
//
// Two ways of counting time, chosen per SLA policy:
//   'calendar' — every minute counts, 24x7 (what the product did before business hours existed).
//   'business' — only minutes inside the configured working hours on working days count; weekends and listed
//                holidays are skipped. A ticket that arrives outside working hours starts counting at the next opening.
// Working hours are expressed in a fixed UTC offset (minutes). South Africa has no daylight saving, so +120 is exact;
// for a region with DST, change the offset when the clocks change.
const MIN = 60000;
const DAY = 86400000;

export const SLA_DEFAULTS = {
  offset: 120, days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', holidays: [],
  atRiskPct: 80,       // a ticket is "at risk" once this % of its resolution window has been used
  raisePriority: false, // on a resolution breach, also raise the ticket's priority one level
};

const hm = (s, fallback) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return fallback;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? fallback : h * 60 + mi;
};

// Turn stored settings (possibly partial or invalid) into a safe, complete configuration.
export function normalizeConfig(raw = {}) {
  const d = SLA_DEFAULTS;
  const startMin = hm(raw.start, hm(d.start)), endMin = hm(raw.end, hm(d.end));
  const days = Array.isArray(raw.days) ? [...new Set(raw.days.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))] : d.days;
  const offset = Number.isFinite(Number(raw.offset)) && Math.abs(Number(raw.offset)) <= 14 * 60 ? Number(raw.offset) : d.offset;
  const holidays = Array.isArray(raw.holidays) ? raw.holidays.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) : [];
  const atRiskPct = Number.isFinite(Number(raw.atRiskPct)) && raw.atRiskPct >= 1 && raw.atRiskPct <= 99 ? Number(raw.atRiskPct) : d.atRiskPct;
  const valid = endMin > startMin && days.length > 0;
  return {
    offset: valid ? offset : d.offset,
    days: valid ? days : d.days,
    startMin: valid ? startMin : hm(d.start), endMin: valid ? endMin : hm(d.end),
    holidays: new Set(holidays), atRiskPct, raisePriority: raw.raisePriority === true,
  };
}

// local-midnight (in "local milliseconds") of the day containing real time `ms`
const localMidnight = (ms, off) => { const l = ms + off * MIN; return l - (((l % DAY) + DAY) % DAY); };
const isWorkday = (lm, cfg) => cfg.days.includes(new Date(lm).getUTCDay()) && !cfg.holidays.has(new Date(lm).toISOString().slice(0, 10));

// The moment that is `minutes` working minutes after `startMs`.
export function addBusinessMinutes(startMs, minutes, cfg) {
  if (!(minutes > 0)) return startMs;
  const off = cfg.offset;
  let cursor = startMs + off * MIN; // work in local milliseconds
  let remaining = minutes;
  let lm = cursor - (((cursor % DAY) + DAY) % DAY);
  for (let i = 0; i < 3660; i++, lm += DAY) { // a safety bound of ten years
    if (!isWorkday(lm, cfg)) continue;
    const open = lm + cfg.startMin * MIN, close = lm + cfg.endMin * MIN;
    if (cursor < open) cursor = open;
    if (cursor >= close) continue;
    const avail = (close - cursor) / MIN;
    if (remaining <= avail) return cursor + remaining * MIN - off * MIN;
    remaining -= avail;
    cursor = close;
  }
  return cursor - off * MIN;
}

// Working minutes between two real times.
export function businessMinutesBetween(aMs, bMs, cfg) {
  if (!(bMs > aMs)) return 0;
  const off = cfg.offset, a = aMs + off * MIN, b = bMs + off * MIN;
  let total = 0;
  for (let lm = a - (((a % DAY) + DAY) % DAY); lm < b; lm += DAY) {
    if (!isWorkday(lm, cfg)) continue;
    const s = Math.max(a, lm + cfg.startMin * MIN), e = Math.min(b, lm + cfg.endMin * MIN);
    if (e > s) total += (e - s) / MIN;
  }
  return total;
}

export const addSla = (startMs, minutes, mode, cfg) => (mode === 'business' ? addBusinessMinutes(startMs, minutes, cfg) : startMs + minutes * MIN);
export const measureSla = (aMs, bMs, mode, cfg) => (mode === 'business' ? businessMinutesBetween(aMs, bMs, cfg) : Math.max(0, (bMs - aMs) / MIN));

// Everything the screens and the scheduler need to know about one ticket's SLA.
// ticket: { created_at, sla_response_due, sla_resolution_due, responded_at, resolved_at, sla_mode, sla_paused_at }
// `open` is false once the ticket is finished (resolved/closed/fulfilled/rejected).
export function computeSla(ticket, nowMs, cfg, open = true) {
  if (!ticket.sla_resolution_due && !ticket.sla_response_due) return null;
  const mode = ticket.sla_mode === 'business' ? 'business' : 'calendar';
  const created = Date.parse(ticket.created_at);
  const paused = !!ticket.sla_paused_at;

  let response = null;
  if (ticket.sla_response_due) {
    const due = Date.parse(ticket.sla_response_due);
    if (ticket.responded_at) response = { due: ticket.sla_response_due, state: Date.parse(ticket.responded_at) <= due ? 'met' : 'breached', at: ticket.responded_at };
    else if (!open) response = { due: ticket.sla_response_due, state: 'na', at: null };
    else response = { due: ticket.sla_response_due, state: !paused && nowMs > due ? 'breached' : 'pending', at: null };
  }

  let resolution = null;
  if (ticket.sla_resolution_due) {
    const due = Date.parse(ticket.sla_resolution_due);
    const doneAt = ticket.resolved_at ? Date.parse(ticket.resolved_at) : null;
    if (doneAt) resolution = { due: ticket.sla_resolution_due, state: doneAt <= due ? 'met' : 'breached', at: ticket.resolved_at };
    else if (!open) resolution = { due: ticket.sla_resolution_due, state: 'na', at: null };
    else if (paused) resolution = { due: ticket.sla_resolution_due, state: 'paused', at: null };
    else if (nowMs > due) resolution = { due: ticket.sla_resolution_due, state: 'breached', at: null, remaining_mins: -Math.round(measureSla(due, nowMs, mode, cfg)) };
    else {
      const total = measureSla(created, due, mode, cfg) || 1;
      const used = measureSla(created, nowMs, mode, cfg);
      const pct = Math.min(100, (used / total) * 100);
      resolution = { due: ticket.sla_resolution_due, state: pct >= cfg.atRiskPct ? 'at_risk' : 'on_track', at: null, pct_used: Math.round(pct), remaining_mins: Math.round(measureSla(nowMs, due, mode, cfg)) };
    }
  }
  return { mode, paused, response, resolution };
}
