const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.cjShopifyUsaAccountSettings.findUnique({
    where: { userId: 1 }
  });

  console.log(JSON.stringify(settings, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
