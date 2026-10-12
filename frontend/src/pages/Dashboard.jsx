import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import client from '../api/client';
import { Card } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#2C82E6', '#0B3FAE', '#64AEFA', '#B23B3B', '#C2B8A3'];

function StatTile({ label, value, sub, tone = 'default' }) {
  const toneClass = tone === 'alert' ? 'text-brick-500' : tone === 'good' ? 'text-patina-500' : 'text-ink';
  return (
    <Card className="p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-ink/40">{label}</div>
      <div className={`font-display mt-1 text-3xl font-bold ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink/50">{sub}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    client.get('/dashboard/summary').then((res) => setSummary(res.data));
    if (user.role !== 'requester') {
      client.get('/dashboard/recent-activity').then((res) => setActivity(res.data));
    }
  }, [user.role]);

  if (!summary) return <div className="text-sm text-ink/50">Loading dashboard…</div>;

  const incidentStatusData = summary.incidents.byStatus.map((s) => ({ name: s.key.replace('_', ' '), value: s.count }));
  const changeStatusData = summary.changes.byStatus.map((s) => ({ name: s.key.replace('_', ' '), value: s.count }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-ink">Welcome back, {user.name.split(' ')[0]}</h1>
        <p className="text-sm text-ink/50">Here's what's happening across your service desk today.</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatTile
          label="Open incidents"
          value={summary.incidents.open}
          sub={`${summary.incidents.breached} past SLA`}
          tone={summary.incidents.breached > 0 ? 'alert' : 'default'}
        />
        <StatTile
          label="Open requests"
          value={summary.serviceRequests.open}
          sub={`${summary.serviceRequests.breached} past SLA`}
          tone={summary.serviceRequests.breached > 0 ? 'alert' : 'default'}
        />
        <StatTile label="Open problems" value={summary.problems.open} sub="Under investigation" />
        <StatTile
          label="Changes pending approval"
          value={summary.changes.pendingApproval}
          sub={`${summary.changes.upcoming} scheduled ahead`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display mb-4 text-base font-semibold text-ink">Incidents by status</h2>
          {incidentStatusData.length === 0 ? (
            <div className="py-10 text-center text-sm text-ink/40">No incidents yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={incidentStatusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {incidentStatusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display mb-4 text-base font-semibold text-ink">Changes by status</h2>
          {changeStatusData.length === 0 ? (
            <div className="py-10 text-center text-sm text-ink/40">No changes yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={changeStatusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DED4" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#2C82E6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {user.role !== 'requester' && (
        <Card className="mt-6 p-5">
          <h2 className="font-display mb-4 text-base font-semibold text-ink">Recent activity</h2>
          {activity.length === 0 ? (
            <div className="py-6 text-center text-sm text-ink/40">No activity recorded yet.</div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {activity.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">
                    <span className="font-medium">{a.user_name || 'System'}</span>{' '}
                    <span className="text-ink/50">{a.action.replace(/_/g, ' ')}</span>{' '}
                    <span className="text-ink/40">{a.entity_type.replace('_', ' ')}</span>
                  </span>
                  <span className="ticket-plate text-xs text-ink/40">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
