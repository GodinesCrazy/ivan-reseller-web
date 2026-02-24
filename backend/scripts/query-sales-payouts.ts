#!/usr/bin/env tsx
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';

async function main() {
  const sales = await prisma.sale.findMany({
    orderBy: { id: 'desc' },
    take: 5,
    select: { id: true, orderId: true, userId: true, adminPayoutId: true, userPayoutId: true, status: true },
  });
  console.log(JSON.stringify(sales, null, 2));
}

main().then(() => prisma.$disconnect()).catch(() => process.exit(1));
