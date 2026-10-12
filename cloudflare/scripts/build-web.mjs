// Builds the existing React frontend and copies it into ./public, which the Worker
// serves as static assets. The frontend needs no changes: it already calls /api on
// its own origin, and now /api is served by this same Worker.
import { execSync } from 'node:child_process';
import { cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../../frontend');
const out = path.resolve(here, '../public');

if (!existsSync(web)) {
  console.error(`Frontend not found at ${web}. This project expects to live inside the monorepo next to /frontend.`);
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { cwd: web, stdio: 'inherit' });
if (!existsSync(path.join(web, 'node_modules'))) run('npm install --no-audit --no-fund');
run('npm run build');
rmSync(out, { recursive: true, force: true });
cpSync(path.join(web, 'dist'), out, { recursive: true });
console.log(`Frontend copied to ${out}`);
