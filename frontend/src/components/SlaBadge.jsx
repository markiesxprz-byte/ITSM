import React from 'react';

// "3h 20m", "45m", "2d 4h" — for a number of minutes.
export function formatMins(mins) {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}

// One short, plain-words summary of a ticket's SLA, with a tone for colour. The words carry the meaning, never the colour alone.
export function slaSummary(sla) {
  if (!sla) return null;
  const r = sla.resolution, q = sla.response;
  if (r && r.state === 'breached') return r.at ? { tone: 'bad', text: 'Resolved late' } : { tone: 'bad', text: `Breached ${formatMins(-r.remaining_mins)} ago` };
  if (r && r.state === 'met') return { tone: 'good', text: 'Met' };
  if (q && q.state === 'breached' && !q.at) return { tone: 'bad', text: 'Response overdue' };
  if (r && r.state === 'paused') return { tone: 'muted', text: 'Paused (on hold)' };
  if (r && r.state === 'at_risk') return { tone: 'warn', text: `At risk · ${formatMins(r.remaining_mins)} left` };
  if (r && r.state === 'on_track') return { tone: 'ok', text: `${formatMins(r.remaining_mins)} left` };
  return { tone: 'muted', text: '—' };
}

const TONES = {
  bad: 'bg-brick-50 text-brick-600',
  warn: 'bg-amber-50 text-amber-600',
  ok: 'bg-patina-100 text-patina-700',
  good: 'bg-patina-500 text-white',
  muted: 'bg-stone-200 text-ink/60',
};

export function SlaBadge({ sla }) {
  const s = slaSummary(sla);
  if (!s) return null;
  const title = sla.mode === 'business' ? 'Counted in working hours only' : 'Counted round the clock';
  return <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${TONES[s.tone]}`}>{s.text}</span>;
}

const STATE_WORDS = { met: 'Met', breached: 'Breached', pending: 'Waiting', na: 'Not applicable', paused: 'Paused (on hold)', at_risk: 'At risk', on_track: 'On track' };
const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

// The fuller view for the ticket detail window (staff only).
export function SlaDetail({ sla }) {
  if (!sla) return null;
  const row = (label, part) => part && (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <span className="text-ink/70">
        {STATE_WORDS[part.state] || part.state} · due {fmt(part.due)}{part.at ? ` · done ${fmt(part.at)}` : ''}
      </span>
    </div>
  );
  return (
    <div className="mb-5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3" aria-label="Service level">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">Service level</span>
        <SlaBadge sla={sla} />
      </div>
      {row('First response', sla.response)}
      {row('Resolution', sla.resolution)}
      <div className="mt-1 text-xs text-ink/50">{sla.mode === 'business' ? 'Counted in working hours only.' : 'Counted round the clock.'}{sla.paused ? ' The clock is stopped while the ticket is on hold.' : ''}</div>
    </div>
  );
}
