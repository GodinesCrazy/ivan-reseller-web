#!/usr/bin/env tsx
/**
 * Ejecuta un ciclo completo del autopilot contra la DB configurada (local o Railway).
 * Usa DATABASE_URL, SCRAPER_API_KEY, EBAY_*, etc. de .env.local
 *
 * Uso: npx tsx scripts/run-autopilot-cycle-now.ts
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
  console.log('[RUN-CYCLE] Connecting to database and running autopilot cycle...\n');

  const { prisma } = await import('../src/config/database');
  const { autopilotSystem } = await import('../src/services/autopilot.service');

  try {
    const user = await prisma.user.findFirst({
      where: { isActive: true },
      select: { id: true, username: true },
    });

    if (!user) {
      console.error('[RUN-CYCLE] No active user found. Create a user first.');
      process.exit(1);
    }

    await prisma.userWorkflowConfig.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        workingCapital: 3000,
        minProfitUsd: 5,
        minRoiPct: 20,
        workflowMode: 'automatic',
        stagePublish: 'automatic',
      },
      update: {
        workingCapital: 3000,
        minProfitUsd: 5,
        minRoiPct: 20,
        workflowMode: 'automatic',
        stagePublish: 'automatic',
      },
    });
    console.log('[RUN-CYCLE] Config updated: workingCapital=3000, minProfitUsd=5, minRoiPct=20\n');

    console.log(`[RUN-CYCLE] Using userId=${user.id} (${user.username})\n`);
    console.log('[RUN-CYCLE] Starting runSingleCycle...\n');

    const result = await autopilotSystem.runSingleCycle(undefined, user.id, 'sandbox');

    console.log('\n[RUN-CYCLE] Result:', JSON.stringify({
      success: result.success,
      message: result.message,
      opportunitiesFound: result.opportunitiesFound,
      opportunitiesProcessed: result.opportunitiesProcessed,
      productsPublished: result.productsPublished,
      productsApproved: result.productsApproved,
      capitalUsed: result.capitalUsed,
      errors: result.errors,
    }, null, 2));

    if (result.success) {
      console.log('\n[RUN-CYCLE] CYCLE COMPLETED SUCCESSFULLY');
      process.exit(0);
    } else {
      console.log('\n[RUN-CYCLE] Cycle finished with issues:', result.message);
      process.exit(result.opportunitiesFound > 0 ? 0 : 1);
    }
  } catch (err: any) {
    console.error('[RUN-CYCLE] Error:', err?.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
