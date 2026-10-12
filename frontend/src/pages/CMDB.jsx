import React, { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { downloadCsv } from '../api/downloadCsv';
import { StatusBadge, TicketNumber } from '../components/Badge';
import { Button, Field, Input, Textarea, Select, EmptyState, Card } from '../components/ui';
import Modal from '../components/Modal';

const CI_TYPES = ['server', 'application', 'network_device', 'database', 'workstation', 'service'];

export default function CMDB() {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ ci_type: '', q: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    const params = {};
    if (filters.ci_type) params.ci_type = filters.ci_type;
    if (filters.q) params.q = filters.q;
    client.get('/cmdb', { params }).then((res) => setItems(res.data));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  function openDetail(id) {
    client.get(`/cmdb/${id}`).then((res) => setSelected(res.data));
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Configuration Items</h1>
          <p className="text-sm text-ink/50">The CMDB — every system, service, and asset your teams depend on.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => downloadCsv('/cmdb/export', 'cmdb_items.csv', filters)}>
            Export CSV
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => setCreateOpen(true)}>+ New item</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Input placeholder="Search by name…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} className="sm:max-w-xs" />
        <Select value={filters.ci_type} onChange={(e) => setFilters({ ...filters, ci_type: e.target.value })} className="sm:max-w-[200px]">
          <option value="">All types</option>
          {CI_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </Select>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No configuration items yet" hint="Register the servers, applications, and services your incidents and changes reference." />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {items.map((ci) => (
              <Card key={ci.id} className="cursor-pointer p-4" onClick={() => openDetail(ci.id)}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-ink">{ci.name}</span>
                  <StatusBadge status={ci.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-ink/50">
                  <span className="capitalize">{ci.ci_type.replace('_', ' ')} · {ci.environment}</span>
                  <span className="ticket-plate">{ci.ip_address || '—'}</span>
                </div>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Environment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((ci) => (
                    <tr key={ci.id} onClick={() => openDetail(ci.id)} className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="px-4 py-3 font-medium text-ink">{ci.name}</td>
                      <td className="px-4 py-3 capitalize text-ink/70">{ci.ci_type.replace('_', ' ')}</td>
                      <td className="px-4 py-3 capitalize text-ink/70">{ci.environment}</td>
                      <td className="px-4 py-3"><StatusBadge status={ci.status} /></td>
                      <td className="ticket-plate px-4 py-3 text-xs text-ink/50">{ci.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <CreateCiModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
      {selected && <CiDetailModal ci={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CreateCiModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', ci_type: 'server', environment: 'production', description: '', ip_address: '', location: '' });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post('/cmdb', form);
      setForm({ name: '', ci_type: 'server', environment: 'production', description: '', ip_address: '', location: '' });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Register a configuration item">
      <form onSubmit={submit}>
        <Field label="Name">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. WEB-PROD-02" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select value={form.ci_type} onChange={(e) => setForm({ ...form, ci_type: e.target.value })}>
              {CI_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </Select>
          </Field>
          <Field label="Environment">
            <Select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="development">development</option>
            </Select>
          </Field>
        </div>
        <Field label="IP address" hint="Optional">
          <Input value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} placeholder="10.0.1.10" />
        </Field>
        <Field label="Location" hint="Optional">
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="us-east-1, HQ rack 4…" />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save item'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CiDetailModal({ ci, onClose }) {
  return (
    <Modal open onClose={onClose} title={ci.name} width="max-w-xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="capitalize text-sm text-ink/60">{ci.ci_type.replace('_', ' ')}</span>
        <StatusBadge status={ci.status} />
        <span className="capitalize text-xs text-ink/40">{ci.environment}</span>
      </div>

      {ci.description && <p className="mb-4 text-sm text-ink/80">{ci.description}</p>}

      <div className="mb-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div><span className="text-ink/40">IP address:</span> <span className="ticket-plate">{ci.ip_address || '—'}</span></div>
        <div><span className="text-ink/40">Location:</span> {ci.location || '—'}</div>
      </div>

      {ci.relationships?.length > 0 && (
        <div className="mb-5">
          <h3 className="font-display mb-2 text-sm font-semibold text-ink">Depends on</h3>
          <div className="flex flex-wrap gap-2">
            {ci.relationships.map((r) => (
              <span key={r.id} className="rounded-full bg-stone-100 px-3 py-1 text-xs text-ink/70">{r.child_name}</span>
            ))}
          </div>
        </div>
      )}

      {ci.relatedIncidents?.length > 0 && (
        <div>
          <h3 className="font-display mb-2 text-sm font-semibold text-ink">Related incidents</h3>
          <div className="flex flex-wrap gap-2">
            {ci.relatedIncidents.map((i) => (
              <TicketNumber key={i.id}>{i.number}</TicketNumber>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
