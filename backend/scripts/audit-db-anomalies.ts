import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const publishedSamples = await prisma.product.findMany({
    where: { status: 'PUBLISHED' },
    take: 5,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      title: true,
      status: true,
      isPublished: true,
      targetCountry: true,
      currency: true,
      aliexpressSku: true,
      totalCost: true,
      shippingCost: true,
      marketplaceListings: {
        select: {
          id: true,
          marketplace: true,
          listingId: true,
          status: true,
          listingUrl: true,
        },
      },
    },
  });

  const approvedSamples = await prisma.product.findMany({
    where: { status: 'APPROVED' },
    take: 5,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      title: true,
      status: true,
      isPublished: true,
      targetCountry: true,
      currency: true,
      aliexpressSku: true,
      totalCost: true,
      shippingCost: true,
    },
  });

  const legacyLinkedListingSamples = await prisma.marketplaceListing.findMany({
    where: {
      product: { status: 'LEGACY_UNVERIFIED' },
    },
    take: 10,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      marketplace: true,
      listingId: true,
      status: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          title: true,
          status: true,
          isPublished: true,
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        publishedSamples,
        approvedSamples,
        legacyLinkedListingSamples,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
