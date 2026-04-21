import { prisma } from '../src/config/database';
import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';
import { cjShopifyUsaPublishService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-publish.service';

type ShopifyProductByHandle = {
  id: string;
  title: string;
  handle: string;
  status: string;
  variants?: {
    nodes?: Array<{
      id: string;
      sku?: string | null;
    }>;
  };
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

async function findProductByHandle(userId: number, handle: string): Promise<ShopifyProductByHandle | null> {
  const data = await cjShopifyUsaAdminService.graphql<{
    products?: { nodes?: ShopifyProductByHandle[] };
  }>({
    userId,
    query: `
      query CjShopifyFindProductByHandle($query: String!) {
        products(first: 10, query: $query) {
          nodes {
            id
            title
            handle
            status
            variants(first: 10) {
              nodes {
                id
                sku
              }
            }
          }
        }
      }
    `,
    variables: { query: `handle:${handle}` },
  });

  return data.products?.nodes?.find((product) => product.handle === handle) ?? null;
}

async function main() {
  const userId = Number(process.env.CJ_SHOPIFY_USA_REPAIR_USER_ID || '1');
  const failedListings = await prisma.cjShopifyUsaListing.findMany({
    where: {
      userId,
      status: 'FAILED',
    },
    include: { product: true, variant: true },
    orderBy: { id: 'asc' },
  });

  const repaired = [];
  const skipped = [];

  for (const listing of failedListings) {
    const draft = (listing.draftPayload || null) as Record<string, unknown> | null;
    const handle = text(draft?.handle || listing.shopifyHandle);
    const sku = text(listing.shopifySku || listing.variant?.cjSku || draft?.cjSku);

    if (!handle || !/handle .*already in use/i.test(text(listing.lastError))) {
      skipped.push({ listingId: listing.id, reason: 'No handle-conflict failure to repair.' });
      continue;
    }

    const shopifyProduct = await findProductByHandle(userId, handle);
    if (!shopifyProduct) {
      skipped.push({ listingId: listing.id, reason: `No Shopify product found for handle ${handle}.` });
      continue;
    }

    const variant =
      shopifyProduct.variants?.nodes?.find((node) => text(node.sku) === sku) ||
      shopifyProduct.variants?.nodes?.[0] ||
      null;

    if (!variant?.id) {
      skipped.push({ listingId: listing.id, reason: `Shopify product ${shopifyProduct.id} has no usable variant.` });
      continue;
    }

    await prisma.cjShopifyUsaListing.update({
      where: { id: listing.id },
      data: {
        status: 'DRAFT',
        shopifyProductId: shopifyProduct.id,
        shopifyVariantId: variant.id,
        shopifyHandle: shopifyProduct.handle,
        shopifySku: sku,
        lastError: null,
        lastSyncedAt: new Date(),
      },
    });

    const published = await cjShopifyUsaPublishService.publishListing({
      userId,
      listingId: listing.id,
    });

    repaired.push({
      listingId: listing.id,
      productTitle: listing.product.title,
      shopifyProductId: published.shopifyProductId,
      shopifyVariantId: published.shopifyVariantId,
      shopifyHandle: published.shopifyHandle,
      status: published.status,
    });
  }

  console.log(JSON.stringify({ repaired, skipped }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
