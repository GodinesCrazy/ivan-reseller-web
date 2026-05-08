const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const trace = await p.cjShopifyUsaExecutionTrace.findUnique({
    where: { id: 'cmonjrqfo0003szapanmv95d4' }
  });
  console.log(JSON.stringify(trace, null, 2));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
