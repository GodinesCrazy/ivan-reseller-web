import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import {
  CJ_SHOPIFY_USA_LISTING_STATUS,
  CJ_SHOPIFY_USA_TRACE_STEP,
} from '../cj-shopify-usa.constants';
import {
  cjShopifyUsaAdminService,
} from './cj-shopify-usa-admin.service';
import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';
import { createCjSupplierAdapter } from '../../cj-ebay/adapters/cj-supplier.adapter';

const SHOPIFY_INVENTORY_REPAIR_CAP = 50;

type ListingLike = {
  id: number;
  userId: number;
  productId?: number | null;
  status: string;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  shopifyHandle?: string | null;
  shopifySku?: string | null;
  quantity?: number | null;
  publishedAt?: Date | string | null;
  variant?: {
    id: number;
    productId?: number | null;
    cjSku?: string | null;
    cjVid?: string | null;
    stockLastKnown?: number | Prisma.Decimal | string | null;
  } | null;
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
  media?: {
    nodes?: Array<{ id: string }> | null;
  } | null;
  variants?: {
    nodes?: ShopifyVariantTruth[];
  } | null;
};

type StorefrontVerificationResult = {
  storefrontUrl: string;
  status: number | null;
  finalUrl: string | null;
  passwordGate: boolean;
  buyerFacingOk: boolean;
  hasAddToCart: boolean;
  hasPrice: boolean;
  error?: string;
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
    mediaCount: number | null;
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

function buildStorefrontUrl(shopDomain: string, productHandle: string): string {
  const raw = trim(shopDomain).replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
  // Use the branded custom domain for all public-facing product links
  const domain = raw === 'ivanreseller-2.myshopify.com' ? 'shop.ivanreseller.com' : raw;
  const handle = trim(productHandle).replace(/^\/+|\/+$/g, '');
  return `https://${domain}/products/${encodeURIComponent(handle)}`;
}

function availableQuantity(variant: ShopifyVariantTruth | null): number | null {
  const quantities = variant?.inventoryItem?.inventoryLevel?.quantities ?? [];
  const available = quantities.find((entry) => entry.name === 'available');
  return Number.isFinite(available?.quantity) ? Number(available?.quantity) : null;
}

function toSafeInt(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function toRepairQuantity(stock: unknown): number {
  return Math.min(toSafeInt(stock), SHOPIFY_INVENTORY_REPAIR_CAP);
}

function inventoryRepairKeyPart(value: string | null | undefined): string {
  return trim(value).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80) || 'unknown';
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
  private async verifyStorefrontProductPage(input: {
    userId: number;
    productHandle: string;
  }): Promise<StorefrontVerificationResult> {
    const token = await cjShopifyUsaAdminService.getAccessToken(input.userId);
    const storefrontUrl = buildStorefrontUrl(token.shopDomain, input.productHandle);

    try {
      const response = await fetch(storefrontUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 Ivan Reseller Storefront Integrity Auditor',
        },
      });
      const html = await response.text();
      const finalUrl = response.url;
      const lowerHtml = html.toLowerCase();
      const lowerFinalUrl = finalUrl.toLowerCase();
      const handle = trim(input.productHandle).toLowerCase();

      const passwordGate =
        lowerFinalUrl.includes('/password') ||
        lowerHtml.includes('enter store using password') ||
        lowerHtml.includes('opening soon');
      const hasAddToCart =
        /\/cart\/add|add to cart|agregar al carrito|data-type="add-to-cart-form"|name="add"/i.test(html);
      const hasPrice = /\$\s?\d|usd/i.test(html);
      const finalUrlMatchesHandle =
        lowerFinalUrl.includes(`/products/${encodeURIComponent(handle)}`) ||
        lowerFinalUrl.includes(`/products/${handle}`);
      const hasNotFoundMarker = /404|not found/i.test(html.slice(0, 3000));

      return {
        storefrontUrl,
        status: response.status,
        finalUrl,
        passwordGate,
        hasAddToCart,
        hasPrice,
        buyerFacingOk:
          response.status >= 200 &&
          response.status < 300 &&
          finalUrlMatchesHandle &&
          !passwordGate &&
          !hasNotFoundMarker &&
          hasAddToCart &&
          hasPrice,
      };
    } catch (error) {
      return {
        storefrontUrl,
        status: null,
        finalUrl: null,
        passwordGate: false,
        hasAddToCart: false,
        hasPrice: false,
        buyerFacingOk: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

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
              media(first: 50) {
                nodes {
                  id
                }
              }
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

  private async repairZeroInventoryFromCj(input: {
    listing: ListingLike;
    product: ShopifyProductTruth;
    productId: string;
    productHandle: string | null;
    locationId: string | null;
  }): Promise<{ repairedCount: number; primaryInventoryQuantity: number | null; errors: string[] }> {
    if (!input.locationId) {
      return { repairedCount: 0, primaryInventoryQuantity: null, errors: ['No Shopify location is available for inventory repair.'] };
    }

    const localProductId = input.listing.variant?.productId ?? input.listing.productId ?? null;
    const localVariants = localProductId
      ? await prisma.cjShopifyUsaProductVariant.findMany({ where: { productId: localProductId } })
      : input.listing.variant
        ? [input.listing.variant]
        : [];

    if (localVariants.length === 0) {
      return { repairedCount: 0, primaryInventoryQuantity: null, errors: ['No local CJ variants available for inventory repair.'] };
    }

    const localBySku = new Map(
      localVariants
        .map((variant) => [trim(variant.cjSku).toLowerCase(), variant] as const)
        .filter(([sku]) => Boolean(sku)),
    );
    const vids = localVariants.map((variant) => trim(variant.cjVid)).filter(Boolean);
    const liveStock = new Map<string, number>();

    if (vids.length > 0) {
      try {
        const adapter = createCjSupplierAdapter(input.listing.userId);
        const stockMap = await adapter.getStockForSkus(vids);
        for (const [vid, stock] of stockMap.entries()) {
          if (Number.isFinite(stock)) liveStock.set(vid, Math.max(0, Math.floor(stock)));
        }
      } catch {
        // Use local stockLastKnown if CJ live stock is temporarily unavailable.
      }
    }

    const errors: string[] = [];
    let repairedCount = 0;
    let primaryInventoryQuantity: number | null = null;
    const storedPrimaryVariantId = normalizeShopifyVariantGid(input.listing.shopifyVariantId);
    const primarySku = trim(input.listing.shopifySku).toLowerCase();

    for (const shopifyVariant of input.product.variants?.nodes ?? []) {
      const sku = trim(shopifyVariant.sku).toLowerCase();
      const localVariant = localBySku.get(sku);
      const inventoryItemId = shopifyVariant.inventoryItem?.id ?? null;
      if (!sku || !localVariant || !inventoryItemId) continue;

      const currentAvailable = availableQuantity(shopifyVariant);
      if (currentAvailable != null && currentAvailable > 0) continue;

      const stock = liveStock.get(trim(localVariant.cjVid)) ?? localVariant.stockLastKnown ?? 0;
      const repairQuantity = toRepairQuantity(stock);
      if (repairQuantity <= 0) continue;

      try {
        const inventoryKey = inventoryRepairKeyPart(inventoryItemId.split('/').pop());
        const skuKey = inventoryRepairKeyPart(shopifyVariant.sku ?? sku);
        await cjShopifyUsaAdminService.setInventoryQuantity({
          userId: input.listing.userId,
          inventoryItemId,
          locationId: input.locationId,
          quantity: repairQuantity,
          referenceDocumentUri: `logistics://cj-shopify-usa/reconcile-inventory/${input.listing.id}/${inventoryKey}/${skuKey}`,
          idempotencyKey: `reconcile-inventory-${input.listing.id}-${inventoryKey}-${repairQuantity}`,
        });

        if (liveStock.has(trim(localVariant.cjVid))) {
          await prisma.cjShopifyUsaProductVariant.update({
            where: { id: localVariant.id },
            data: { stockLastKnown: liveStock.get(trim(localVariant.cjVid)), stockCheckedAt: new Date() },
          });
        }

        await prisma.cjShopifyUsaListing.updateMany({
          where: {
            userId: input.listing.userId,
            productId: localVariant.productId ?? localProductId ?? undefined,
            variantId: localVariant.id,
          },
          data: {
            shopifyProductId: input.productId,
            shopifyVariantId: shopifyVariant.id,
            shopifyHandle: input.productHandle,
            shopifySku: shopifyVariant.sku ?? localVariant.cjSku,
            quantity: repairQuantity,
            lastSyncedAt: new Date(),
          },
        });

        repairedCount++;
        if (shopifyVariant.id === storedPrimaryVariantId || sku === primarySku) {
          primaryInventoryQuantity = repairQuantity;
        }
      } catch (error) {
        errors.push(
          `Inventory repair failed for SKU ${shopifyVariant.sku ?? sku}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (repairedCount > 0) {
      await recordTrace(input.listing.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_RECONCILE_SUCCESS, 'listing.inventory.repaired_from_cj', {
        listingId: input.listing.id,
        shopifyProductId: input.productId,
        shopifyHandle: input.productHandle,
        repairedCount,
        cap: SHOPIFY_INVENTORY_REPAIR_CAP,
        errors,
      } as Prisma.InputJsonValue);
    }

    return { repairedCount, primaryInventoryQuantity, errors };
  }

  private buildLocalDraftTruth<T extends ListingLike>(
    listing: T,
    shopDomain: string | null,
  ): ReconciliationResult<T> {
    const draftOnlyStatuses = new Set<string>([
      CJ_SHOPIFY_USA_LISTING_STATUS.DRAFT,
      CJ_SHOPIFY_USA_LISTING_STATUS.FAILED,
    ]);
    const nextStatus = draftOnlyStatuses.has(listing.status)
      ? listing.status
      : CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_FAILED;
    const reasons = nextStatus === listing.status
      ? ['No Shopify product id is stored for this listing yet.']
      : [`Local status ${listing.status} claims Shopify state, but no Shopify product id is stored.`];

    let storefrontUrl: string | null = null;
    if (shopDomain && listing.shopifyHandle) {
      try {
        storefrontUrl = buildStorefrontUrl(shopDomain, listing.shopifyHandle);
      } catch {
        storefrontUrl = null;
      }
    }

    return {
      ...listing,
      status: nextStatus,
      storefrontUrl,
      publishTruth: {
        reconciledAt: new Date().toISOString(),
        source: 'LOCAL_DRAFT_ONLY',
        localStatusBefore: listing.status,
        localStatusAfter: nextStatus,
        shopifyIdentifiersPresent: Boolean(
          listing.shopifyProductId && listing.shopifyVariantId && listing.shopifyHandle,
        ),
        buyerFacingVerified: false,
        readyForStorefront: false,
        reasons,
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
          mediaCount: null,
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
      const result = this.buildLocalDraftTruth(listing, resolvedTargets.shopDomain);
      if (result.status !== listing.status) {
        await prisma.cjShopifyUsaListing.update({
          where: { id: listing.id },
          data: {
            status: result.status,
            lastSyncedAt: new Date(),
            publishedAt: null,
            lastError: result.publishTruth.reasons.join(' '),
          },
        });
        await recordTrace(listing.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_RECONCILE_FAILED, 'listing.live_truth.missing_shopify_id', {
          listingId: listing.id,
          fromStatus: listing.status,
          toStatus: result.status,
          reasons: result.publishTruth.reasons,
        } as Prisma.InputJsonValue);
      }
      return result;
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

    let variant = shopifyProduct ? chooseVariant(listing, shopifyProduct) : null;
    let inventoryQuantity = availableQuantity(variant);
    let adminStatus = trim(shopifyProduct?.status).toUpperCase() || null;
    let adminHandle = trim(shopifyProduct?.handle) || null;
    let mediaCount = shopifyProduct?.media?.nodes?.length ?? null;
    let publishedOnPublication =
      typeof shopifyProduct?.publishedOnPublication === 'boolean'
        ? shopifyProduct.publishedOnPublication
        : null;
    let inventoryRepair: Awaited<ReturnType<CjShopifyUsaReconciliationService['repairZeroInventoryFromCj']>> | null = null;

    if (
      shopifyProduct &&
      adminStatus === 'ACTIVE' &&
      variant?.inventoryItem?.id &&
      inventoryQuantity != null &&
      inventoryQuantity <= 0
    ) {
      inventoryRepair = await this.repairZeroInventoryFromCj({
        listing,
        product: shopifyProduct,
        productId,
        productHandle: adminHandle,
        locationId: resolvedTargets.locationId,
      });

      if (inventoryRepair.repairedCount > 0) {
        shopifyProduct = await this.fetchShopifyProduct({
          userId: listing.userId,
          productId,
          publicationId: resolvedTargets.publicationId,
          locationId: resolvedTargets.locationId,
        });
        variant = shopifyProduct ? chooseVariant(listing, shopifyProduct) : null;
        inventoryQuantity = availableQuantity(variant) ?? inventoryRepair.primaryInventoryQuantity;
        adminStatus = trim(shopifyProduct?.status).toUpperCase() || null;
        adminHandle = trim(shopifyProduct?.handle) || null;
        mediaCount = shopifyProduct?.media?.nodes?.length ?? null;
        publishedOnPublication =
          typeof shopifyProduct?.publishedOnPublication === 'boolean'
            ? shopifyProduct.publishedOnPublication
            : null;
      }
    }

    let storefrontUrl: string | null = null;
    let storefront: StorefrontVerificationResult | null = null;
    if (adminHandle) {
      try {
        storefrontUrl = buildStorefrontUrl(resolvedTargets.shopDomain, adminHandle);
      } catch {
        storefrontUrl = null;
      }
    }

    if (adminStatus === 'ACTIVE' && adminHandle) {
      storefront = await this.verifyStorefrontProductPage({
        userId: listing.userId,
        productHandle: adminHandle,
      });
    }

    if (!shopifyProduct) {
      reasons.push('Stored Shopify product id does not exist in Shopify Admin.');
    } else {
      if (!adminHandle) reasons.push('Shopify Admin product has no handle.');
      if (adminStatus !== 'ACTIVE') reasons.push(`Shopify Admin product status is ${adminStatus ?? 'UNKNOWN'}.`);
      if (mediaCount === 0) reasons.push('Shopify Admin product has no product images.');
      if (publishedOnPublication === false) reasons.push('Product is not published on the selected Shopify publication.');
      if (inventoryQuantity != null && inventoryQuantity <= 0) reasons.push('Shopify available inventory is 0.');
      if (inventoryRepair?.repairedCount) reasons.push(`Shopify inventory repaired from CJ stock for ${inventoryRepair.repairedCount} variant(s).`);
      for (const repairError of inventoryRepair?.errors ?? []) reasons.push(repairError);
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
      nextStatus = CJ_SHOPIFY_USA_LISTING_STATUS.PAUSED;
    } else if (adminStatus === 'ARCHIVED') {
      nextStatus = CJ_SHOPIFY_USA_LISTING_STATUS.ARCHIVED;
    } else if (
      adminStatus === 'ACTIVE' &&
      adminHandle &&
      mediaCount !== 0 &&
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
        mediaCount,
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
          mediaCount,
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
