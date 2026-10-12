// Thin wrapper that gives D1 an ergonomic async API (get / all / run / batch),
// so the route logic reads like ordinary synchronous SQLite code.
// D1 rejects `undefined` bind values, so they are normalised to NULL here.
export function makeDb(d1) {
  const norm = (a) => a.map((v) => (v === undefined ? null : v));
  const stmt = (sql, p) => d1.prepare(sql).bind(...norm(p));
  return {
    get: async (sql, ...p) => stmt(sql, p).first(),
    all: async (sql, ...p) => (await stmt(sql, p).all()).results,
    run: async (sql, ...p) => stmt(sql, p).run(),
    // Atomic multi-statement write. Each entry: [sql, ...params]
    batch: async (list) => d1.batch(list.map(([sql, ...p]) => stmt(sql, p))),
  };
}
