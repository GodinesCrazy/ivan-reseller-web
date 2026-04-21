import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.product.groupBy({
    by: ['status'],
    where: { userId: 1 },
    _count: { _all: true },
  });

  const validated = await prisma.product.findMany({
    where: { userId: 1, status: 'VALIDATED_READY' },
    select: {
      id: true,
      title: true,
      targetCountry: true,
      finalPrice: true,
      aliexpressSku: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log(JSON.stringify({ counts, validated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
