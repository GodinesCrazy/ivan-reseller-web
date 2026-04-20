import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError, ErrorCode } from '../../../middleware/error.middleware';
import { cjShopifyUsaAdminService } from './cj-shopify-usa-admin.service';
import { cjShopifyUsaQualificationService } from './cj-shopify-usa-qualification.service';
import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';
import {
  CJ_SHOPIFY_USA_LISTING_STATUS,
  CJ_SHOPIFY_USA_TRACE_STEP,
} from '../cj-shopify-usa.constants';

function sanitizeHandle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function toUsdNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function toSafeInt(value: unknown): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

function buildDraftDescription(product: { title: string; description: string | null }) {
  const body = String(product.description || '').trim();
  if (body.length > 0) {
    return body;
  }
  return `<p>${product.title}</p><p>Fulfilled by CJ Dropshipping for the US market.</p>`;
}

async function recordTrace(userId: number, step: string, message: string, meta?: Prisma.InputJsonValue) {
  await prisma.cjShopifyUsaExecutionTrace.create({
    data: {
      userId,
      step,
      message,
      meta,
    },
  });
}

export const cjShopifyUsaPublishService = {
  async buildDraft(input: {
    userId: number;
    productId: number;
    variantId?: number | null;
    quantity?: number;
  }) {
    const product = await prisma.cjShopifyUsaProduct.findFirst({
      where: {
        id: input.productId,
        userId: input.userId,
      },
      include: {
        variants: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!product) {
      throw new AppError('CJ Shopify USA product not found.', 404, ErrorCode.NOT_FOUND);
    }

    const variant =
      (input.variantId
        ? product.variants.find((candidate) => candidate.id === input.variantId)
        : product.variants[0]) || null;

    if (!variant) {
      throw new AppError('Product variant not found for Shopify draft.', 400, ErrorCode.VALIDATION_ERROR);
    }

    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(input.userId);
    const minStock = Math.max(0, Number(settings.minStock ?? 1));
    const availableStock = toSafeInt(variant.stockLastKnown);

    if (availableStock < minStock) {
      throw new AppError(
        `Variant stock is ${availableStock}; minimum stock requirement is ${minStock}.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const shippingQuote = await prisma.cjShopifyUsaShippingQuote.findFirst({
      where: {
        userId: input.userId,
        productId: product.id,
        variantId: variant.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    const estimatedShippingUsd = shippingQuote ? toUsdNumber(shippingQuote.amountUsd) : 0;
    const supplierCostUsd = toUsdNumber(variant.unitCostUsd);

    if (!supplierCostUsd || supplierCostUsd <= 0) {
      throw new AppError(
        'Variant unit cost is missing. Sync/evaluate the CJ product before creating a Shopify draft.',
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const qualification = await cjShopifyUsaQualificationService.evaluate(
      input.userId,
      supplierCostUsd,
      estimatedShippingUsd,
    );

    const suggestedSellPriceUsd = Number(
      qualification.breakdown.suggestedSellPriceUsd.toFixed(2),
    );
    const baseQuantity = input.quantity ?? 1;
    const safeQuantity = toSafeInt(baseQuantity);
    if (safeQuantity <= 0) {
      throw new AppError('Draft quantity must be at least 1.', 400, ErrorCode.VALIDATION_ERROR);
    }
    if (safeQuantity > availableStock) {
      throw new AppError(
        `Requested draft quantity ${safeQuantity} exceeds current CJ stock ${availableStock}.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }
    const handle = sanitizeHandle(`${product.title}-${variant.cjSku}`);

    const draftPayload = {
      cjProductId: product.cjProductId,
      cjSku: variant.cjSku,
      cjVid: variant.cjVid,
      title: product.title,
      descriptionHtml: buildDraftDescription(product),
      vendor: 'CJ Dropshipping',
      productType: 'CJ Dropshipping',
      handle,
      images: (Array.isArray(product.images) ? product.images : []) as Prisma.InputJsonValue,
      quantity: safeQuantity,
      pricingSnapshot: {
        supplierCostUsd,
        shippingCostUsd: estimatedShippingUsd,
        paymentProcessingFeeUsd: qualification.breakdown.paymentProcessingFeeUsd,
        targetProfitUsd: qualification.breakdown.targetProfitUsd,
        suggestedSellPriceUsd,
      },
      shippingSnapshot: shippingQuote
        ? {
            amountUsd: estimatedShippingUsd,
            carrier: shippingQuote.carrier,
            serviceName: shippingQuote.serviceName,
            estimatedMinDays: shippingQuote.estimatedMinDays,
            estimatedMaxDays: shippingQuote.estimatedMaxDays,
            originCountryCode: shippingQuote.originCountryCode,
          }
        : null,
      variantAttributes: variant.attributes,
    } satisfies Prisma.InputJsonValue;

    const existing = await prisma.cjShopifyUsaListing.findFirst({
      where: {
        userId: input.userId,
        productId: product.id,
        variantId: variant.id,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const listing = existing
      ? await prisma.cjShopifyUsaListing.update({
          where: { id: existing.id },
          data: {
            status: CJ_SHOPIFY_USA_LISTING_STATUS.DRAFT,
            listedPriceUsd: suggestedSellPriceUsd,
            quantity: safeQuantity,
            shopifySku: variant.cjSku,
            draftPayload,
            lastError: null,
          },
        })
      : await prisma.cjShopifyUsaListing.create({
          data: {
            userId: input.userId,
            productId: product.id,
            variantId: variant.id,
            status: CJ_SHOPIFY_USA_LISTING_STATUS.DRAFT,
            listedPriceUsd: suggestedSellPriceUsd,
            quantity: safeQuantity,
            shopifySku: variant.cjSku,
            draftPayload,
          },
        });

    await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_DRAFT_CREATED, 'listing.draft.created', {
      listingId: listing.id,
      productId: product.id,
      variantId: variant.id,
      handle,
      suggestedSellPriceUsd,
    } as Prisma.InputJsonValue);

    return listing;
  },

  async publishListing(input: {
    userId: number;
    listingId: number;
  }) {
    const listing = await prisma.cjShopifyUsaListing.findFirst({
      where: {
        id: input.listingId,
        userId: input.userId,
      },
      include: {
        product: true,
        variant: true,
      },
    });

    if (!listing) {
      throw new AppError('Listing not found.', 404, ErrorCode.NOT_FOUND);
    }

    const draft = (listing.draftPayload || null) as Record<string, any> | null;
    if (!draft) {
      throw new AppError('Listing draft payload is missing. Create a draft first.', 400, ErrorCode.VALIDATION_ERROR);
    }

    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(input.userId);
    const minStock = Math.max(0, Number(settings.minStock ?? 1));
    const availableStock = toSafeInt(listing.variant?.stockLastKnown);
    const desiredQuantity = toSafeInt(listing.quantity ?? draft.quantity ?? 0);

    if (availableStock < minStock) {
      throw new AppError(
        `Listing variant stock is ${availableStock}; minimum stock requirement is ${minStock}.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    if (desiredQuantity <= 0) {
      throw new AppError('Listing quantity must be at least 1 before publish.', 400, ErrorCode.VALIDATION_ERROR);
    }

    if (desiredQuantity > availableStock) {
      throw new AppError(
        `Listing quantity ${desiredQuantity} exceeds current CJ stock ${availableStock}.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const probe = await cjShopifyUsaAdminService.probeConnection(input.userId);

    if (probe.missingScopes.length > 0) {
      throw new AppError(
        `Shopify app is missing required scopes: ${probe.missingScopes.join(', ')}`,
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    const preferredLocationId = String(settings.shopifyLocationId || '').trim();
    const location =
      probe.locations.find((candidate) => candidate.id === preferredLocationId) ||
      probe.locations.find((candidate) => candidate.isActive && candidate.fulfillsOnlineOrders) ||
      probe.locations.find((candidate) => candidate.isActive) ||
      probe.locations[0];

    if (!location?.id) {
      throw new AppError(
        'No Shopify location is available for inventory sync.',
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    const publication =
      probe.publications.find((candidate) => candidate.name.toLowerCase().includes('online store')) ||
      probe.publications[0];

    if (!publication?.id) {
      throw new AppError(
        'No Shopify publication was found. The Online Store sales channel must be available.',
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    await prisma.cjShopifyUsaListing.update({
      where: { id: listing.id },
      data: {
        status: CJ_SHOPIFY_USA_LISTING_STATUS.PUBLISHING,
        lastError: null,
      },
    });

    await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_PUBLISH_START, 'listing.publish.start', {
      listingId: listing.id,
      publicationId: publication.id,
      locationId: location.id,
    } as Prisma.InputJsonValue);

    try {
      const upserted = await cjShopifyUsaAdminService.upsertProduct({
        userId: input.userId,
        identifierId: listing.shopifyProductId,
        handle: draft.handle || listing.shopifyHandle || null,
        title: String(draft.title || listing.product.title),
        descriptionHtml: String(draft.descriptionHtml || ''),
        vendor: String(draft.vendor || 'CJ Dropshipping'),
        productType: String(draft.productType || 'CJ Dropshipping'),
        tags: ['cj-shopify-usa', `cj-product:${listing.product.cjProductId}`],
        sku: String(listing.shopifySku || listing.variant?.cjSku || draft.cjSku || '').trim(),
        price: Number(listing.listedPriceUsd || draft.pricingSnapshot?.suggestedSellPriceUsd || 0),
        status: 'ACTIVE',
      });

      await cjShopifyUsaAdminService.setInventoryQuantity({
        userId: input.userId,
        inventoryItemId: upserted.inventoryItemId,
        locationId: location.id,
        quantity: desiredQuantity,
        referenceDocumentUri: `logistics://cj-shopify-usa/listing/${listing.id}`,
        idempotencyKey: `cj-shopify-usa-${listing.id}-${desiredQuantity}`,
      });

      await cjShopifyUsaAdminService.publishProductToPublication({
        userId: input.userId,
        productId: upserted.productId,
        publicationId: publication.id,
      });

      const updated = await prisma.cjShopifyUsaListing.update({
        where: { id: listing.id },
        data: {
          status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
          shopifyProductId: upserted.productId,
          shopifyVariantId: upserted.variantId,
          shopifyHandle: upserted.handle,
          shopifySku: String(listing.shopifySku || listing.variant?.cjSku || draft.cjSku || '').trim(),
          publishedAt: new Date(),
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });

      await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_PUBLISH_SUCCESS, 'listing.publish.success', {
        listingId: listing.id,
        shopifyProductId: upserted.productId,
        shopifyVariantId: upserted.variantId,
        publicationId: publication.id,
        locationId: location.id,
      } as Prisma.InputJsonValue);

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.cjShopifyUsaListing.update({
        where: { id: listing.id },
        data: {
          status: CJ_SHOPIFY_USA_LISTING_STATUS.FAILED,
          lastError: message,
        },
      });

      await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_PUBLISH_ERROR, 'listing.publish.error', {
        listingId: listing.id,
        error: message,
      } as Prisma.InputJsonValue);

      throw error;
    }
  },
};
