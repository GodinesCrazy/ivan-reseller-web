#!/usr/bin/env node
/**
 * Railway production entry: run migrations inside the app container (same network as
 * postgres.railway.internal), then start the API. Avoids preDeploy migrate failing when
 * the DB is saturated by other processes during a separate predeploy step.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

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

const server = spawnSync(process.execPath, [path.join(root, 'dist', 'server-bootstrap.js')], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

process.exit(server.status !== null && server.status !== undefined ? server.status : 1);
