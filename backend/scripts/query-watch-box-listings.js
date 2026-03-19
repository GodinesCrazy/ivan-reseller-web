const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.marketplaceListing.findMany({
    where: {
      marketplace: 'ebay',
      OR: [
        { supplierUrl: { contains: '1005010738822789' } },
        { supplierUrl: { contains: 'watch' } },
        { product: { title: { contains: 'watch', mode: 'insensitive' } } },
        { product: { title: { contains: 'reloj', mode: 'insensitive' } } },
        { product: { title: { contains: 'caja', mode: 'insensitive' } } },
      ],
    },
    select: {
      id: true,
      listingId: true,
      sku: true,
      supplierUrl: true,
      productId: true,
      createdAt: true,
      product: {
        select: {
          title: true,
          aliexpressUrl: true,
          aliexpressSku: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

