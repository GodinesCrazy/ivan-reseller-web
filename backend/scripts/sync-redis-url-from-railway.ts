/**
 * Sets REDIS_URL in backend/.env.local from Railway Redis service REDIS_PUBLIC_URL
 * (TCP proxy — works from your PC; redis.railway.internal does not).
 *
 * Requires: Railway CLI logged in, backend/ linked to the project (railway link).
 * Run from backend/:  npx tsx scripts/sync-redis-url-from-railway.ts
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const BACKEND_ROOT = path.join(__dirname, '..');
const ENV_LOCAL = path.join(BACKEND_ROOT, '.env.local');

function main() {
  let json: string;
  try {
    json = execSync('railway variable list --service Redis --json', {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    console.error(
      'Failed to run Railway CLI. From backend/, run: railway login && railway link\n',
      e instanceof Error ? e.message : e,
    );
    process.exit(1);
  }

  const vars = JSON.parse(json) as Record<string, string>;
  const publicUrl = vars.REDIS_PUBLIC_URL?.trim();
  if (!publicUrl) {
    console.error('Railway Redis service has no REDIS_PUBLIC_URL. Check: railway variable list --service Redis --json');
    process.exit(2);
  }

  let body = '';
  if (fs.existsSync(ENV_LOCAL)) {
    body = fs.readFileSync(ENV_LOCAL, 'utf8');
  }

  const line = `REDIS_URL=${publicUrl}`;
  if (/^REDIS_URL=/m.test(body)) {
    body = body.replace(/^REDIS_URL=.*$/m, line);
  } else {
    body = body.replace(/\s*$/, '') + (body.trim() ? '\n' : '') + line + '\n';
  }

  fs.writeFileSync(ENV_LOCAL, body, 'utf8');
  console.log('Updated', path.relative(process.cwd(), ENV_LOCAL), 'REDIS_URL → Railway REDIS_PUBLIC_URL (TCP proxy).');
}

main();
