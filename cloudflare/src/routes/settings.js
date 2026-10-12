import { Hono } from 'hono';
import { body, audit } from '../lib/helpers.js';
import { authRequired, requireRole } from '../lib/auth.js';

const r = new Hono();
r.use('*', authRequired, requireRole('admin'));

const read = async (db) => {
  const rows = await db.all("SELECT key, value FROM settings WHERE key IN ('registration_open', 'registration_domain')");
  const m = Object.fromEntries(rows.map((x) => [x.key, x.value]));
  return { open: m.registration_open === '1', domain: m.registration_domain || null };
};

r.get('/registration', async (c) => c.json(await read(c.get('db'))));

// Open or close self-registration, optionally limited to one email domain (e.g. acme.co.za).
r.put('/registration', async (c) => {
  const db = c.get('db');
  const { open, domain } = await body(c);
  if (typeof open !== 'boolean') return c.json({ error: 'open must be true or false' }, 400);
  const d = domain ? String(domain).trim().toLowerCase().replace(/^@/, '') : '';
  if (d && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) {
    return c.json({ error: 'domain must look like example.co.za' }, 400);
  }
  const upsert = "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
  await db.run(upsert, 'registration_open', open ? '1' : '0');
  if (d) await db.run(upsert, 'registration_domain', d);
  else await db.run("DELETE FROM settings WHERE key = 'registration_domain'");
  await audit(db, 'settings', 'registration', 'updated', c.get('user').id, { open, domain: d || null });
  return c.json(await read(db));
});

export default r;
