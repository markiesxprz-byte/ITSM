// End-to-end API regression test. Runs ~125 calls against a running instance
// (every module, every role/permission rule, validation errors, CSV exports) and
// compares the normalized results with a stored baseline.
//
//   npm run dev                          # in one terminal (fresh local database)
//   npm run test:api                     # in another   -> PASS / FAIL
//   node cloudflare/scripts/test-api.mjs --update    # accept current behaviour as the new baseline
//
// WARNING: it creates users, tickets and a lead, and expects an EMPTY database
// (the first registration must become the admin). Never point it at production.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const baselineFile = path.join(here, 'api-baseline.jsonl');
const url = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8787';
const update = process.argv.includes('--update');

// Pre-flight: the scenario registers owner@co.za as the FIRST user. If that login already works,
// this database has been used (by an earlier run) and the results would be meaningless.
try {
  const probe = await fetch(`${url}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@co.za', password: 'pw-123456' }),
  });
  if (probe.status === 200) {
    console.error(`This database already contains data from a previous run of this test (${url}).\nIt needs an EMPTY database: stop the server, delete .wrangler/state, start it again (npm run dev), then re-run.`);
    process.exit(2);
  }
} catch (e) {
  console.error(`Cannot reach ${url} (${e.cause?.code || e.message}). Is the server running? (npm run dev)`);
  process.exit(2);
}

const run = spawnSync(process.execPath, [path.join(here, 'parity.mjs'), url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (run.status !== 0) {
  console.error(`Could not run the scenario against ${url}.\n${(run.stderr || '').slice(0, 600)}\nIs the server running? (npm run dev)`);
  process.exit(2);
}
// JWTs are unique per server and per run, so they are masked before comparing.
const actual = run.stdout.replace(/"token":"[^"]*"/g, '"token":"<jwt>"').trim().split('\n');

if (update) {
  writeFileSync(baselineFile, actual.join('\n') + '\n');
  console.log(`Baseline written: ${actual.length} steps -> ${path.relative(process.cwd(), baselineFile)}`);
  process.exit(0);
}
if (!existsSync(baselineFile)) { console.error('No baseline found. Run with --update once.'); process.exit(2); }

const expected = readFileSync(baselineFile, 'utf8').trim().split('\n');
const bad = [];
for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
  if (actual[i] !== expected[i]) bad.push({ i: i + 1, exp: expected[i], act: actual[i] });
}
if (!bad.length) {
  console.log(`PASS — all ${actual.length} API steps match the baseline.`);
  process.exit(0);
}
console.error(`FAIL — ${bad.length} of ${Math.max(actual.length, expected.length)} steps differ.`);
if (bad[0].i <= 3) console.error('The first steps differ: this scenario needs an EMPTY database. Delete .wrangler/state and restart.');
for (const b of bad.slice(0, 5)) console.error(`\nstep ${b.i}\n  expected: ${(b.exp || '(none)').slice(0, 220)}\n  actual:   ${(b.act || '(none)').slice(0, 220)}`);
process.exit(1);
