import React, { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { downloadCsv } from '../api/downloadCsv';
import { StatusBadge, PriorityBadge, TicketNumber } from '../components/Badge';
import { Button, Field, Input, Textarea, Select, EmptyState, Card } from '../components/ui';
import Modal from '../components/Modal';

const STATUSES = ['new', 'investigating', 'root_cause_identified', 'known_error', 'resolved', 'closed'];
const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];

export default function Problems() {
  const [problems, setProblems] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ status: '', q: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.q) params.q = filters.q;
    client.get('/problems', { params }).then((res) => setProblems(res.data));
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { client.get('/users').then((res) => setAgents(res.data.filter((u) => u.role !== 'requester'))); }, []);

  function openDetail(id) {
    client.get(`/problems/${id}`).then((res) => setSelected(res.data));
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Problems</h1>
          <p className="text-sm text-ink/50">Root causes behind one or more incidents.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => downloadCsv('/problems/export', 'problems.csv', filters)}>
            Export CSV
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => setCreateOpen(true)}>+ New problem</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Input placeholder="Search title or number…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} className="sm:max-w-xs" />
        <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="sm:max-w-[200px]">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
      </div>

      {problems.length === 0 ? (
        <EmptyState title="No problems logged" hint="Open a problem when the same root cause is behind multiple incidents." />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {problems.map((p) => (
              <Card key={p.id} className="cursor-pointer p-4" onClick={() => openDetail(p.id)}>
                <div className="mb-2 flex items-center justify-between">
                  <TicketNumber>{p.number}</TicketNumber>
                  <PriorityBadge priority={p.priority} />
                </div>
                <div className="mb-2 font-medium text-ink">{p.title}</div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={p.status} />
                  <span className="text-xs text-ink/40">{new Date(p.updated_at).toLocaleDateString()}</span>
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
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((p) => (
                    <tr key={p.id} onClick={() => openDetail(p.id)} className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="px-4 py-3"><TicketNumber>{p.number}</TicketNumber></td>
                      <td className="px-4 py-3 font-medium text-ink">{p.title}</td>
                      <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-xs text-ink/50">{new Date(p.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <CreateProblemModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
      {selected && (
        <ProblemDetailModal
          problem={selected}
          agents={agents}
          onClose={() => setSelected(null)}
          onUpdated={() => { openDetail(selected.id); load(); }}
        />
      )}
    </div>
  );
}

function CreateProblemModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'P3' });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post('/problems', form);
      setForm({ title: '', description: '', priority: 'P3' });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Log a problem">
      <form onSubmit={submit}>
        <Field label="Title">
          <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Recurring database timeouts" />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Pattern observed, suspected cause, affected incidents…" />
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create problem'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ProblemDetailModal({ problem, agents, onClose, onUpdated }) {
  const [comment, setComment] = useState('');
  const [rootCause, setRootCause] = useState(problem.root_cause || '');
  const [workaround, setWorkaround] = useState(problem.workaround || '');

  async function updateField(field, value) {
    await client.put(`/problems/${problem.id}`, { [field]: value });
    onUpdated();
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    await client.post(`/problems/${problem.id}/comments`, { content: comment });
    setComment('');
    onUpdated();
  }

  return (
    <Modal open onClose={onClose} title={`${problem.number} · ${problem.title}`} width="max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PriorityBadge priority={problem.priority} />
        <StatusBadge status={problem.status} />
      </div>

      {problem.description && <p className="mb-5 text-sm text-ink/80">{problem.description}</p>}

      {problem.linkedIncidents?.length > 0 && (
        <div className="mb-5">
          <h3 className="font-display mb-2 text-sm font-semibold text-ink">Linked incidents</h3>
          <div className="flex flex-wrap gap-2">
            {problem.linkedIncidents.map((i) => (
              <TicketNumber key={i.id}>{i.number}</TicketNumber>
            ))}
          </div>
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 rounded-md bg-stone-50 p-4 sm:grid-cols-2">
        <Field label="Status">
          <Select value={problem.status} onChange={(e) => updateField('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </Select>
        </Field>
        <Field label="Assigned to">
          <Select value={problem.assigned_to || ''} onChange={(e) => updateField('assigned_to', e.target.value || null)}>
            <option value="">Unassigned</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      </div>

      <Field label="Root cause">
        <Textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} onBlur={() => updateField('root_cause', rootCause)} placeholder="What's the underlying cause once identified?" />
      </Field>
      <Field label="Workaround">
        <Textarea value={workaround} onChange={(e) => setWorkaround(e.target.value)} onBlur={() => updateField('workaround', workaround)} placeholder="Temporary mitigation while a permanent fix is pending" />
      </Field>

      <div className="mb-4 mt-5">
        <h3 className="font-display mb-2 text-sm font-semibold text-ink">Activity</h3>
        <div className="max-h-48 space-y-3 overflow-y-auto rounded-md border border-stone-200 p-3">
          {problem.comments?.length ? (
            problem.comments.map((c) => (
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

      <form onSubmit={submitComment}>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add an update…" />
        <div className="mt-2 flex justify-end">
          <Button type="submit">Post</Button>
        </div>
      </form>
    </Modal>
  );
}
