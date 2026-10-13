import React, { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { downloadCsv } from '../api/downloadCsv';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, PriorityBadge, TicketNumber } from '../components/Badge';
import { SlaBadge, SlaDetail } from '../components/SlaBadge';
import { Button, Field, Input, Textarea, Select, EmptyState, Card } from '../components/ui';
import Modal from '../components/Modal';

const STATUSES = ['new', 'in_progress', 'on_hold', 'resolved', 'closed'];
const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];

export default function Incidents() {
  const { user } = useAuth();
  const isStaff = user.role === 'admin' || user.role === 'agent';
  const [incidents, setIncidents] = useState([]);
  const [filters, setFilters] = useState({ status: '', priority: '', q: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [agents, setAgents] = useState([]);

  const load = useCallback(() => {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.priority) params.priority = filters.priority;
    if (filters.q) params.q = filters.q;
    client.get('/incidents', { params }).then((res) => setIncidents(res.data));
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isStaff) client.get('/users').then((res) => setAgents(res.data.filter((u) => u.role !== 'requester')));
  }, [isStaff]);

  function openDetail(id) {
    client.get(`/incidents/${id}`).then((res) => setSelected(res.data));
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Incidents</h1>
          <p className="text-sm text-ink/50">Unplanned interruptions or reductions in service quality.</p>
        </div>
        <div className="flex gap-2">
          {isStaff && (
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => downloadCsv('/incidents/export', 'incidents.csv', filters)}>
              Export CSV
            </Button>
          )}
          <Button className="flex-1 sm:flex-none" onClick={() => setCreateOpen(true)}>+ New incident</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Input
          placeholder="Search title or number…"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          className="sm:max-w-xs"
        />
        <div className="flex gap-3">
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="flex-1 sm:max-w-[160px]">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </Select>
          <Select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} className="flex-1 sm:max-w-[160px]">
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
      </div>

      {incidents.length === 0 ? (
        <EmptyState title="No incidents found" hint="Nothing matches these filters, or none have been logged yet." />
      ) : (
        <>
          {/* Mobile card list — replaces the table below the sm breakpoint */}
          <div className="space-y-3 sm:hidden">
            {incidents.map((inc) => (
              <Card key={inc.id} className="cursor-pointer p-4" onClick={() => openDetail(inc.id)}>
                <div className="mb-2 flex items-center justify-between">
                  <TicketNumber>{inc.number}</TicketNumber>
                  <PriorityBadge priority={inc.priority} />
                </div>
                <div className="mb-2 font-medium text-ink">{inc.title}</div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={inc.status} />
                  <span className="text-xs text-ink/40">{new Date(inc.updated_at).toLocaleDateString()}</span>
                </div>
                {inc.sla && <div className="mt-2"><SlaBadge sla={inc.sla} /></div>}
              </Card>
            ))}
          </div>

          {/* Desktop table — sm and up */}
          <Card className="hidden overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-3">Number</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    {isStaff && <th className="px-4 py-3">SLA</th>}
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((inc) => (
                    <tr
                      key={inc.id}
                      onClick={() => openDetail(inc.id)}
                      className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50"
                    >
                      <td className="px-4 py-3"><TicketNumber>{inc.number}</TicketNumber></td>
                      <td className="px-4 py-3 font-medium text-ink">{inc.title}</td>
                      <td className="px-4 py-3"><PriorityBadge priority={inc.priority} /></td>
                      <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
                      {isStaff && <td className="px-4 py-3"><SlaBadge sla={inc.sla} /></td>}
                      <td className="px-4 py-3 text-xs text-ink/50">{new Date(inc.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <CreateIncidentModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
      {selected && (
        <IncidentDetailModal
          incident={selected}
          isStaff={isStaff}
          agents={agents}
          onClose={() => setSelected(null)}
          onUpdated={() => { openDetail(selected.id); load(); }}
        />
      )}
    </div>
  );
}

function CreateIncidentModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'general', priority: 'P3', impact: 'medium', urgency: 'medium' });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post('/incidents', form);
      setForm({ title: '', description: '', category: 'general', priority: 'P3', impact: 'medium', urgency: 'medium' });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Report an incident">
      <form onSubmit={submit}>
        <Field label="Title">
          <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. VPN connection dropping" />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What's happening? What have you tried?" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="network, hardware, email…" />
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit incident'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function IncidentDetailModal({ incident, isStaff, agents, onClose, onUpdated }) {
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  async function updateField(field, value) {
    await client.put(`/incidents/${incident.id}`, { [field]: value });
    onUpdated();
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    await client.post(`/incidents/${incident.id}/comments`, { content: comment, is_internal: isInternal });
    setComment('');
    onUpdated();
  }

  return (
    <Modal open onClose={onClose} title={`${incident.number} · ${incident.title}`} width="max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PriorityBadge priority={incident.priority} />
        <StatusBadge status={incident.status} />
        {!incident.sla && <span className="text-xs text-ink/40">Target resolution {new Date(incident.sla_resolution_due).toLocaleString()}</span>}
      </div>
      {incident.sla && <SlaDetail sla={incident.sla} />}

      {incident.description && <p className="mb-5 text-sm text-ink/80">{incident.description}</p>}

      {isStaff && (
        <div className="mb-5 grid grid-cols-1 gap-4 rounded-md bg-stone-50 p-4 sm:grid-cols-2">
          <Field label="Status">
            <Select value={incident.status} onChange={(e) => updateField('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </Select>
          </Field>
          <Field label="Assigned to">
            <Select value={incident.assigned_to || ''} onChange={(e) => updateField('assigned_to', e.target.value || null)}>
              <option value="">Unassigned</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>
      )}

      <div className="mb-4">
        <h3 className="font-display mb-2 text-sm font-semibold text-ink">Activity</h3>
        <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border border-stone-200 p-3">
          {incident.comments?.length ? (
            incident.comments.map((c) => (
              <div key={c.id} className={`rounded-md p-2 text-sm ${c.is_internal ? 'bg-amber-50' : 'bg-stone-50'}`}>
                <div className="mb-1 flex items-center justify-between text-xs text-ink/40">
                  <span>{c.is_internal ? 'Internal note' : 'Comment'}</span>
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                </div>
                {c.content}
              </div>
            ))
          ) : (
            <div className="py-4 text-center text-xs text-ink/40">No comments yet.</div>
          )}
        </div>
      </div>

      <form onSubmit={submitComment}>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" />
        <div className="mt-2 flex items-center justify-between">
          {isStaff && (
            <label className="flex items-center gap-2 text-xs text-ink/60">
              <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
              Internal note (not visible to requester)
            </label>
          )}
          <Button type="submit" className="ml-auto">Post</Button>
        </div>
      </form>
    </Modal>
  );
}
