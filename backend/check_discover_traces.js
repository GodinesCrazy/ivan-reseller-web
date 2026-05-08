const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const traces = await p.cjShopifyUsaExecutionTrace.findMany({
    where: { message: { contains: 'discover' } },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  console.log(JSON.stringify(traces, null, 2));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
