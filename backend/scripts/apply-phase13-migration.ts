/**
 * Apply Phase 13 migration (listing_audit_actions, unprofitable_listing_flags).
 * Use when "too many clients" prevents: npx prisma migrate deploy
 *
 * Option A - When DB has capacity:
 *   npx prisma migrate deploy
 *
 * Option B - Run this script (executes SQL then marks migration applied):
 *   npx tsx scripts/apply-phase13-migration.ts
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationDir = path.join(__dirname, '..', 'prisma', 'migrations', '20250324000000_phase13_listing_audit_and_unprofitable_flags');
const sqlFile = path.join(migrationDir, 'migration.sql');

console.log('Applying Phase 13 migration SQL...');
execSync(`npx prisma db execute --file "${sqlFile}"`, {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

console.log('Marking migration as applied...');
execSync('npx prisma migrate resolve --applied 20250324000000_phase13_listing_audit_and_unprofitable_flags', {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

console.log('Phase 13 migration applied.');
