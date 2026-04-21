/**
 * Audit script for CJ → Shopify USA products and listings
 * Run from backend folder: npx ts-node scripts/audit-cj-shopify-products.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function auditProducts() {
  console.log('=== CJ → Shopify USA Product & Listing Audit ===\n');

  // Get all products with their variants and listings
  const products = await prisma.cjShopifyUsaProduct.findMany({
    include: {
      variants: true,
      listings: {
        include: {
          evaluation: true,
        },
      },
      evaluations: {
        orderBy: { evaluatedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(`Total Products in Database: ${products.length}\n`);

  // Group by status
  const activeListings = products.filter((p: any) => 
    p.listings.some((l: any) => l.status === 'ACTIVE')
  );
  const draftListings = products.filter((p: any) => 
    p.listings.some((l: any) => l.status === 'DRAFT') && !p.listings.some((l: any) => l.status === 'ACTIVE')
  );
  const failedListings = products.filter((p: any) => 
    p.listings.some((l: any) => l.status === 'FAILED')
  );
  const noListings = products.filter((p: any) => p.listings.length === 0);

  console.log('--- Listing Status Summary ---');
  console.log(`Products with ACTIVE listings: ${activeListings.length}`);
  console.log(`Products with DRAFT listings only: ${draftListings.length}`);
  console.log(`Products with FAILED listings: ${failedListings.length}`);
  console.log(`Products with NO listings: ${noListings.length}\n`);

  console.log('--- Detailed Product Inventory ---');
  for (const product of products) {
    const activeCount = product.listings.filter((l: any) => l.status === 'ACTIVE').length;
    const draftCount = product.listings.filter((l: any) => l.status === 'DRAFT').length;
    const failedCount = product.listings.filter((l: any) => l.status === 'FAILED').length;
    
    console.log(`\n[${product.id}] ${product.title.substring(0, 60)}...`);
    console.log(`  CJ Product ID: ${product.cjProductId}`);
    console.log(`  Variants: ${product.variants.length}`);
    console.log(`  Listings: ${product.listings.length} (ACTIVE: ${activeCount}, DRAFT: ${draftCount}, FAILED: ${failedCount})`);
    
    if (product.listings.length > 0) {
      for (const listing of product.listings) {
        console.log(`    - Listing ${listing.id}: ${listing.status} | Price: $${listing.listedPriceUsd} | Shopify Product: ${listing.shopifyProductId || 'N/A'}`);
      }
    }
    
    if (product.evaluations.length > 0) {
      const eval_ = product.evaluations[0];
      console.log(`  Latest Evaluation: ${eval_.decision} (${eval_.evaluatedAt.toISOString()})`);
    }
    
    // Show images if available
    if (product.images) {
      try {
        const images = product.images as any;
        if (Array.isArray(images) && images.length > 0) {
          console.log(`  Images: ${images.length} available`);
          console.log(`    First image: ${images[0].substring(0, 80)}...`);
        }
      } catch {
        console.log(`  Images: Error parsing`);
      }
    }
  }

  console.log('\n\n=== Recommended Actions ===');
  console.log(`1. Publish ${draftListings.length} draft listings to make them ACTIVE`);
  console.log(`2. Review ${failedListings.length} failed listings for errors`);
  console.log(`3. Create listings for ${noListings.length} products without listings`);
  console.log(`4. Total potentially publishable: ${draftListings.length + noListings.length}`);

  await prisma.$disconnect();
}

auditProducts().catch(console.error);
