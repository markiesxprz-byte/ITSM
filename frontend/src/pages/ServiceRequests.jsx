import React, { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { downloadCsv } from '../api/downloadCsv';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, PriorityBadge, TicketNumber } from '../components/Badge';
import { SlaBadge } from '../components/SlaBadge';
import { Button, Field, Input, Textarea, Select, EmptyState, Card } from '../components/ui';
import Modal from '../components/Modal';

const STATUSES = ['new', 'pending_approval', 'approved', 'in_progress', 'fulfilled', 'rejected', 'closed'];

export default function ServiceRequests() {
  const { user } = useAuth();
  const isStaff = user.role === 'admin' || user.role === 'agent';
  const [requests, setRequests] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ status: '', q: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.q) params.q = filters.q;
    client.get('/service-requests', { params }).then((res) => setRequests(res.data));
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    client.get('/service-requests/catalog').then((res) => setCatalog(res.data));
    if (isStaff) client.get('/users').then((res) => setAgents(res.data.filter((u) => u.role !== 'requester')));
  }, [isStaff]);

  function openDetail(id) {
    client.get(`/service-requests/${id}`).then((res) => setSelected(res.data));
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Service Requests</h1>
          <p className="text-sm text-ink/50">Requests for something new — access, equipment, or a service catalog item.</p>
        </div>
        <div className="flex gap-2">
          {isStaff && (
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => downloadCsv('/service-requests/export', 'service_requests.csv', filters)}>
              Export CSV
            </Button>
          )}
          <Button className="flex-1 sm:flex-none" onClick={() => setCreateOpen(true)}>+ New request</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Input placeholder="Search title or number…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} className="sm:max-w-xs" />
        <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="sm:max-w-[180px]">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
      </div>

      {requests.length === 0 ? (
        <EmptyState title="No service requests found" hint="Nothing matches these filters, or none have been submitted yet." />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {requests.map((r) => (
              <Card key={r.id} className="cursor-pointer p-4" onClick={() => openDetail(r.id)}>
                <div className="mb-2 flex items-center justify-between">
                  <TicketNumber>{r.number}</TicketNumber>
                  <PriorityBadge priority={r.priority} />
                </div>
                <div className="mb-2 font-medium text-ink">{r.title}</div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-ink/40">{new Date(r.updated_at).toLocaleDateString()}</span>
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
                    {isStaff && <th className="px-4 py-3">SLA</th>}
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} onClick={() => openDetail(r.id)} className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="px-4 py-3"><TicketNumber>{r.number}</TicketNumber></td>
                      <td className="px-4 py-3 font-medium text-ink">{r.title}</td>
                      <td className="px-4 py-3"><PriorityBadge priority={r.priority} /></td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      {isStaff && <td className="px-4 py-3"><SlaBadge sla={r.sla} /></td>}
                      <td className="px-4 py-3 text-xs text-ink/50">{new Date(r.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <CreateRequestModal open={createOpen} onClose={() => setCreateOpen(false)} catalog={catalog} onCreated={() => { setCreateOpen(false); load(); }} />
      {selected && (
        <RequestDetailModal
          request={selected}
          isStaff={isStaff}
          isAdmin={user.role === 'admin'}
          agents={agents}
          onClose={() => setSelected(null)}
          onUpdated={() => { openDetail(selected.id); load(); }}
        />
      )}
    </div>
  );
}

function CreateRequestModal({ open, onClose, catalog, onCreated }) {
  const [form, setForm] = useState({ title: '', description: '', catalog_item_id: '', priority: 'P3' });
  const [saving, setSaving] = useState(false);

  function selectCatalogItem(id) {
    const item = catalog.find((c) => c.id === id);
    setForm({ ...form, catalog_item_id: id, title: item ? item.name : form.title });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post('/service-requests', form);
      setForm({ title: '', description: '', catalog_item_id: '', priority: 'P3' });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Submit a service request">
      <form onSubmit={submit}>
        <Field label="Catalog item" hint="Optional — pick a predefined service, or describe a custom request below.">
          <Select value={form.catalog_item_id} onChange={(e) => selectCatalogItem(e.target.value)}>
            <option value="">Custom request</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.requires_approval ? ' (requires approval)' : ''}</option>
            ))}
          </Select>
        </Field>
        <Field label="Title">
          <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Any details that help fulfill this request" />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function RequestDetailModal({ request, isStaff, isAdmin, agents, onClose, onUpdated }) {
  const [comment, setComment] = useState('');

  async function updateField(field, value) {
    await client.put(`/service-requests/${request.id}`, { [field]: value });
    onUpdated();
  }

  async function decide(decision) {
    await client.post(`/service-requests/${request.id}/approve`, { decision });
    onUpdated();
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    await client.post(`/service-requests/${request.id}/comments`, { content: comment });
    setComment('');
    onUpdated();
  }

  return (
    <Modal open onClose={onClose} title={`${request.number} · ${request.title}`} width="max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PriorityBadge priority={request.priority} />
        <StatusBadge status={request.status} />
      </div>

      {request.status === 'pending_approval' && isStaff && (
        <div className="mb-5 flex items-center justify-between rounded-md bg-amber-50 p-4">
          <span className="text-sm font-medium text-amber-600">Awaiting approval</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => decide('rejected')}>Reject</Button>
            <Button onClick={() => decide('approved')}>Approve</Button>
          </div>
        </div>
      )}

      {request.description && <p className="mb-5 text-sm text-ink/80">{request.description}</p>}

      {isStaff && (
        <div className="mb-5 grid grid-cols-1 gap-4 rounded-md bg-stone-50 p-4 sm:grid-cols-2">
          <Field label="Status">
            <Select value={request.status} onChange={(e) => updateField('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
          <Field label="Assigned to">
            <Select value={request.assigned_to || ''} onChange={(e) => updateField('assigned_to', e.target.value || null)}>
              <option value="">Unassigned</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>
      )}

      <div className="mb-4">
        <h3 className="font-display mb-2 text-sm font-semibold text-ink">Activity</h3>
        <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border border-stone-200 p-3">
          {request.comments?.length ? (
            request.comments.map((c) => (
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
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" />
        <div className="mt-2 flex justify-end">
          <Button type="submit">Post</Button>
        </div>
      </form>
    </Modal>
  );
}
