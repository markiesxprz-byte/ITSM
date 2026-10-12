import { sign, verify } from 'hono/jwt';
import { newId } from './helpers.js';

// ---- Password hashing: PBKDF2-SHA256 via WebCrypto (native, fast in Workers) ----
// 100,000 iterations is the maximum workerd allows for PBKDF2.
const ITER = 100000;
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
const enc = new TextEncoder();

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(bits)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
  const bits = new Uint8Array(await derive(password, unb64(saltB64), Number(iter)));
  const expected = unb64(hashB64);
  if (bits.length !== expected.length) return false;
  let diff = 0; // constant-time compare
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

// ---- JWT secret: env var, else generated once and stored in D1 ----
// There is no hardcoded fallback. INSERT OR IGNORE makes first-generation race-safe
// if several isolates start at the same moment.
let cachedSecret = null;
export async function getSecret(c) {
  if (c.env.JWT_SECRET) return c.env.JWT_SECRET;
  if (cachedSecret) return cachedSecret;
  const db = c.get('db');
  const candidate = Array.from(crypto.getRandomValues(new Uint8Array(48)), (n) => n.toString(16).padStart(2, '0')).join('');
  await db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('jwt_secret', ?)", candidate);
  cachedSecret = (await db.get("SELECT value FROM settings WHERE key = 'jwt_secret'")).value;
  return cachedSecret;
}

export async function signToken(c, user) {
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  return sign({ id: user.id, name: user.name, email: user.email, role: user.role, exp }, await getSecret(c));
}

export async function authRequired(c, next) {
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return c.json({ error: 'Authentication required' }, 401);
  try {
    c.set('user', await verify(token, await getSecret(c), 'HS256'));
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  await next();
}

export const requireRole = (...roles) => async (c, next) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required' }, 401);
  if (!roles.includes(user.role)) return c.json({ error: 'Insufficient permissions' }, 403);
  await next();
};

export const sanitize = ({ password_hash, ...rest }) => rest;
export { newId };
