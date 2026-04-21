#!/usr/bin/env tsx
/** Align DB workflow gate for P101 controlled publish (product must be VALIDATED_READY for preflight). */
import 'dotenv/config';
import { prisma } from '../src/config/database';

const ID = 32714;

async function main(): Promise<void> {
  const before = await prisma.product.findUnique({
    where: { id: ID },
    select: { id: true, status: true, isPublished: true },
  });
  const updated = await prisma.product.update({
    where: { id: ID },
    data: { status: 'VALIDATED_READY' },
    select: { id: true, status: true, isPublished: true },
  });
  console.log(JSON.stringify({ before, updated }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
