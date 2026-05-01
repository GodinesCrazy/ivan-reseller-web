const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const traces = await prisma.cjShopifyUsaExecutionTrace.findMany({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 3600000) // last 1 hour
      }
    },
    orderBy: { createdAt: 'desc' },
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
