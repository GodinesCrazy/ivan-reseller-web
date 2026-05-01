const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const cycles = await prisma.cjShopifyUsaAutomationCycle.findMany({
    where: { userId: 1 },
    orderBy: { startedAt: 'desc' },
    take: 5,
  });

  for (const cycle of cycles) {
    console.log(`Cycle: ${cycle.id} - Status: ${cycle.status} - Finished: ${cycle.finishedAt}`);
    if (Array.isArray(cycle.events)) {
      cycle.events.forEach(e => {
        if (e.level === 'error' || e.level === 'warn') {
          console.log(`  [${e.level}] ${e.message}`);
        }
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
