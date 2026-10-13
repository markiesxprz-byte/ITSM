import React, { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { Card, Field, Input, Button } from '../components/ui';
import { formatMins } from '../components/SlaBadge';

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const mins = (v) => (v === null || v === undefined ? '—' : formatMins(v));

function Stat({ label, value, sub }) {
  return (
    <Card className="p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">{label}</div>
      <div className="font-display mt-1 text-3xl font-bold text-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink/50">{sub}</div>}
    </Card>
  );
}

function Breakdown({ title, rows }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-stone-200 px-4 py-3 font-display font-semibold text-ink">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-ink/40">
              <th scope="col" className="px-4 py-3"> </th>
              <th scope="col" className="px-4 py-3">Tickets</th>
              <th scope="col" className="px-4 py-3">Response met</th>
              <th scope="col" className="px-4 py-3">Resolution met</th>
              <th scope="col" className="px-4 py-3">Avg first response</th>
              <th scope="col" className="px-4 py-3">Avg resolution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, r]) => (
              <tr key={name} className="border-b border-stone-100 last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-medium capitalize text-ink">{name.replace('_', ' ')}</th>
                <td className="px-4 py-3">{r.total}</td>
                <td className="px-4 py-3">{pct(r.response.attainment_pct)} <span className="text-xs text-ink/40">({r.response.met}/{r.response.met + r.response.breached})</span></td>
                <td className="px-4 py-3">{pct(r.resolution.attainment_pct)} <span className="text-xs text-ink/40">({r.resolution.met}/{r.resolution.met + r.resolution.breached})</span></td>
                <td className="px-4 py-3">{mins(r.avg_first_response_mins)}</td>
                <td className="px-4 py-3">{mins(r.avg_resolution_mins)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function Reports() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // `r` lets a caller pass the dates it has just chosen; otherwise the dates currently in the form are used.
  const load = useCallback((r) => {
    const q = r || range;
    const params = {};
    if (q.from) params.from = q.from;
    if (q.to) params.to = q.to;
    setError('');
    client.get('/sla/report', { params }).then((res) => setData(res.data)).catch((e) => setError(e.response?.data?.error || 'Could not load the report.'));
  }, [range]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const o = data && data.overall;
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Service reports</h1>
        <p className="text-sm text-ink/50">How well service-level targets are being met. Based on tickets created in the chosen dates.</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="From"><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        <div className="mb-4 flex gap-2">
          <Button type="submit">Apply</Button>
          <Button type="button" variant="secondary" onClick={() => { const empty = { from: '', to: '' }; setRange(empty); load(empty); }}>Reset</Button>
        </div>
      </form>

      {error && <div role="alert" className="mb-4 rounded-md bg-brick-50 px-3 py-2 text-sm text-brick-600">{error}</div>}
      {!data && !error && <p className="text-sm text-ink/50">Loading…</p>}

      {o && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Tickets" value={o.total} sub={`${o.open} open · ${o.finished} finished`} />
            <Stat label="Response target met" value={pct(o.response.attainment_pct)} sub={`${o.response.met} met · ${o.response.breached} breached`} />
            <Stat label="Resolution target met" value={pct(o.resolution.attainment_pct)} sub={`${o.resolution.met} met · ${o.resolution.breached} breached`} />
            <Stat label="Open and at risk" value={o.at_risk_open} sub={`${o.paused_open} paused on hold`} />
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <Stat label="Average first response" value={mins(o.avg_first_response_mins)} sub="From creation to the first reply" />
            <Stat label="Average resolution" value={mins(o.avg_resolution_mins)} sub="From creation to resolved; includes time on hold" />
          </div>
          <div className="space-y-6">
            <Breakdown title="By priority" rows={Object.entries(data.by_priority)} />
            <Breakdown title="By type" rows={Object.entries(data.by_type)} />
          </div>
          <p className="mt-4 text-xs text-ink/50">
            “Met” is the share of tickets answered or resolved by their due time, out of those that have reached it. Tickets still within their target are not counted yet.
            Tickets with no service-level policy are not included in attainment.
          </p>
        </>
      )}
    </div>
  );
}
