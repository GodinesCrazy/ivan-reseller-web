const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const settings = await p.cjShopifyUsaAccountSettings.findMany();
  console.log(JSON.stringify(settings, null, 2));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
