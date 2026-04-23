const { PrismaClient } = require('@prisma/client');
const { cjShopifyUsaPublishService } = require('../dist/modules/cj-shopify-usa/services/cj-shopify-usa-publish.service');

const prisma = new PrismaClient();

function parseArgs(argv) {
  const result = {
    userId: 1,
    listingId: null,
    allPublished: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--userId=')) {
      result.userId = Number(arg.split('=')[1] || 1);
    } else if (arg.startsWith('--listingId=')) {
      result.listingId = Number(arg.split('=')[1] || 0);
    } else if (arg === '--all-published') {
      result.allPublished = true;
    }
  }

  return result;
}

async function loadTargets(options) {
  if (options.listingId) {
    const listing = await prisma.cjShopifyUsaListing.findFirst({
      where: {
        id: options.listingId,
        userId: options.userId,
      },
    });
    return listing ? [listing] : [];
  }

  if (options.allPublished) {
    return prisma.cjShopifyUsaListing.findMany({
      where: {
        userId: options.userId,
        shopifyProductId: { not: null },
        status: {
          in: ['ACTIVE', 'PAUSED', 'RECONCILE_PENDING', 'RECONCILE_FAILED'],
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  throw new Error('Use --listingId=<id> or --all-published');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targets = await loadTargets(options);

  if (targets.length === 0) {
    console.log(JSON.stringify({ ok: true, repaired: 0, message: 'No matching listings found.' }, null, 2));
    return;
  }

  const results = [];

  for (const listing of targets) {
    const rebuilt = await cjShopifyUsaPublishService.buildDraft({
      userId: listing.userId,
      productId: listing.productId,
      variantId: listing.variantId,
      quantity: listing.quantity || 1,
    });

    const published = await cjShopifyUsaPublishService.publishListing({
      userId: listing.userId,
      listingId: rebuilt.id,
    });

    results.push({
      listingId: published.id,
      status: published.status,
      shopifyProductId: published.shopifyProductId,
      shopifyHandle: published.shopifyHandle,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        repaired: results.length,
        results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
