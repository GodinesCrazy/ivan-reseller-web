import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/config/database';
import {
  buildShopifyStorefrontUrl,
  cjShopifyUsaAdminService,
} from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';

type Classification =
  | 'ACTIVE_AND_STOREFRONT_OK'
  | 'ACTIVE_BUT_STOREFRONT_LINK_BROKEN'
  | 'ACTIVE_BUT_HANDLE_MISMATCH'
  | 'DRAFT'
  | 'FAILED'
  | 'ORPHANED / INCONSISTENT';

type ShopifyProductSnapshot = {
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

const OUTPUT_PATH = path.resolve(process.cwd(), 'cj-shopify-storefront-reconciliation-2026-04-21.json');

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

async function fetchShopifyProduct(userId: number, productId: string): Promise<ShopifyProductSnapshot | null> {
  if (!asText(productId)) return null;

  const data = await cjShopifyUsaAdminService.graphql<{
    node?: ShopifyProductSnapshot | null;
  }>({
    userId,
    query: `
      query CjShopifyProductIntegrity($id: ID!) {
        node(id: $id) {
          ... on Product {
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
    variables: { id: productId },
  });

  return data.node ?? null;
}

async function main() {
  const userId = Number(process.env.CJ_SHOPIFY_USA_RECONCILE_USER_ID || '1');
  const execute = process.argv.includes('--execute');
  const shopDomain = await cjShopifyUsaAdminService.resolveShopDomain(userId);

  const listings = await prisma.cjShopifyUsaListing.findMany({
    where: { userId },
    include: {
      product: { select: { id: true, title: true, cjProductId: true } },
      variant: { select: { id: true, cjSku: true, cjVid: true } },
    },
    orderBy: { id: 'asc' },
  });

  const rows = [];
  const breakdown: Record<Classification, number> = {
    ACTIVE_AND_STOREFRONT_OK: 0,
    ACTIVE_BUT_STOREFRONT_LINK_BROKEN: 0,
    ACTIVE_BUT_HANDLE_MISMATCH: 0,
    DRAFT: 0,
    FAILED: 0,
    'ORPHANED / INCONSISTENT': 0,
  };
  let repairedHandleMismatches = 0;
  let repairedBrokenActiveStatuses = 0;

  for (const listing of listings) {
    let classification: Classification;
    let adminProduct: ShopifyProductSnapshot | null = null;
    let storefront: Awaited<ReturnType<typeof cjShopifyUsaAdminService.verifyStorefrontProductPage>> | null = null;
    let generatedStorefrontUrl: string | null = null;
    const notes: string[] = [];

    if (listing.status === 'DRAFT' || listing.status === 'PUBLISHING') {
      classification = 'DRAFT';
    } else if (listing.status === 'FAILED') {
      classification = 'FAILED';
    } else if (listing.status !== 'ACTIVE') {
      classification = 'ORPHANED / INCONSISTENT';
      notes.push(`Unsupported local status for storefront truth model: ${listing.status}`);
    } else if (!listing.shopifyProductId || !listing.shopifyVariantId || !listing.shopifyHandle) {
      classification = 'ORPHANED / INCONSISTENT';
      notes.push('ACTIVE row is missing one or more required Shopify identifiers.');
    } else {
      try {
        adminProduct = await fetchShopifyProduct(userId, listing.shopifyProductId);
      } catch (error) {
        adminProduct = null;
        notes.push(`Shopify Admin lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (!adminProduct) {
        classification = 'ORPHANED / INCONSISTENT';
        notes.push('Shopify Admin product was not found for stored shopifyProductId.');
      } else if (adminProduct.status !== 'ACTIVE') {
        classification = adminProduct.status === 'DRAFT' ? 'DRAFT' : 'ORPHANED / INCONSISTENT';
        notes.push(`Shopify Admin product status is ${adminProduct.status}.`);
        if (execute && adminProduct.status === 'DRAFT' && listing.status !== 'DRAFT') {
          await prisma.cjShopifyUsaListing.update({
            where: { id: listing.id },
            data: {
              status: 'DRAFT',
              shopifyHandle: adminProduct.handle,
              lastSyncedAt: new Date(),
              lastError: 'Reconciled from Shopify Admin: product is DRAFT, not buyer-facing active.',
            },
          });
          repairedBrokenActiveStatuses += 1;
        }
      } else {
        const handleMismatch = adminProduct.handle !== listing.shopifyHandle;
        const handleForStorefront = adminProduct.handle || listing.shopifyHandle;

        if (handleMismatch) {
          classification = 'ACTIVE_BUT_HANDLE_MISMATCH';
          notes.push(`Stored handle ${listing.shopifyHandle} differs from Shopify handle ${adminProduct.handle}.`);
          if (execute) {
            await prisma.cjShopifyUsaListing.update({
              where: { id: listing.id },
              data: {
                shopifyHandle: adminProduct.handle,
                lastSyncedAt: new Date(),
                lastError: null,
              },
            });
            repairedHandleMismatches += 1;
          }
        } else {
          classification = 'ACTIVE_AND_STOREFRONT_OK';
        }

        try {
          generatedStorefrontUrl = buildShopifyStorefrontUrl(shopDomain, handleForStorefront);
        } catch (error) {
          generatedStorefrontUrl = null;
          classification = 'ACTIVE_BUT_STOREFRONT_LINK_BROKEN';
          notes.push(`Could not build storefront URL: ${error instanceof Error ? error.message : String(error)}`);
        }

        if (generatedStorefrontUrl) {
          storefront = await cjShopifyUsaAdminService.verifyStorefrontProductPage({
            userId,
            productHandle: handleForStorefront,
          });

          if (!storefront.buyerFacingOk) {
            classification = 'ACTIVE_BUT_STOREFRONT_LINK_BROKEN';
            notes.push(
              `Buyer-facing storefront check failed: status=${storefront.status ?? 'FETCH_ERROR'}, finalUrl=${storefront.finalUrl ?? 'none'}`,
            );
            if (execute) {
              await prisma.cjShopifyUsaListing.update({
                where: { id: listing.id },
                data: {
                  status: 'RECONCILE_PENDING',
                  shopifyHandle: handleForStorefront,
                  lastSyncedAt: new Date(),
                  lastError: `Buyer-facing storefront check failed during reconciliation: ${JSON.stringify({
                    storefrontUrl: storefront.storefrontUrl,
                    status: storefront.status,
                    finalUrl: storefront.finalUrl,
                    passwordGate: storefront.passwordGate,
                    hasAddToCart: storefront.hasAddToCart,
                    hasPrice: storefront.hasPrice,
                    error: storefront.error,
                  })}`,
                },
              });
              repairedBrokenActiveStatuses += 1;
            }
          }
        }
      }
    }

    breakdown[classification] += 1;
    rows.push({
      listingId: listing.id,
      productTitle: listing.product?.title ?? null,
      cjProductId: listing.product?.cjProductId ?? null,
      localStatusBefore: listing.status,
      classification,
      shopifyProductId: listing.shopifyProductId,
      shopifyVariantId: listing.shopifyVariantId,
      storedShopifyHandle: listing.shopifyHandle,
      adminShopifyHandle: adminProduct?.handle ?? null,
      adminShopifyStatus: adminProduct?.status ?? null,
      generatedStorefrontUrl,
      storefront: storefront
        ? {
            status: storefront.status,
            finalUrl: storefront.finalUrl,
            buyerFacingOk: storefront.buyerFacingOk,
            passwordGate: storefront.passwordGate,
            hasAddToCart: storefront.hasAddToCart,
            hasPrice: storefront.hasPrice,
            error: storefront.error,
          }
        : null,
      notes,
    });
  }

  const output = {
    finishedAt: new Date().toISOString(),
    execute,
    userId,
    shopDomain,
    reconciledListings: listings.length,
    breakdown,
    repairedHandleMismatches,
    repairedBrokenActiveStatuses,
    rows,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
