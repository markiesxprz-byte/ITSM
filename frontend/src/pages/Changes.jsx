import React, { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { downloadCsv } from '../api/downloadCsv';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, TicketNumber } from '../components/Badge';
import { Button, Field, Input, Textarea, Select, EmptyState, Card } from '../components/ui';
import Modal from '../components/Modal';

const STATUSES = ['draft', 'pending_approval', 'approved', 'scheduled', 'in_progress', 'completed', 'failed', 'rejected', 'closed'];
const TYPES = ['standard', 'normal', 'emergency'];
const RISKS = ['low', 'medium', 'high'];

const RISK_STYLES = { low: 'text-ink/60', medium: 'text-amber-600', high: 'text-brick-500' };

export default function Changes() {
  const { user } = useAuth();
  const isStaff = user.role === 'admin' || user.role === 'agent';
  const [changes, setChanges] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ status: '', q: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.q) params.q = filters.q;
    client.get('/changes', { params }).then((res) => setChanges(res.data));
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isStaff) client.get('/users').then((res) => setAgents(res.data.filter((u) => u.role !== 'requester'))); }, [isStaff]);

  function openDetail(id) {
    client.get(`/changes/${id}`).then((res) => setSelected(res.data));
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Changes</h1>
          <p className="text-sm text-ink/50">Planned modifications to systems and services, with risk and approval tracking.</p>
        </div>
        {isStaff && (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => downloadCsv('/changes/export', 'changes.csv', filters)}>
              Export CSV
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={() => setCreateOpen(true)}>+ New change</Button>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Input placeholder="Search title or number…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} className="sm:max-w-xs" />
        <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="sm:max-w-[200px]">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
      </div>

      {changes.length === 0 ? (
        <EmptyState title="No changes logged" hint="Plan a change to track approvals, scheduling, and rollback steps in one place." />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {changes.map((c) => (
              <Card key={c.id} className="cursor-pointer p-4" onClick={() => openDetail(c.id)}>
                <div className="mb-2 flex items-center justify-between">
                  <TicketNumber>{c.number}</TicketNumber>
                  <span className={`text-xs font-medium capitalize ${RISK_STYLES[c.risk]}`}>{c.risk} risk</span>
                </div>
                <div className="mb-2 font-medium text-ink">{c.title}</div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={c.status} />
                  <span className="text-xs text-ink/40 capitalize">{c.change_type}</span>
                </div>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-3">Number</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Risk</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Scheduled</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id} onClick={() => openDetail(c.id)} className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="px-4 py-3"><TicketNumber>{c.number}</TicketNumber></td>
                      <td className="px-4 py-3 font-medium text-ink">{c.title}</td>
                      <td className="px-4 py-3 capitalize text-ink/70">{c.change_type}</td>
                      <td className={`px-4 py-3 font-medium capitalize ${RISK_STYLES[c.risk]}`}>{c.risk}</td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-3 text-xs text-ink/50">{c.scheduled_start ? new Date(c.scheduled_start).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {isStaff && (
        <CreateChangeModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
      )}
      {selected && (
        <ChangeDetailModal
          change={selected}
          isAdmin={user.role === 'admin'}
          isStaff={isStaff}
          agents={agents}
          onClose={() => setSelected(null)}
          onUpdated={() => { openDetail(selected.id); load(); }}
        />
      )}
    </div>
  );
}

function CreateChangeModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', description: '', change_type: 'normal', risk: 'medium',
    implementation_plan: '', backout_plan: '', scheduled_start: '', scheduled_end: '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post('/changes', form);
      setForm({ title: '', description: '', change_type: 'normal', risk: 'medium', implementation_plan: '', backout_plan: '', scheduled_start: '', scheduled_end: '' });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Plan a change" width="max-w-2xl">
      <form onSubmit={submit}>
        <Field label="Title">
          <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Upgrade production database to v15" />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Change type" hint="Standard changes are pre-approved and skip the approval step">
            <Select value={form.change_type} onChange={(e) => setForm({ ...form, change_type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Risk level">
            <Select value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })}>
              {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Scheduled start">
            <Input type="datetime-local" value={form.scheduled_start} onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })} />
          </Field>
          <Field label="Scheduled end">
            <Input type="datetime-local" value={form.scheduled_end} onChange={(e) => setForm({ ...form, scheduled_end: e.target.value })} />
          </Field>
        </div>
        <Field label="Implementation plan">
          <Textarea value={form.implementation_plan} onChange={(e) => setForm({ ...form, implementation_plan: e.target.value })} placeholder="Step-by-step plan for making the change" />
        </Field>
        <Field label="Backout plan">
          <Textarea value={form.backout_plan} onChange={(e) => setForm({ ...form, backout_plan: e.target.value })} placeholder="How to roll back if something goes wrong" />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create change'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ChangeDetailModal({ change, isAdmin, isStaff, agents, onClose, onUpdated }) {
  const [comment, setComment] = useState('');

  async function updateField(field, value) {
    await client.put(`/changes/${change.id}`, { [field]: value });
    onUpdated();
  }

  async function decide(decision) {
    await client.post(`/changes/${change.id}/approve`, { decision });
    onUpdated();
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    await client.post(`/changes/${change.id}/comments`, { content: comment });
    setComment('');
    onUpdated();
  }

  return (
    <Modal open onClose={onClose} title={`${change.number} · ${change.title}`} width="max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className={`text-sm font-medium capitalize ${RISK_STYLES[change.risk]}`}>{change.risk} risk</span>
        <span className="capitalize text-sm text-ink/50">{change.change_type} change</span>
        <StatusBadge status={change.status} />
      </div>

      {change.status === 'pending_approval' && isAdmin && (
        <div className="mb-5 flex items-center justify-between rounded-md bg-amber-50 p-4">
          <span className="text-sm font-medium text-amber-600">Awaiting change approval</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => decide('rejected')}>Reject</Button>
            <Button onClick={() => decide('approved')}>Approve</Button>
          </div>
        </div>
      )}

      {change.description && <p className="mb-5 text-sm text-ink/80">{change.description}</p>}

      {change.implementation_plan && (
        <div className="mb-4">
          <h3 className="font-display mb-1 text-sm font-semibold text-ink">Implementation plan</h3>
          <p className="whitespace-pre-wrap text-sm text-ink/70">{change.implementation_plan}</p>
        </div>
      )}
      {change.backout_plan && (
        <div className="mb-5">
          <h3 className="font-display mb-1 text-sm font-semibold text-ink">Backout plan</h3>
          <p className="whitespace-pre-wrap text-sm text-ink/70">{change.backout_plan}</p>
        </div>
      )}

      {isStaff && (
        <div className="mb-5 grid grid-cols-1 gap-4 rounded-md bg-stone-50 p-4 sm:grid-cols-2">
          <Field label="Status">
            <Select value={change.status} onChange={(e) => updateField('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
          <Field label="Assigned to">
            <Select value={change.assigned_to || ''} onChange={(e) => updateField('assigned_to', e.target.value || null)}>
              <option value="">Unassigned</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>
      )}

      <div className="mb-4">
        <h3 className="font-display mb-2 text-sm font-semibold text-ink">Activity</h3>
        <div className="max-h-48 space-y-3 overflow-y-auto rounded-md border border-stone-200 p-3">
          {change.comments?.length ? (
            change.comments.map((c) => (
              <div key={c.id} className="rounded-md bg-stone-50 p-2 text-sm">
                <div className="mb-1 text-xs text-ink/40">{new Date(c.created_at).toLocaleString()}</div>
                {c.content}
              </div>
            ))
          ) : (
            <div className="py-4 text-center text-xs text-ink/40">No comments yet.</div>
          )}
        </div>
      </div>

      {isStaff && (
        <form onSubmit={submitComment}>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add an update…" />
          <div className="mt-2 flex justify-end">
            <Button type="submit">Post</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
