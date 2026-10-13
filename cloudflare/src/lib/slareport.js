// Service-performance figures from the tickets themselves. Pure: give it rows, a clock and the configuration.
import { computeSla } from './sla.js';

const DONE = { incident: ['resolved', 'closed'], service_request: ['fulfilled', 'rejected', 'closed'] };
const blank = () => ({ total: 0, open: 0, finished: 0, response_met: 0, response_breached: 0, resolution_met: 0, resolution_breached: 0, at_risk: 0, paused: 0, _rs: 0, _rn: 0, _ds: 0, _dn: 0 });
const pct = (met, br) => (met + br ? Math.round((met / (met + br)) * 1000) / 10 : null);

export function buildReport(tickets, nowMs, cfg) {
  const overall = blank(), byPriority = {}, byType = {};
  for (const t of tickets) {
    const done = DONE[t.kind].includes(t.status);
    const s = computeSla(t, nowMs, cfg, !done);
    for (const b of [overall, (byPriority[t.priority] ||= blank()), (byType[t.kind] ||= blank())]) {
      b.total++; done ? b.finished++ : b.open++;
      if (s && s.response) { if (s.response.state === 'met') b.response_met++; if (s.response.state === 'breached') b.response_breached++; }
      if (s && s.resolution) {
        if (s.resolution.state === 'met') b.resolution_met++;
        if (s.resolution.state === 'breached') b.resolution_breached++;
        if (s.resolution.state === 'at_risk') b.at_risk++;
        if (s.resolution.state === 'paused') b.paused++;
      }
      if (t.responded_at) { b._rs += (Date.parse(t.responded_at) - Date.parse(t.created_at)) / 60000; b._rn++; }
      if (t.resolved_at) { b._ds += (Date.parse(t.resolved_at) - Date.parse(t.created_at)) / 60000; b._dn++; }
    }
  }
  const fin = (b) => ({
    total: b.total, open: b.open, finished: b.finished,
    response: { met: b.response_met, breached: b.response_breached, attainment_pct: pct(b.response_met, b.response_breached) },
    resolution: { met: b.resolution_met, breached: b.resolution_breached, attainment_pct: pct(b.resolution_met, b.resolution_breached) },
    at_risk_open: b.at_risk, paused_open: b.paused,
    avg_first_response_mins: b._rn ? Math.round(b._rs / b._rn) : null,   // calendar minutes, including time on hold
    avg_resolution_mins: b._dn ? Math.round(b._ds / b._dn) : null,
  });
  return { overall: fin(overall), by_priority: Object.fromEntries(Object.keys(byPriority).sort().map((k) => [k, fin(byPriority[k])])), by_type: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, fin(v)])) };
}
