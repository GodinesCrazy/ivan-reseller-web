#!/usr/bin/env tsx
/**
 * Run Phase 29 Full Autonomous Stabilization.
 * Usage: from backend/ → npx tsx scripts/run-phase29-stabilization.ts
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
  const { runPhase29Stabilization } = await import('../src/services/phase29-autonomous-stabilization.service');
  const { prisma } = await import('../src/config/database');

  console.log('[Phase29] Starting full autonomous stabilization...\n');
  const result = await runPhase29Stabilization();

  await prisma.systemConfig.upsert({
    where: { key: 'phase29_last_run' },
    create: { key: 'phase29_last_run', value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  console.log('\n--- Result ---');
  console.log('Success:', result.success);
  console.log('Ready:', result.ready);
  console.log('Duration (ms):', result.durationMs);
  console.log('Checks:', JSON.stringify(result.checks, null, 2));
  if (result.issues.length > 0) {
    console.log('Issues:', result.issues);
  }
  console.log('\nDone.');
  process.exit(result.success ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
