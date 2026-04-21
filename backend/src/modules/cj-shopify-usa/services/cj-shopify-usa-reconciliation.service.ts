import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import {
  CJ_SHOPIFY_USA_LISTING_STATUS,
  CJ_SHOPIFY_USA_TRACE_STEP,
} from '../cj-shopify-usa.constants';
import {
  buildShopifyStorefrontUrl,
  cjShopifyUsaAdminService,
} from './cj-shopify-usa-admin.service';
import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';

type ListingLike = {
  id: number;
  userId: number;
  status: string;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  shopifyHandle?: string | null;
  shopifySku?: string | null;
  quantity?: number | null;
  publishedAt?: Date | string | null;
};

type ShopifyVariantTruth = {
  id: string;
  sku?: string | null;
  price?: string | null;
  inventoryItem?: {
    id: string;
    inventoryLevel?: {
      quantities?: Array<{ name: string; quantity: number }>;
    } | null;
  } | null;
};

type ShopifyProductTruth = {
  id: string;
  title?: string | null;
  handle?: string | null;
  status?: string | null;
  publishedOnPublication?: boolean | null;
  variants?: {
    nodes?: ShopifyVariantTruth[];
  } | null;
};

export type CjShopifyUsaPublishTruth = {
  reconciledAt: string;
  source: 'SHOPIFY_ADMIN_LIVE' | 'LOCAL_DRAFT_ONLY';
  localStatusBefore: string;
  localStatusAfter: string;
  shopifyIdentifiersPresent: boolean;
  buyerFacingVerified: boolean;
  readyForStorefront: boolean;
  reasons: string[];
  shopify: {
    exists: boolean | null;
    productId: string | null;
    variantId: string | null;
    handle: string | null;
    adminStatus: string | null;
    publishedOnPublication: boolean | null;
    publicationId: string | null;
    publicationName: string | null;
    inventoryQuantity: number | null;
    inventoryItemId: string | null;
  };
  storefront: {
    url: string | null;
    status: number | null;
    finalUrl: string | null;
    passwordGate: boolean | null;
    hasAddToCart: boolean | null;
    hasPrice: boolean | null;
    error: string | null;
  };
};

type ReconciliationResult<T extends ListingLike> = T & {
  storefrontUrl: string | null;
  publishTruth: CjShopifyUsaPublishTruth;
};

