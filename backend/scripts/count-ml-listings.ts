import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  const count = await prisma.marketplaceListing.count({ where: { marketplace: 'mercadolibre' } });
  console.log(count);
  await prisma.$disconnect();
})();
