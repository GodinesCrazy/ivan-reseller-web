#!/usr/bin/env tsx
/**
 * Phase 44 — Hard delete test/demo/mock orders from DB.
 * Run from backend/: npx tsx scripts/delete-test-orders.ts [--dry-run]
 * With production DB: railway run npx tsx scripts/delete-test-orders.ts
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';

const DRY_RUN = process.argv.includes('--dry-run');

const TEST_PREFIXES = ['TEST', 'test', 'DEMO', 'demo', 'MOCK', 'mock', 'SIM_', 'ORD-TEST'];

async function main() {
  const where = {
    OR: TEST_PREFIXES.map((prefix) => ({ paypalOrderId: { startsWith: prefix } })),
  };
  const toDelete = await prisma.order.findMany({
    where,
    select: { id: true, paypalOrderId: true, title: true, status: true, createdAt: true },
  });
  console.log(`Found ${toDelete.length} test/demo/mock orders.`);
  if (toDelete.length === 0) {
    await prisma.$disconnect();
    return;
  }
  toDelete.forEach((o) => {
    console.log(`  - ${o.id} ${o.paypalOrderId} ${o.title} ${o.status}`);
  });
  if (DRY_RUN) {
    console.log('--dry-run: no rows deleted.');
    await prisma.$disconnect();
    return;
  }
  const deleted = await prisma.order.deleteMany({ where });
  console.log(`Deleted ${deleted.count} orders.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
