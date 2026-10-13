import { Hono } from 'hono';
import { authRequired, requireRole } from '../lib/auth.js';

const r = new Hono();
r.use('*', authRequired);

// Staff see organisation-wide numbers. A requester sees ONLY their own tickets, and nothing about
// problems, changes or the CMDB (those are internal records).
r.get('/summary', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const mine = user.role === 'requester';
  const now = new Date().toISOString();
  const scope = mine ? ' AND requester_id = ?' : '';
  const sp = mine ? [user.id] : [];
  const n = async (sql, ...p) => (await db.get(sql, ...p)).c;
  const countBy = (table, col) =>
    db.all(`SELECT ${col} AS key, COUNT(*) AS count FROM ${table} ${mine ? 'WHERE requester_id = ?' : ''} GROUP BY ${col}`, ...sp);

  const [incOpen, incBreached, srOpen, srBreached] = await Promise.all([
    n(`SELECT COUNT(*) AS c FROM incidents WHERE status NOT IN ('resolved','closed')${scope}`, ...sp),
    n(`SELECT COUNT(*) AS c FROM incidents WHERE status NOT IN ('resolved','closed') AND sla_paused_at IS NULL AND sla_resolution_due < ?${scope}`, now, ...sp),
    n(`SELECT COUNT(*) AS c FROM service_requests WHERE status NOT IN ('fulfilled','closed','rejected')${scope}`, ...sp),
    n(`SELECT COUNT(*) AS c FROM service_requests WHERE status NOT IN ('fulfilled','closed','rejected') AND sla_paused_at IS NULL AND sla_resolution_due < ?${scope}`, now, ...sp),
  ]);
  const [iStatus, iPrio, sStatus] = await Promise.all([
    countBy('incidents', 'status'), countBy('incidents', 'priority'), countBy('service_requests', 'status'),
  ]);

  let internal = { problems: { open: 0, byStatus: [] }, changes: { upcoming: 0, pendingApproval: 0, byStatus: [], byType: [] }, cmdb: { total: 0, byType: [] } };
  if (!mine) {
    const [probOpen, chgUpcoming, chgPending, cmdbTotal, pStatus, cStatus, cType, ciType] = await Promise.all([
      n(`SELECT COUNT(*) AS c FROM problems WHERE status NOT IN ('resolved','closed')`),
      n(`SELECT COUNT(*) AS c FROM changes WHERE status IN ('approved','scheduled') AND scheduled_start > ?`, now),
      n(`SELECT COUNT(*) AS c FROM changes WHERE status = 'pending_approval'`),
      n('SELECT COUNT(*) AS c FROM cmdb_items'),
      countBy('problems', 'status'), countBy('changes', 'status'), countBy('changes', 'change_type'), countBy('cmdb_items', 'ci_type'),
    ]);
    internal = {
      problems: { open: probOpen, byStatus: pStatus },
      changes: { upcoming: chgUpcoming, pendingApproval: chgPending, byStatus: cStatus, byType: cType },
      cmdb: { total: cmdbTotal, byType: ciType },
    };
  }
  return c.json({
    incidents: { open: incOpen, breached: incBreached, byStatus: iStatus, byPriority: iPrio },
    serviceRequests: { open: srOpen, breached: srBreached, byStatus: sStatus },
    ...internal,
  });
});

// The audit trail names people and records across the whole organisation — staff only.
r.get('/recent-activity', requireRole('admin', 'agent'), async (c) =>
  c.json(await c.get('db').all(
    `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 30`)));

export default r;
