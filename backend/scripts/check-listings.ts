import { prisma } from '../src/config/database';

async function main() {
  const listings = await prisma.cjShopifyUsaListing.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      shopifyProductId: true,
      shopifyHandle: true,
      listedPriceUsd: true,
      product: {
        select: { title: true }
      }
    }
  });

  console.log('Active Listings:');
  console.log(JSON.stringify(listings, null, 2));
  console.log(`\nTotal: ${listings.length} active listings`);
  
  // Show which have valid Shopify product IDs
  const withProductId = listings.filter(l => l.shopifyProductId);
  console.log(`With Shopify Product ID: ${withProductId.length}`);
  
  const withoutProductId = listings.filter(l => !l.shopifyProductId);
  if (withoutProductId.length > 0) {
    console.log('\nMissing Shopify Product ID:');
    withoutProductId.forEach(l => console.log(`  - ${l.product.title} (ID: ${l.id})`));
  }
  
  await prisma.$disconnect();
}

main();
