#!/usr/bin/env tsx
/**
 * Run Phase 32 initial activation (Phase 31 once + marketplace priority + max 15 listings/day).
 * Usage: from backend/ → npx tsx scripts/run-phase32-activation.ts
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
  const { runPhase32Activation } = await import('../src/services/phase32-autonomous-execution.service');

  console.log('[Phase32] Starting initial activation...\n');
  const result = await runPhase32Activation();

  console.log('\n--- Result ---');
  console.log('Success:', result.success);
  console.log('Marketplace priority:', result.marketplacePrioritySet.join(', '));
  console.log('Max new listings/day:', result.maxNewListingsPerDaySet);
  console.log('Phase 31 run — success:', result.phase31Run.success);
  console.log('Phase 31 run — winners detected:', result.phase31Run.winnersDetected);
  console.log('Phase 31 run — duration (ms):', result.phase31Run.durationMs);
  if (result.phase31Run.errors?.length) {
    console.log('Phase 31 run — errors:', result.phase31Run.errors);
  }
  if (result.errors.length > 0) {
    console.log('Errors:', result.errors);
  }
  console.log('\nDone.');
  process.exit(result.success ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
