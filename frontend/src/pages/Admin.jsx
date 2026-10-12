import React, { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { Button, Field, Input, Select, Card } from '../components/ui';
import Modal from '../components/Modal';

const ROLES = ['requester', 'agent', 'admin'];

export default function Admin() {
  const [tab, setTab] = useState('users');

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Administration</h1>
          <p className="text-sm text-ink/50">Manage users, roles, and SLA policies for your organization.</p>
        </div>
        <a
          href="/api/docs"
          target="_blank"
          rel="noreferrer"
          className="inline-block w-fit rounded-md border border-stone-200 px-4 py-2 text-sm font-medium text-ink hover:bg-stone-100 dark:border-white/10 dark:text-stone-50 dark:hover:bg-white/5"
        >
          API Docs ↗
        </a>
      </div>

      <div className="mb-6 flex w-fit gap-1 overflow-x-auto rounded-md bg-stone-100 p-1 text-sm max-w-full">
        <button onClick={() => setTab('users')} className={`whitespace-nowrap rounded px-4 py-1.5 font-medium ${tab === 'users' ? 'bg-white shadow-sm' : 'text-ink/50'}`}>Users</button>
        <button onClick={() => setTab('sla')} className={`whitespace-nowrap rounded px-4 py-1.5 font-medium ${tab === 'sla' ? 'bg-white shadow-sm' : 'text-ink/50'}`}>SLA Policies</button>
        <button onClick={() => setTab('catalog')} className={`whitespace-nowrap rounded px-4 py-1.5 font-medium ${tab === 'catalog' ? 'bg-white shadow-sm' : 'text-ink/50'}`}>Service Catalog</button>
        <button onClick={() => setTab('leads')} className={`whitespace-nowrap rounded px-4 py-1.5 font-medium ${tab === 'leads' ? 'bg-white shadow-sm' : 'text-ink/50'}`}>Trial Leads</button>
      </div>

      {tab === 'users' && <UsersPanel />}
      {tab === 'sla' && <SlaPanel />}
      {tab === 'catalog' && <CatalogPanel />}
      {tab === 'leads' && <LeadsPanel />}
    </div>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(() => client.get('/users').then((res) => setUsers(res.data)), []);
  useEffect(() => { load(); }, [load]);

  async function updateUser(id, field, value) {
    await client.put(`/users/${id}`, { [field]: value });
    load();
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>+ New user</Button>
      </div>

      <div className="space-y-3 sm:hidden">
        {users.map((u) => (
          <Card key={u.id} className="p-4">
            <div className="mb-1 font-medium text-ink">{u.name}</div>
            <div className="mb-3 text-xs text-ink/60">{u.email}</div>
            <div className="mb-3 text-xs text-ink/50">{u.department || 'No department'}</div>
            <div className="flex items-center justify-between">
              <Select value={u.role} onChange={(e) => updateUser(u.id, 'role', e.target.value)} className="!w-auto py-1 text-xs">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-ink/60">
                <input type="checkbox" checked={!!u.is_active} onChange={(e) => updateUser(u.id, 'is_active', e.target.checked)} />
                Active
              </label>
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
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                  <td className="px-4 py-3 text-ink/70">{u.email}</td>
                  <td className="px-4 py-3 text-ink/70">{u.department || '—'}</td>
                  <td className="px-4 py-3">
                    <Select value={u.role} onChange={(e) => updateUser(u.id, 'role', e.target.value)} className="!w-auto py-1">
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={!!u.is_active} onChange={(e) => updateUser(u.id, 'is_active', e.target.checked)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
    </div>
  );
}

function CreateUserModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent', department: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await client.post('/users', form);
      setForm({ name: '', email: '', password: '', role: 'agent', department: '' });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create user.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a user">
      <form onSubmit={submit}>
        <Field label="Full name">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Temporary password">
          <Input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Department" hint="Optional">
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </Field>
        </div>
        {error && <div className="mb-4 rounded-md bg-brick-50 px-3 py-2 text-sm text-brick-600">{error}</div>}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create user'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function SlaPanel() {
  const [policies, setPolicies] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const load = useCallback(() => client.get('/sla').then((res) => setPolicies(res.data)), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>+ New policy</Button>
      </div>

      <div className="space-y-3 sm:hidden">
        {policies.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-ink">{p.name}</span>
              <span className="text-xs font-semibold text-ink/60">{p.priority}</span>
            </div>
            <div className="mb-2 text-xs capitalize text-ink/50">{p.applies_to.replace('_', ' ')}</div>
            <div className="flex gap-4 text-xs text-ink/70">
              <span>Response: {p.response_time_mins}m</span>
              <span>Resolution: {p.resolution_time_mins}m</span>
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
                <th className="px-4 py-3">Applies to</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Response (min)</th>
                <th className="px-4 py-3">Resolution (min)</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                  <td className="px-4 py-3 capitalize text-ink/70">{p.applies_to.replace('_', ' ')}</td>
                  <td className="px-4 py-3">{p.priority}</td>
                  <td className="px-4 py-3">{p.response_time_mins}</td>
                  <td className="px-4 py-3">{p.resolution_time_mins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <CreateSlaModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
    </div>
  );
}

function CreateSlaModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', applies_to: 'incident', priority: 'P1', response_time_mins: 15, resolution_time_mins: 240 });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post('/sla', form);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New SLA policy">
      <form onSubmit={submit}>
        <Field label="Name">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. VIP Incident SLA" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Applies to">
            <Select value={form.applies_to} onChange={(e) => setForm({ ...form, applies_to: e.target.value })}>
              <option value="incident">Incident</option>
              <option value="service_request">Service Request</option>
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option>P1</option><option>P2</option><option>P3</option><option>P4</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Response time (minutes)">
            <Input type="number" min="1" required value={form.response_time_mins} onChange={(e) => setForm({ ...form, response_time_mins: Number(e.target.value) })} />
          </Field>
          <Field label="Resolution time (minutes)">
            <Input type="number" min="1" required value={form.resolution_time_mins} onChange={(e) => setForm({ ...form, resolution_time_mins: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save policy'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CatalogPanel() {
  const [items, setItems] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const load = useCallback(() => client.get('/service-requests/catalog').then((res) => setItems(res.data)), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>+ New catalog item</Button>
      </div>

      <div className="space-y-3 sm:hidden">
        {items.map((i) => (
          <Card key={i.id} className="p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-ink">{i.name}</span>
              <span className="text-xs text-ink/50">{i.requires_approval ? 'Needs approval' : 'No approval'}</span>
            </div>
            <div className="text-xs capitalize text-ink/50">{i.category} · {i.fulfillment_team || 'No team set'}</div>
          </Card>
        ))}
      </div>

      <Card className="hidden overflow-hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Fulfillment team</th>
                <th className="px-4 py-3">Requires approval</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{i.name}</td>
                  <td className="px-4 py-3 capitalize text-ink/70">{i.category}</td>
                  <td className="px-4 py-3 text-ink/70">{i.fulfillment_team || '—'}</td>
                  <td className="px-4 py-3">{i.requires_approval ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <CreateCatalogModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
    </div>
  );
}

function CreateCatalogModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', category: 'general', description: '', requires_approval: false, fulfillment_team: '' });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post('/service-requests/catalog', form);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New service catalog item">
      <form onSubmit={submit}>
        <Field label="Name">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Category">
          <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </Field>
        <Field label="Description">
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Fulfillment team">
          <Input value={form.fulfillment_team} onChange={(e) => setForm({ ...form, fulfillment_team: e.target.value })} />
        </Field>
        <label className="mb-4 flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={form.requires_approval} onChange={(e) => setForm({ ...form, requires_approval: e.target.checked })} />
          Requires manager approval before fulfillment
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save item'}</Button>
        </div>
      </form>
    </Modal>
  );
}

const LEAD_STATUSES = ['new', 'contacted', 'provisioned', 'closed'];
const LEAD_STATUS_STYLES = {
  new: 'bg-amber-50 text-amber-600',
  contacted: 'bg-patina-100 text-patina-700',
  provisioned: 'bg-patina-500 text-white',
  closed: 'bg-stone-200 text-ink/60',
};

// Calendar days are plain 'YYYY-MM-DD' strings, compared in the viewer's local time.
const pad = (n) => String(n).padStart(2, '0');
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
// Fixed day-month-year order (e.g. 12 Nov 2026) so "11/12" can never be misread as either order.
const fmtDay = (s) => parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const daysUntil = (s) => Math.round((parseDay(s) - parseDay(localToday())) / 86400000);
const plural = (n) => `${n} day${n === 1 ? '' : 's'}`;

// What the "Trial ends" column shows. Only provisioned workspaces have a running free month.
function trialInfo(lead) {
  if (lead.status !== 'provisioned') return null;
  if (!lead.trial_ends_at) return { text: 'Set a start date', tone: 'amber' };
  const n = daysUntil(lead.trial_ends_at);
  if (n < 0) return { n, text: `Ended ${plural(-n)} ago`, tone: 'red' };
  if (n === 0) return { n, text: 'Ends today', tone: 'red' };
  return { n, text: `${plural(n)} left`, tone: n <= 7 ? 'amber' : 'green' };
}
const TONE_STYLES = {
  red: 'bg-brick-50 text-brick-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-patina-50 text-patina-600',
};

function TrialCell({ lead }) {
  const info = trialInfo(lead);
  if (!info) return <span className="text-ink/30">—</span>;
  return (
    <div>
      {lead.trial_ends_at && <div className="text-sm text-ink">{fmtDay(lead.trial_ends_at)}</div>}
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONE_STYLES[info.tone]}`}>{info.text}</span>
    </div>
  );
}

function LeadsPanel() {
  const [leads, setLeads] = useState([]);
  const load = useCallback(() => client.get('/leads').then((res) => setLeads(res.data)), []);
  useEffect(() => { load(); }, [load]);

  async function save(id, patch) {
    await client.put(`/leads/${id}`, patch);
    load();
  }
  // Setting "provisioned" starts the free month: today, unless a start date is already recorded.
  function changeStatus(lead, status) {
    const patch = { status };
    if (status === 'provisioned' && !lead.provisioned_at) patch.provisioned_at = localToday();
    save(lead.id, patch);
  }
  const startDate = (lead) =>
    lead.status === 'provisioned' ? (
      <label className="mt-1.5 flex items-center gap-1.5 text-xs text-ink/50">
        Ready on
        <Input
          type="date"
          value={lead.provisioned_at || ''}
          onChange={(e) => e.target.value && save(lead.id, { provisioned_at: e.target.value })}
          className="!w-auto py-1 text-xs"
        />
      </label>
    ) : null;

  // Ending within 7 days, already ended, or provisioned but missing a start date.
  const needsAttention = leads.filter((l) => { const t = trialInfo(l); return t && (t.n === undefined || t.n <= 7); });

  return (
    <div>
      <p className="mb-4 text-sm text-ink/50">
        Trial requests submitted from the marketing site's{' '}
        <a href="/start" className="text-patina-500 hover:underline" target="_blank" rel="noreferrer">/start</a>{' '}
        page. Each one needs a workspace set up by hand. Set the status to <strong>provisioned</strong> when it is ready —
        that starts the free month and shows when it ends.
      </p>

      {needsAttention.length > 0 && (
        <div className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-600">
          <span className="font-semibold">{needsAttention.length === 1 ? '1 trial needs' : `${needsAttention.length} trials need`} attention:</span>{' '}
          {needsAttention.map((l) => `${l.company} (${trialInfo(l).text.toLowerCase()})`).join(', ')}
        </div>
      )}

      {leads.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink/40">No trial requests yet.</Card>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {leads.map((l) => (
              <Card key={l.id} className="p-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-ink">{l.company}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${LEAD_STATUS_STYLES[l.status]}`}>{l.status}</span>
                </div>
                <div className="mb-2 text-xs text-ink/60">{l.name} · {l.email}</div>
                <div className="mb-3 text-xs text-ink/50">
                  {l.plan && <span className="capitalize">{l.plan} plan</span>}
                  {l.team_size && <span> · {l.team_size} agents</span>}
                  {l.region && <span> · {l.region}</span>}
                </div>
                <Select value={l.status} onChange={(e) => changeStatus(l, e.target.value)} className="!w-auto py-1 text-xs">
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                {startDate(l)}
                {l.status === 'provisioned' && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-ink/50">Trial ends <TrialCell lead={l} /></div>
                )}
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Team size</th>
                    <th className="px-4 py-3">Region</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Trial ends</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{l.company}</td>
                      <td className="px-4 py-3 text-ink/70">
                        <div>{l.name}</div>
                        <div className="text-xs text-ink/40">{l.email}</div>
                      </td>
                      <td className="px-4 py-3 capitalize text-ink/70">{l.plan || '—'}</td>
                      <td className="px-4 py-3 text-ink/70">{l.team_size || '—'}</td>
                      <td className="px-4 py-3 capitalize text-ink/70">{l.region || '—'}</td>
                      <td className="px-4 py-3 text-xs text-ink/50">{new Date(l.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="px-4 py-3">
                        <Select value={l.status} onChange={(e) => changeStatus(l, e.target.value)} className="!w-auto py-1">
                          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </Select>
                        {startDate(l)}
                      </td>
                      <td className="px-4 py-3"><TrialCell lead={l} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