function trim(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeShopifyProductGid(value: string | null | undefined): string | null {
  const raw = trim(value);
  if (!raw) return null;
  if (raw.startsWith('gid://shopify/Product/')) return raw;
  if (/^\d+$/.test(raw)) return `gid://shopify/Product/${raw}`;
  return raw;
}

function normalizeShopifyVariantGid(value: string | null | undefined): string | null {
  const raw = trim(value);
  if (!raw) return null;
  if (raw.startsWith('gid://shopify/ProductVariant/')) return raw;
  if (/^\d+$/.test(raw)) return `gid://shopify/ProductVariant/${raw}`;
  return raw;
}

function availableQuantity(variant: ShopifyVariantTruth | null): number | null {
  const quantities = variant?.inventoryItem?.inventoryLevel?.quantities ?? [];
  const available = quantities.find((entry) => entry.name === 'available');
  return Number.isFinite(available?.quantity) ? Number(available?.quantity) : null;
}

function chooseVariant(listing: ListingLike, product: ShopifyProductTruth): ShopifyVariantTruth | null {
  const variants = product.variants?.nodes ?? [];
  if (variants.length === 0) return null;

  const storedVariantId = normalizeShopifyVariantGid(listing.shopifyVariantId);
  if (storedVariantId) {
    const byId = variants.find((variant) => variant.id === storedVariantId);
    if (byId) return byId;
  }

  const sku = trim(listing.shopifySku).toLowerCase();
  if (sku) {
    const bySku = variants.find((variant) => trim(variant.sku).toLowerCase() === sku);
    if (bySku) return bySku;
  }

  return variants[0] ?? null;
}

async function recordTrace(userId: number, step: string, message: string, meta?: Prisma.InputJsonValue) {
  await prisma.cjShopifyUsaExecutionTrace.create({
    data: { userId, step, message, meta },
  });
}

export class CjShopifyUsaReconciliationService {
  private async resolveTruthTargets(userId: number) {
    const [settings, probe] = await Promise.all([
      cjShopifyUsaConfigService.getOrCreateSettings(userId),
      cjShopifyUsaAdminService.probeConnection(userId),
    ]);

    const configuredLocationId = trim(settings.shopifyLocationId);
    const location =
      probe.locations.find((candidate) => configuredLocationId && candidate.id === configuredLocationId) ||
      probe.locations.find((candidate) => candidate.isActive && candidate.fulfillsOnlineOrders) ||
      probe.locations.find((candidate) => candidate.isActive) ||
      probe.locations[0] ||
      null;
    const publication =
      probe.publications.find((candidate) => trim(candidate.name).toLowerCase().includes('online store')) ||
      probe.publications[0] ||
      null;

    return {
      shopDomain: probe.shopDomain,
      locationId: location?.id ?? null,
      publicationId: publication?.id ?? null,
      publicationName: publication?.name ?? null,
    };
  }

  private async fetchShopifyProduct(input: {
    userId: number;
    productId: string;
    publicationId: string | null;
    locationId: string | null;
  }): Promise<ShopifyProductTruth | null> {
    const productId = normalizeShopifyProductGid(input.productId);
    if (!productId) return null;

    const variableDefs = ['$id: ID!'];
    const variables: Record<string, unknown> = { id: productId };
    let publicationField = '';
    let inventoryField = '';

    if (input.publicationId) {
      variableDefs.push('$publicationId: ID!');
      variables.publicationId = input.publicationId;
      publicationField = 'publishedOnPublication(publicationId: $publicationId)';
    }

    if (input.locationId) {
      variableDefs.push('$locationId: ID!');
      variables.locationId = input.locationId;
      inventoryField = `
        inventoryLevel(locationId: $locationId) {
          quantities(names: ["available"]) {
            name
            quantity
          }
        }
      `;
    }

    const data = await cjShopifyUsaAdminService.graphql<{ node?: ShopifyProductTruth | null }>({
      userId: input.userId,
      query: `
        query CjShopifyUsaListingTruth(${variableDefs.join(', ')}) {
          node(id: $id) {
            ... on Product {
              id
              title
              handle
              status
              ${publicationField}
              variants(first: 50) {
                nodes {
                  id
                  sku
                  price
                  inventoryItem {
                    id
                    ${inventoryField}
                  }
                }
              }
            }
          }
        }
      `,
      variables,
    });

    return data.node ?? null;
  }

  private buildLocalDraftTruth<T extends ListingLike>(
    listing: T,
    shopDomain: string | null,
  ): ReconciliationResult<T> {
    let storefrontUrl: string | null = null;
    if (shopDomain && listing.shopifyHandle) {
      try {
        storefrontUrl = buildShopifyStorefrontUrl(shopDomain, listing.shopifyHandle);
      } catch {
        storefrontUrl = null;
      }
    }

    return {
      ...listing,
      storefrontUrl,
      publishTruth: {
        reconciledAt: new Date().toISOString(),
        source: 'LOCAL_DRAFT_ONLY',
        localStatusBefore: listing.status,
        localStatusAfter: listing.status,
        shopifyIdentifiersPresent: Boolean(
          listing.shopifyProductId && listing.shopifyVariantId && listing.shopifyHandle,
        ),
        buyerFacingVerified: false,
        readyForStorefront: false,
        reasons: ['No Shopify product id is stored for this listing yet.'],
        shopify: {
          exists: null,
          productId: listing.shopifyProductId ?? null,
          variantId: listing.shopifyVariantId ?? null,
          handle: listing.shopifyHandle ?? null,
          adminStatus: null,
          publishedOnPublication: null,
          publicationId: null,
          publicationName: null,
          inventoryQuantity: null,
          inventoryItemId: null,
        },
        storefront: {
          url: storefrontUrl,
          status: null,
          finalUrl: null,
          passwordGate: null,
          hasAddToCart: null,
          hasPrice: null,
          error: null,
        },
      },
    };
  }

  async reconcileListing<T extends ListingLike>(
    listing: T,
    targets?: Awaited<ReturnType<CjShopifyUsaReconciliationService['resolveTruthTargets']>>,
  ): Promise<ReconciliationResult<T>> {
    const resolvedTargets = targets ?? await this.resolveTruthTargets(listing.userId);
    const productId = normalizeShopifyProductGid(listing.shopifyProductId);
    if (!productId) {
      return this.buildLocalDraftTruth(listing, resolvedTargets.shopDomain);
    }

    const reasons: string[] = [];
    let shopifyProduct: ShopifyProductTruth | null = null;
    let lookupError: string | null = null;

    try {
      shopifyProduct = await this.fetchShopifyProduct({
        userId: listing.userId,
        productId,
        publicationId: resolvedTargets.publicationId,
        locationId: resolvedTargets.locationId,
      });
    } catch (error) {
      lookupError = error instanceof Error ? error.message : String(error);
      reasons.push(`Shopify Admin lookup failed: ${lookupError}`);
    }

    const variant = shopifyProduct ? chooseVariant(listing, shopifyProduct) : null;
    const inventoryQuantity = availableQuantity(variant);
    const adminStatus = trim(shopifyProduct?.status).toUpperCase() || null;
    const adminHandle = trim(shopifyProduct?.handle) || null;
    const publishedOnPublication =
      typeof shopifyProduct?.publishedOnPublication === 'boolean'
        ? shopifyProduct.publishedOnPublication
        : null;

    let storefrontUrl: string | null = null;
    let storefront: Awaited<ReturnType<typeof cjShopifyUsaAdminService.verifyStorefrontProductPage>> | null = null;
    if (adminHandle) {
      try {
        storefrontUrl = buildShopifyStorefrontUrl(resolvedTargets.shopDomain, adminHandle);
      } catch {
        storefrontUrl = null;
      }
    }

    if (adminStatus === 'ACTIVE' && adminHandle) {
      storefront = await cjShopifyUsaAdminService.verifyStorefrontProductPage({
        userId: listing.userId,
        productHandle: adminHandle,
      });
    }

    if (!shopifyProduct) {
      reasons.push('Stored Shopify product id does not exist in Shopify Admin.');
    } else {
      if (!adminHandle) reasons.push('Shopify Admin product has no handle.');
      if (adminStatus !== 'ACTIVE') reasons.push(`Shopify Admin product status is ${adminStatus ?? 'UNKNOWN'}.`);
      if (publishedOnPublication === false) reasons.push('Product is not published on the selected Shopify publication.');
      if (inventoryQuantity != null && inventoryQuantity <= 0) reasons.push('Shopify available inventory is 0.');
      if (variant && normalizeShopifyVariantGid(listing.shopifyVariantId) && variant.id !== normalizeShopifyVariantGid(listing.shopifyVariantId)) {
        reasons.push('Stored Shopify variant id did not match the live SKU/variant chosen from Shopify.');
      }
      if (storefront && !storefront.buyerFacingOk) {
        reasons.push('Buyer-facing storefront verification failed.');
      }
    }

    let nextStatus = listing.status;
    if (!shopifyProduct) {
      nextStatus = CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_FAILED;
    } else if (adminStatus === 'DRAFT') {
      nextStatus = CJ_SHOPIFY_USA_LISTING_STATUS.DRAFT;
    } else if (adminStatus === 'ARCHIVED') {
      nextStatus = CJ_SHOPIFY_USA_LISTING_STATUS.ARCHIVED;
    } else if (
      adminStatus === 'ACTIVE' &&
      adminHandle &&
      publishedOnPublication !== false &&
      inventoryQuantity !== 0 &&
      storefront?.buyerFacingOk
    ) {
      nextStatus = CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE;
    } else if (adminStatus === 'ACTIVE') {
      nextStatus = CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING;
    } else {
      nextStatus = CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_FAILED;
    }

    const readyForStorefront = nextStatus === CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE;
    const nextError = readyForStorefront ? null : reasons.join(' ');
    const updateData: Prisma.CjShopifyUsaListingUpdateInput = {
      status: nextStatus,
      shopifyProductId: shopifyProduct?.id ?? productId,
      shopifyVariantId: variant?.id ?? normalizeShopifyVariantGid(listing.shopifyVariantId),
      shopifyHandle: adminHandle ?? listing.shopifyHandle,
      lastSyncedAt: new Date(),
      lastError: nextError || lookupError,
    };

    if (inventoryQuantity != null) {
      updateData.quantity = inventoryQuantity;
    }
    if (readyForStorefront && !listing.publishedAt) {
      updateData.publishedAt = new Date();
    }
    if (!readyForStorefront && nextStatus !== CJ_SHOPIFY_USA_LISTING_STATUS.FAILED) {
      updateData.publishedAt = null;
    }

    const statusChanged = nextStatus !== listing.status;
    const identifiersChanged =
      (shopifyProduct?.id ?? productId) !== listing.shopifyProductId ||
      (variant?.id ?? normalizeShopifyVariantGid(listing.shopifyVariantId)) !== listing.shopifyVariantId ||
      (adminHandle ?? listing.shopifyHandle ?? null) !== (listing.shopifyHandle ?? null);

    if (statusChanged || identifiersChanged || inventoryQuantity != null) {
      await prisma.cjShopifyUsaListing.update({
        where: { id: listing.id },
        data: updateData,
      });
    }

    if (statusChanged) {
      await recordTrace(listing.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_RECONCILE_SUCCESS, 'listing.live_truth.reconciled', {
        listingId: listing.id,
        fromStatus: listing.status,
        toStatus: nextStatus,
        reasons,
        shopifyProductId: shopifyProduct?.id ?? productId,
        shopifyAdminStatus: adminStatus,
        publishedOnPublication,
        inventoryQuantity,
        storefrontBuyerFacingOk: storefront?.buyerFacingOk ?? null,
      } as Prisma.InputJsonValue);
    }

    return {
      ...listing,
      status: nextStatus,
      shopifyProductId: shopifyProduct?.id ?? productId,
      shopifyVariantId: variant?.id ?? normalizeShopifyVariantGid(listing.shopifyVariantId),
      shopifyHandle: adminHandle ?? listing.shopifyHandle ?? null,
      quantity: inventoryQuantity ?? listing.quantity ?? null,
      lastError: nextError,
      storefrontUrl,
      publishTruth: {
        reconciledAt: new Date().toISOString(),
        source: 'SHOPIFY_ADMIN_LIVE',
        localStatusBefore: listing.status,
        localStatusAfter: nextStatus,
        shopifyIdentifiersPresent: Boolean(shopifyProduct?.id && variant?.id && adminHandle),
        buyerFacingVerified: Boolean(storefront?.buyerFacingOk),
        readyForStorefront,
        reasons,
        shopify: {
          exists: Boolean(shopifyProduct),
          productId: shopifyProduct?.id ?? productId,
          variantId: variant?.id ?? normalizeShopifyVariantGid(listing.shopifyVariantId),
          handle: adminHandle,
          adminStatus,
          publishedOnPublication,
          publicationId: resolvedTargets.publicationId,
          publicationName: resolvedTargets.publicationName,
          inventoryQuantity,
          inventoryItemId: variant?.inventoryItem?.id ?? null,
        },
        storefront: {
          url: storefrontUrl,
          status: storefront?.status ?? null,
          finalUrl: storefront?.finalUrl ?? null,
          passwordGate: storefront?.passwordGate ?? null,
          hasAddToCart: storefront?.hasAddToCart ?? null,
          hasPrice: storefront?.hasPrice ?? null,
          error: storefront?.error ?? null,
        },
      },
    };
  }

  async reconcileListings<T extends ListingLike>(userId: number, listings: T[]): Promise<Array<ReconciliationResult<T>>> {
    if (listings.length === 0) return [];
    const targets = await this.resolveTruthTargets(userId);
    const out: Array<ReconciliationResult<T>> = [];
    for (const listing of listings) {
      out.push(await this.reconcileListing(listing, targets));
    }
    return out;
  }
}

export const cjShopifyUsaReconciliationService = new CjShopifyUsaReconciliationService();
