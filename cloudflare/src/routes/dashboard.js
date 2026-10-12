import { Hono } from 'hono';
import { authRequired } from '../lib/auth.js';

const r = new Hono();
r.use('*', authRequired);

r.get('/summary', async (c) => {
  const db = c.get('db');
  const now = new Date().toISOString();
  const n = async (sql, ...p) => (await db.get(sql, ...p)).c;
  const countBy = (table, col) => db.all(`SELECT ${col} AS key, COUNT(*) AS count FROM ${table} GROUP BY ${col}`);

  const [incOpen, incBreached, srOpen, srBreached, probOpen, chgUpcoming, chgPending, cmdbTotal] = await Promise.all([
    n(`SELECT COUNT(*) AS c FROM incidents WHERE status NOT IN ('resolved','closed')`),
    n(`SELECT COUNT(*) AS c FROM incidents WHERE status NOT IN ('resolved','closed') AND sla_resolution_due < ?`, now),
    n(`SELECT COUNT(*) AS c FROM service_requests WHERE status NOT IN ('fulfilled','closed','rejected')`),
    n(`SELECT COUNT(*) AS c FROM service_requests WHERE status NOT IN ('fulfilled','closed','rejected') AND sla_resolution_due < ?`, now),
    n(`SELECT COUNT(*) AS c FROM problems WHERE status NOT IN ('resolved','closed')`),
    n(`SELECT COUNT(*) AS c FROM changes WHERE status IN ('approved','scheduled') AND scheduled_start > ?`, now),
    n(`SELECT COUNT(*) AS c FROM changes WHERE status = 'pending_approval'`),
    n('SELECT COUNT(*) AS c FROM cmdb_items'),
  ]);
  const [iStatus, iPrio, sStatus, pStatus, cStatus, cType, ciType] = await Promise.all([
    countBy('incidents', 'status'), countBy('incidents', 'priority'), countBy('service_requests', 'status'),
    countBy('problems', 'status'), countBy('changes', 'status'), countBy('changes', 'change_type'), countBy('cmdb_items', 'ci_type'),
  ]);
  return c.json({
    incidents: { open: incOpen, breached: incBreached, byStatus: iStatus, byPriority: iPrio },
    serviceRequests: { open: srOpen, breached: srBreached, byStatus: sStatus },
    problems: { open: probOpen, byStatus: pStatus },
    changes: { upcoming: chgUpcoming, pendingApproval: chgPending, byStatus: cStatus, byType: cType },
    cmdb: { total: cmdbTotal, byType: ciType },
  });
});

r.get('/recent-activity', async (c) =>
  c.json(await c.get('db').all(
    `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 30`)));

export default r;
