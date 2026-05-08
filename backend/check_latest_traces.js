const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const traces = await p.cjShopifyUsaExecutionTrace.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, createdAt: true, message: true, step: true }
  });
  console.log(JSON.stringify(traces, null, 2));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
