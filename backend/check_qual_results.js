const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const traces = await p.cjShopifyUsaExecutionTrace.findMany({
    where: { 
      step: 'qualification.result',
      createdAt: { gte: new Date('2026-05-01T23:30:00Z'), lte: new Date('2026-05-01T23:35:00Z') }
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(traces, null, 2));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
