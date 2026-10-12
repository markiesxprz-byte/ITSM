// Small fixed-window counters kept in D1. Used to slow password guessing and form spam.
// Keys include the client IP, so an attacker cannot lock a real user out of their own account
// from somewhere else.
const nowSec = () => Math.floor(Date.now() / 1000);

export const clientIp = (c) => c.req.header('cf-connecting-ip') || 'unknown';

// { blocked, retryAfter } — a read only, so it is cheap to call before doing expensive work.
export async function throttleCheck(db, key, limit, windowSec) {
  const row = await db.get('SELECT fails, first_at FROM auth_attempts WHERE key = ?', key);
  if (!row) return { blocked: false };
  const age = nowSec() - row.first_at;
  if (age >= windowSec || row.fails < limit) return { blocked: false };
  return { blocked: true, retryAfter: Math.max(1, windowSec - age) };
}

export async function throttleHit(db, key, windowSec) {
  const t = nowSec();
  await db.run(
    `INSERT INTO auth_attempts (key, fails, first_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       fails = CASE WHEN ?2 - first_at >= ?3 THEN 1 ELSE fails + 1 END,
       first_at = CASE WHEN ?2 - first_at >= ?3 THEN ?2 ELSE first_at END`,
    key, t, windowSec
  );
  await db.run('DELETE FROM auth_attempts WHERE first_at < ?', t - 86400); // tidy up old rows
}

export const throttleClear = (db, key) => db.run('DELETE FROM auth_attempts WHERE key = ?', key);

export const tooMany = (c, retryAfter) =>
  c.json({ error: 'Too many attempts. Please try again later.' }, 429, { 'Retry-After': String(retryAfter) });
