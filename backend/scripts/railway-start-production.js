#!/usr/bin/env node
/**
 * Railway entry when the dashboard start command points at this script.
 *
 * Default: start the API immediately (server-bootstrap listens and /health returns 200).
 * Do NOT block on prisma migrate here — during rolling deploys Postgres often returns
 * "too many clients", migrate retries for many minutes, and Railway's healthcheck fails
 * because nothing is listening yet.
 *
 * Run migrations separately:
 *   - Railway → Deploy → Release Command: node scripts/railway-migrate-deploy.js
 *   - or one-off: railway run -- node scripts/railway-migrate-deploy.js
 *
 * Optional: set MIGRATE_BEFORE_LISTEN=true to restore the old migrate-then-start behavior.
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

if (process.env.MIGRATE_BEFORE_LISTEN === 'true') {
  const migrate = spawnSync(process.execPath, [path.join(__dirname, 'railway-migrate-deploy.js')], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  if (migrate.status !== 0 && migrate.status != null) {
    process.exit(migrate.status);
  }
  if (migrate.error) {
    console.error(migrate.error);
    process.exit(1);
  }
}

const child = spawn(process.execPath, [path.join(root, 'dist', 'server-bootstrap.js')], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
