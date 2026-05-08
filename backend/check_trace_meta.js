const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const trace = await p.cjShopifyUsaExecutionTrace.findUnique({
    where: { id: 'cmonkbww800013y45gcuvb3ng' }
  });
  console.log(JSON.stringify(trace, null, 2));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
