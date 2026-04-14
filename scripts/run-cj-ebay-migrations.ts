#!/usr/bin/env npx tsx
/**
 * Aplica migraciones Prisma pendientes desde `backend/` (equivale a `prisma migrate deploy`).
 * No borra datos; no ejecuta reset. NO corre automáticamente en producción: el operador debe invocarlo a propósito.
 *
 * Uso (CWD indiferente; el script resuelve `backend/` desde su ubicación):
 *   npx tsx scripts/run-cj-ebay-migrations.ts
 *
 * Migraciones dedicadas vertical CJ→eBay (nombres de carpeta esperados en repo):
 *   20260412180000_cj_ebay_phase3a
 *   20260413153000_cj_ebay_phase3c_pricing_settings
 *   20260414203000_cj_ebay_phase3d_listing_draft
 *   20260415120000_cj_ebay_phase3e_orders
 *   20260416120000_cj_ebay_phase3e3_checkout
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, '..');
const backendRoot = path.join(repoRoot, 'backend');

function log(msg: string): void {
  console.log(`[cj-ebay-migrations] ${msg}`);
}

log(`Backend root: ${backendRoot}`);
log('Running: npx prisma migrate deploy (non-destructive)');
log('WARNING: Review pending migrations and backups before production deploy.');

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: backendRoot,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
});

if (result.error) {
  console.error('[cj-ebay-migrations] spawn error:', result.error);
  process.exit(1);
}

const code = result.status ?? 1;
if (code !== 0) {
  log(`prisma migrate deploy exited with code ${code}`);
} else {
  log('prisma migrate deploy completed successfully.');
}

process.exit(code);
