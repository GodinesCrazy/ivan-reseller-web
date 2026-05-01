const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const traces = await prisma.cjShopifyUsaExecutionTrace.findMany({
    where: {
      userId: 1,
      OR: [
        { step: { startsWith: 'discovery' } },
        { step: { startsWith: 'evaluate' } },
        { step: { contains: 'search' } }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  console.log(JSON.stringify(traces, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
