import { Hono } from 'hono';
import { newId, nowIso, audit, body } from '../lib/helpers.js';
import { authRequired, requireRole } from '../lib/auth.js';
import { validate, ENUM, MAX, assigneeError, ciError } from '../lib/validate.js';

const r = new Hono();
r.use('*', authRequired);

r.get('/', async (c) => {
  const { category, q, status } = c.req.query();
  const user = c.get('user');
  let sql = 'SELECT * FROM kb_articles WHERE 1=1';
  const p = [];
  if (user.role === 'requester') { sql += ' AND status = ?'; p.push('published'); }
  else if (status) { sql += ' AND status = ?'; p.push(status); }
  if (category) { sql += ' AND category = ?'; p.push(category); }
  if (q) { sql += ' AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY updated_at DESC';
  return c.json(await c.get('db').all(sql, ...p));
});

r.get('/:id', async (c) => {
  const db = c.get('db');
  const a = await db.get('SELECT * FROM kb_articles WHERE id = ?', c.req.param('id'));
  if (!a) return c.json({ error: 'Not found' }, 404);
  if (c.get('user').role === 'requester' && a.status !== 'published') return c.json({ error: 'Forbidden' }, 403);
  await db.run('UPDATE kb_articles SET views = views + 1 WHERE id = ?', a.id);
  return c.json({ ...a, views: a.views + 1 });
});

r.post('/', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const b = await body(c);
  if (!b.title || !b.content) return c.json({ error: 'title and content are required' }, 400);
  const bad = validate(b, { title: { max: MAX.name }, content: { max: MAX.article }, category: { max: MAX.short }, tags: { max: MAX.tags }, status: { oneOf: ENUM.kbStatus } });
  if (bad) return c.json({ error: bad }, 400);
  const id = newId();
  const now = nowIso();
  await db.run(
    `INSERT INTO kb_articles (id, title, content, category, tags, author_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, b.title, b.content, b.category || 'general', b.tags || null, c.get('user').id, b.status || 'published', now, now
  );
  await audit(db, 'kb_article', id, 'created', c.get('user').id, { title: b.title });
  return c.json(await db.get('SELECT * FROM kb_articles WHERE id = ?', id), 201);
});

r.put('/:id', requireRole('admin', 'agent'), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const a = await db.get('SELECT * FROM kb_articles WHERE id = ?', id);
  if (!a) return c.json({ error: 'Not found' }, 404);
  const b = await body(c);
  const bad = validate(b, { title: { max: MAX.name }, content: { max: MAX.article }, category: { max: MAX.short }, tags: { max: MAX.tags }, status: { oneOf: ENUM.kbStatus } });
  if (bad) return c.json({ error: bad }, 400);
  const updates = {};
  for (const f of ['title', 'content', 'category', 'tags', 'status']) if (b[f] !== undefined) updates[f] = b[f];
  const m = { ...a, ...updates };
  await db.run('UPDATE kb_articles SET title=?, content=?, category=?, tags=?, status=?, updated_at=? WHERE id=?',
    m.title, m.content, m.category, m.tags, m.status, nowIso(), id);
  await audit(db, 'kb_article', id, 'updated', c.get('user').id, updates);
  return c.json(await db.get('SELECT * FROM kb_articles WHERE id = ?', id));
});

r.delete('/:id', requireRole('admin'), async (c) => {
  const db = c.get('db');
  await db.run('DELETE FROM kb_articles WHERE id = ?', c.req.param('id'));
  await audit(db, 'kb_article', c.req.param('id'), 'deleted', c.get('user').id, {});
  return c.body(null, 204);
});

r.post('/:id/feedback', async (c) => {
  const db = c.get('db');
  const { helpful } = await body(c);
  const col = helpful ? 'helpful_count' : 'not_helpful_count'; // fixed whitelist, never user input
  await db.run(`UPDATE kb_articles SET ${col} = ${col} + 1 WHERE id = ?`, c.req.param('id'));
  return c.json(await db.get('SELECT * FROM kb_articles WHERE id = ?', c.req.param('id')));
});

export default r;
