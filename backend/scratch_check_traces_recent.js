const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
  const traces = await prisma.cjShopifyUsaExecutionTrace.findMany({
    where: {
      userId: 1,
      createdAt: { gte: tenMinsAgo }
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
