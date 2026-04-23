import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError, ErrorCode } from '../../../middleware/error.middleware';
import { createCjSupplierAdapter } from '../../cj-ebay/adapters/cj-supplier.adapter';
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

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&times;/gi, 'x')
    .replace(/&deg;/gi, ' degrees ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtmlToPlainText(input: string): string {
  const text = decodeHtmlEntities(
    input
      .replace(/<img\b[^>]*>/gi, ' ')
      .replace(/<table[\s\S]*?<\/table>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '\n'),
  );

  return text
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join('\n');
}

function toTitleCase(input: string): string {
  const minorWords = new Set(['and', 'or', 'for', 'the', 'with', 'of', 'a', 'an', 'to', 'in']);
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && minorWords.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function sentenceCase(input: string): string {
  const text = normalizeWhitespace(input)
    .replace(/\b([A-Z][A-Z0-9&/-]{2,})\b/g, (word) => {
      if (['RFID', 'USB', 'LED', 'AAA', 'USPS', 'VIP'].includes(word)) {
        return word;
      }
      return toTitleCase(word.toLowerCase());
    })
    .replace(/\s*:\s*/g, ': ');
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function dedupeWords(words: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result;
}

function trimTitleToFit(input: string, maxLength = 58): string {
  if (input.length <= maxLength) return input;
  const words = input.split(/\s+/);
  const kept: string[] = [];
  for (const word of words) {
    const candidate = [...kept, word].join(' ');
    if (candidate.length > maxLength) break;
    kept.push(word);
  }
  return kept.length > 0 ? kept.join(' ') : input.slice(0, maxLength).trim();
}

function buildProfessionalTitle(input: {
  title: string;
  variantAttributes?: Record<string, unknown> | null;
}) {
  const rawTitle = normalizeWhitespace(
    stripHtmlToPlainText(String(input.title || ''))
      .replace(/[_/]+/g, ' ')
      .replace(/[|]+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s+-\s+/g, ' '),
  );
  const lowered = rawTitle.toLowerCase();

  if (/keyboard.*mouse.*wrist rest/i.test(rawTitle)) return 'Keyboard and Mouse Wrist Rest Set';
  if (/lipstick|lip gloss|chapstick|mascara/i.test(rawTitle) && /(organizer|holder)/i.test(rawTitle)) return 'Lipstick Organizer';
  if (/car seat gap/i.test(rawTitle) && /(organizer|filler|console)/i.test(rawTitle)) return 'Car Seat Gap Organizer';
  if (/carbon fiber/i.test(rawTitle) && /(wallet|card holder)/i.test(rawTitle) && /rfid/i.test(rawTitle)) return 'Carbon Fiber RFID Wallet';
  if (/pet grooming/i.test(rawTitle) && /scissors/i.test(rawTitle)) return 'Pet Grooming Scissors';
  if (/kitchen/i.test(rawTitle) && /timer/i.test(rawTitle)) return 'Digital Kitchen Timer';
  if (/tablet stand/i.test(rawTitle)) return 'Foldable Tablet Stand';

  const firstClause = rawTitle.split(/\s*,\s*/)[0].split(/\s+(?:with|for)\s+/i)[0];
  const tokens = dedupeWords(
    firstClause
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );

  const stopwords = new Set([
    'for',
    'with',
    'and',
    'the',
    'a',
    'an',
    'of',
    'sample',
    'commercial',
    'practical',
    'everyday',
  ]);

  const preferred = tokens.filter((token) => !stopwords.has(token.toLowerCase()));
  const fallbackWords = preferred.length > 0 ? preferred : tokens;
  return trimTitleToFit(toTitleCase(fallbackWords.slice(0, 6).join(' ')));
}

function collectAttributeSpecs(attributes: Record<string, unknown> | null | undefined): string[] {
  if (!attributes || typeof attributes !== 'object') return [];
  const entries = Object.entries(attributes)
    .map(([key, value]) => [normalizeWhitespace(key), normalizeWhitespace(String(value ?? ''))] as const)
    .filter(([key, value]) => key && value && value.length <= 80);

  return entries
    .filter(([key, value]) => {
      const lowerValue = value.toLowerCase();
      return key.toLowerCase() !== 'label' && !/^default$/i.test(lowerValue);
    })
    .slice(0, 5)
    .map(([key, value]) => `${toTitleCase(key)}: ${value}`);
}

function uniqueItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = normalizeWhitespace(item).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalizeWhitespace(item));
  }
  return result;
}

function buildDefaultLead(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('organizer')) return `A practical ${lower} designed to keep everyday essentials neat, visible, and easy to reach.`;
  if (lower.includes('timer')) return `A clear and easy-to-use ${lower} designed for kitchens, desks, and daily routines.`;
  if (lower.includes('wallet')) return `A slim ${lower} built for everyday carry, quick access, and a cleaner pocket setup.`;
  if (lower.includes('scissors')) return `A precise pair of ${lower} designed for clean trimming and comfortable control.`;
  if (lower.includes('wrist rest')) return `A supportive ${lower} made for more comfortable typing, clicking, and long desk sessions.`;
  if (lower.includes('gap organizer')) return `A space-saving ${lower} that keeps small essentials within reach while reducing car clutter.`;
  if (lower.includes('stand')) return `A stable ${lower} for hands-free viewing at home, work, or on the go.`;
  return `A practical ${lower} designed for everyday use.`;
}

function buildDraftDescription(input: {
  title: string;
  description: string | null;
  variantAttributes?: Record<string, unknown> | null;
}) {
  const professionalTitle = buildProfessionalTitle({
    title: input.title,
    variantAttributes: input.variantAttributes,
  });
  const rawText = stripHtmlToPlainText(String(input.description || ''));
  const lines = rawText
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const ignoredHeadings = new Set([
    'product information',
    'size information',
    'packing list',
    'product image',
    'product images',
  ]);

  const specLines: string[] = [];
  const packageLines: string[] = [];
  const highlightLines: string[] = [];

  for (const line of lines) {
    const cleaned = sentenceCase(line.replace(/^[\-\u2022]+\s*/, '').replace(/\*+/g, 'x'));
    const normalizedLower = cleaned.toLowerCase().replace(/:$/, '');
    if (!cleaned || ignoredHeadings.has(normalizedLower)) continue;
    if (/light shooting|different displays|measurement error|other products are not included/i.test(cleaned)) continue;

    if (/^\d+\s*[x*]/i.test(cleaned) || /^x?\d+\s*[a-z]/i.test(cleaned)) {
      packageLines.push(cleaned.replace(/\s*\*+\s*/g, ' x '));
      continue;
    }

    const colonIndex = cleaned.indexOf(':');
    if (colonIndex > 0 && colonIndex <= 28 && cleaned.length <= 110) {
      specLines.push(cleaned);
      continue;
    }

    const sentenceParts = cleaned
      .split(/(?<=[.!?])\s+/)
      .map((part) => sentenceCase(part))
      .filter((part) => part.length >= 24 && part.length <= 170);

    if (sentenceParts.length > 0) {
      highlightLines.push(...sentenceParts);
    }
  }

  const highlights = uniqueItems(highlightLines).slice(0, 4);
  const details = uniqueItems([...collectAttributeSpecs(input.variantAttributes), ...specLines]).slice(0, 6);
  const inTheBox = uniqueItems(packageLines).slice(0, 4);

  const lead = highlights[0] && highlights[0].length <= 150
    ? highlights[0]
    : buildDefaultLead(professionalTitle);
  const remainingHighlights = highlights[0] === lead ? highlights.slice(1) : highlights;

  const htmlParts = [`<p>${lead}</p>`];

  if (remainingHighlights.length > 0) {
    htmlParts.push('<h3>Highlights</h3>');
    htmlParts.push(`<ul>${remainingHighlights.map((item) => `<li>${item}</li>`).join('')}</ul>`);
  }

  if (details.length > 0) {
    htmlParts.push('<h3>Product Details</h3>');
    htmlParts.push(`<ul>${details.map((item) => `<li>${item}</li>`).join('')}</ul>`);
  }

  if (inTheBox.length > 0) {
    htmlParts.push('<h3>In the Box</h3>');
    htmlParts.push(`<ul>${inTheBox.map((item) => `<li>${item}</li>`).join('')}</ul>`);
  }

  htmlParts.push('<p>Please review the measurements and variant details before purchase.</p>');
  return htmlParts.join('');
}

function buildDraftTitle(input: {
  title: string;
  variantAttributes?: Record<string, unknown> | null;
}) {
  const professionalTitle = buildProfessionalTitle(input);
  if (professionalTitle.length > 0) {
    return professionalTitle;
  }
  return trimTitleToFit(toTitleCase(stripHtmlToPlainText(input.title)));
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

async function ensureShopifyImagesAttached(input: {
  userId: number;
  listingId: number;
  productId: string;
  mediaPayload: Array<{ originalSource: string; mediaContentType: 'IMAGE' }>;
}) {
  const draftProductAfterImageFailure = async (reason: string) => {
    try {
      await cjShopifyUsaAdminService.updateProductStatus({
        userId: input.userId,
        productId: input.productId,
        status: 'DRAFT',
      });
      console.warn(
        `[ShopifyPublish] Listing ${input.listingId} product ${input.productId} moved to DRAFT after image failure: ${reason}`,
      );
    } catch (statusError) {
      console.warn(
        `[ShopifyPublish] Could not move listing ${input.listingId} product ${input.productId} to DRAFT after image failure: ${
          statusError instanceof Error ? statusError.message : String(statusError)
        }`,
      );
    }
  };

  if (input.mediaPayload.length === 0) {
    await draftProductAfterImageFailure('no local image URLs in draft payload');
    throw new AppError(
      'Listing cannot be published to Shopify without at least one product image.',
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  let mediaCount = await cjShopifyUsaAdminService.getProductMediaCount({
    userId: input.userId,
    productId: input.productId,
  });

  console.log(
    `[ShopifyPublish] Listing ${input.listingId} product ${input.productId} has ${mediaCount} media items (expected ${input.mediaPayload.length})`,
  );

  if (mediaCount === 0) {
    console.log(
      `[ShopifyPublish] Fallback: productSet did not attach images. Attempting productCreateMedia for ${input.mediaPayload.length} images.`,
    );
    try {
      await cjShopifyUsaAdminService.productCreateMedia({
        userId: input.userId,
        productId: input.productId,
        media: input.mediaPayload,
      });
    } catch (error) {
      await draftProductAfterImageFailure(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  for (const delayMs of [500, 1500, 3000]) {
    mediaCount = await cjShopifyUsaAdminService.getProductMediaCount({
      userId: input.userId,
      productId: input.productId,
    });
    if (mediaCount > 0) {
      return mediaCount;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  mediaCount = await cjShopifyUsaAdminService.getProductMediaCount({
    userId: input.userId,
    productId: input.productId,
  });

  if (mediaCount <= 0) {
    await draftProductAfterImageFailure('Shopify media count remained 0 after upload verification');
    throw new AppError(
      `Shopify product was created but no images are attached after upload verification. productId=${input.productId}`,
      502,
      ErrorCode.EXTERNAL_API_ERROR,
    );
  }

  return mediaCount;
}

async function resolveLatestVariantStock(input: {
  userId: number;
  variantId: number;
  cjVid?: string | null;
  fallbackStock?: Prisma.Decimal | number | string | null;
}): Promise<number> {
  const fallback = toSafeInt(input.fallbackStock);
  const vid = String(input.cjVid || '').trim();
  if (!vid) {
    return fallback;
  }

  try {
    const adapter = createCjSupplierAdapter(input.userId);
    const stockMap = await adapter.getStockForSkus([vid]);
    const liveStock = stockMap.get(vid);
    if (liveStock === undefined || !Number.isFinite(liveStock)) {
      return fallback;
    }

    const normalized = Math.max(0, Math.floor(liveStock));
    await prisma.cjShopifyUsaProductVariant.update({
      where: { id: input.variantId },
      data: {
        stockLastKnown: normalized,
        stockCheckedAt: new Date(),
      },
    });
    return normalized;
  } catch {
    return fallback;
  }
}

async function resolveShopifyPublishTargets(userId: number) {
  const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
  const probe = await cjShopifyUsaAdminService.probeConnection(userId);

  const preferredLocationId = String(settings.shopifyLocationId || '').trim();
  const location =
    probe.locations.find((candidate) => candidate.id === preferredLocationId) ||
    probe.locations.find((candidate) => candidate.isActive && candidate.fulfillsOnlineOrders) ||
    probe.locations.find((candidate) => candidate.isActive) ||
    probe.locations[0];

  const publication =
    probe.publications.find((candidate) => candidate.name.toLowerCase().includes('online store')) ||
    probe.publications[0];

  return {
    settings,
    probe,
    location,
    publication,
  };
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
    const availableStock = await resolveLatestVariantStock({
      userId: input.userId,
      variantId: variant.id,
      cjVid: variant.cjVid,
      fallbackStock: variant.stockLastKnown,
    });

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

    const evaluation = await prisma.cjShopifyUsaProductEvaluation.create({
      data: {
        userId: input.userId,
        productId: product.id,
        variantId: variant.id,
        shippingQuoteId: shippingQuote?.id ?? null,
        decision: qualification.decision,
        reasons: qualification.reasons as Prisma.InputJsonValue,
        estimatedMarginPct: qualification.breakdown.netMarginPct,
      },
    });

    if (qualification.decision === 'REJECTED') {
      throw new AppError(
        `Product does not meet pricing criteria: ${qualification.reasons.join('; ')}`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

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
    const draftTitle = buildDraftTitle({
      title: product.title,
      variantAttributes: (variant.attributes ?? null) as Record<string, unknown> | null,
    });
    const handle = sanitizeHandle(`${draftTitle}-${variant.cjSku}`);
    const descriptionHtml = buildDraftDescription({
      title: draftTitle,
      description: product.description,
      variantAttributes: (variant.attributes ?? null) as Record<string, unknown> | null,
    });

    const draftPayload = {
      cjProductId: product.cjProductId,
      cjSku: variant.cjSku,
      cjVid: variant.cjVid,
      title: draftTitle,
      descriptionHtml,
      vendor: 'CJ Dropshipping',
      productType: 'CJ Dropshipping',
      handle,
      images: (Array.isArray(product.images) ? product.images : []) as Prisma.InputJsonValue,
      quantity: safeQuantity,
      pricingSnapshot: {
        supplierCostUsd,
        shippingCostUsd: estimatedShippingUsd,
        incidentBufferUsd: qualification.breakdown.incidentBufferUsd,
        paymentProcessingFeeUsd: qualification.breakdown.paymentProcessingFeeUsd,
        targetProfitUsd: qualification.breakdown.targetProfitUsd,
        netProfitUsd: qualification.breakdown.netProfitUsd,
        netMarginPct: qualification.breakdown.netMarginPct,
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
            evaluationId: evaluation.id,
            shippingQuoteId: shippingQuote?.id ?? null,
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
            evaluationId: evaluation.id,
            shippingQuoteId: shippingQuote?.id ?? null,
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

    const { settings, probe, location, publication } = await resolveShopifyPublishTargets(input.userId);
    const minStock = Math.max(0, Number(settings.minStock ?? 1));
    const availableStock = listing.variant
      ? await resolveLatestVariantStock({
          userId: input.userId,
          variantId: listing.variant.id,
          cjVid: listing.variant.cjVid,
          fallbackStock: listing.variant.stockLastKnown,
        })
      : 0;
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

    if (probe.missingScopes.length > 0) {
      throw new AppError(
        `Shopify app is missing required scopes: ${probe.missingScopes.join(', ')}`,
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    if (!location?.id) {
      throw new AppError(
        'No Shopify location is available for inventory sync.',
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

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
      const mediaPayload = (Array.isArray(draft.images) ? draft.images : [])
        .map((src: string) => String(src).trim())
        .filter(Boolean)
        .map((src: string) => ({
          originalSource: src,
          mediaContentType: 'IMAGE' as const,
        }));

      console.log(`[ShopifyPublish] Publishing listing ${listing.id} with ${mediaPayload.length} images`);

      const upserted = await cjShopifyUsaAdminService.upsertProduct({
        userId: input.userId,
        identifierId: listing.shopifyProductId,
        handle: listing.shopifyHandle || draft.handle || null,
        title: String(draft.title || listing.product.title),
        descriptionHtml: String(draft.descriptionHtml || ''),
        vendor: String(draft.vendor || 'CJ Dropshipping'),
        productType: String(draft.productType || 'CJ Dropshipping'),
        tags: ['cj-shopify-usa', `cj-product:${listing.product.cjProductId}`],
        sku: String(listing.shopifySku || listing.variant?.cjSku || draft.cjSku || '').trim(),
        price: Number(listing.listedPriceUsd || draft.pricingSnapshot?.suggestedSellPriceUsd || 0),
        media: mediaPayload,
        status: 'ACTIVE',
      });

      const attachedMediaCount = await ensureShopifyImagesAttached({
        userId: input.userId,
        listingId: listing.id,
        productId: upserted.productId,
        mediaPayload,
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

      if (!upserted.productId || !upserted.variantId || !upserted.handle) {
        throw new AppError(
          'Shopify publish returned incomplete identifiers; product, variant, and handle are required.',
          502,
          ErrorCode.EXTERNAL_API_ERROR,
        );
      }

      let storefrontVerification = await cjShopifyUsaAdminService.verifyStorefrontProductPage({
        userId: input.userId,
        productHandle: upserted.handle,
      });

      if (!storefrontVerification.buyerFacingOk) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        storefrontVerification = await cjShopifyUsaAdminService.verifyStorefrontProductPage({
          userId: input.userId,
          productHandle: upserted.handle,
        });
      }

      if (!storefrontVerification.buyerFacingOk) {
        const reason = [
          `storefrontUrl=${storefrontVerification.storefrontUrl}`,
          `status=${storefrontVerification.status ?? 'FETCH_ERROR'}`,
          `finalUrl=${storefrontVerification.finalUrl ?? 'none'}`,
          `passwordGate=${storefrontVerification.passwordGate}`,
          `hasAddToCart=${storefrontVerification.hasAddToCart}`,
          `hasPrice=${storefrontVerification.hasPrice}`,
          storefrontVerification.error ? `error=${storefrontVerification.error}` : '',
        ].filter(Boolean).join('; ');

        const pending = await prisma.cjShopifyUsaListing.update({
          where: { id: listing.id },
          data: {
            status: CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING,
            shopifyProductId: upserted.productId,
            shopifyVariantId: upserted.variantId,
            shopifyHandle: upserted.handle,
            shopifySku: String(listing.shopifySku || listing.variant?.cjSku || draft.cjSku || '').trim(),
            lastSyncedAt: new Date(),
            lastError: `Shopify product was created/published but buyer-facing storefront verification failed: ${reason}`,
          },
        });

        await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_RECONCILE_PENDING, 'listing.storefront.verify.failed', {
          listingId: listing.id,
          shopifyProductId: upserted.productId,
          shopifyVariantId: upserted.variantId,
          shopifyHandle: upserted.handle,
          storefrontVerification,
        } as Prisma.InputJsonValue);

        return pending;
      }

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
        shopifyHandle: upserted.handle,
        publicationId: publication.id,
        locationId: location.id,
        attachedMediaCount,
        storefrontVerification,
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

  async pauseListing(input: {
    userId: number;
    listingId: number;
  }) {
    const listing = await prisma.cjShopifyUsaListing.findFirst({
      where: {
        id: input.listingId,
        userId: input.userId,
      },
    });

    if (!listing) {
      throw new AppError('Listing not found.', 404, ErrorCode.NOT_FOUND);
    }

    if (!listing.shopifyProductId) {
      throw new AppError(
        'Listing has not been published to Shopify yet, so it cannot be paused.',
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    try {
      const { publication } = await resolveShopifyPublishTargets(input.userId);
      if (publication?.id) {
        try {
          await cjShopifyUsaAdminService.unpublishProductFromPublication({
            userId: input.userId,
            productId: listing.shopifyProductId,
            publicationId: publication.id,
          });
        } catch (error) {
          console.warn(
            `[ShopifyPause] Listing ${listing.id} could not be unpublished from publication before DRAFT status: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      await cjShopifyUsaAdminService.updateProductStatus({
        userId: input.userId,
        productId: listing.shopifyProductId,
        status: 'DRAFT',
      });

      const updated = await prisma.cjShopifyUsaListing.update({
        where: { id: listing.id },
        data: {
          status: CJ_SHOPIFY_USA_LISTING_STATUS.PAUSED,
          lastSyncedAt: new Date(),
          publishedAt: null,
          lastError: null,
        },
      });

      await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_PAUSE, 'listing.pause', {
        listingId: listing.id,
        shopifyProductId: listing.shopifyProductId,
      } as Prisma.InputJsonValue);

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.cjShopifyUsaListing.update({
        where: { id: listing.id },
        data: {
          lastError: message,
        },
      });
      throw error;
    }
  },

  async unpublishListing(input: {
    userId: number;
    listingId: number;
  }) {
    const listing = await prisma.cjShopifyUsaListing.findFirst({
      where: {
        id: input.listingId,
        userId: input.userId,
      },
    });

    if (!listing) {
      throw new AppError('Listing not found.', 404, ErrorCode.NOT_FOUND);
    }

    if (!listing.shopifyProductId) {
      throw new AppError(
        'Listing has not been published to Shopify yet, so it cannot be unpublished.',
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    try {
      const { publication } = await resolveShopifyPublishTargets(input.userId);
      if (publication?.id) {
        await cjShopifyUsaAdminService.unpublishProductFromPublication({
          userId: input.userId,
          productId: listing.shopifyProductId,
          publicationId: publication.id,
        });
      }

      await cjShopifyUsaAdminService.updateProductStatus({
        userId: input.userId,
        productId: listing.shopifyProductId,
        status: 'ARCHIVED',
      });

      const updated = await prisma.cjShopifyUsaListing.update({
        where: { id: listing.id },
        data: {
          status: CJ_SHOPIFY_USA_LISTING_STATUS.ARCHIVED,
          lastSyncedAt: new Date(),
          publishedAt: null,
          lastError: null,
        },
      });

      await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_UNPUBLISH, 'listing.unpublish', {
        listingId: listing.id,
        shopifyProductId: listing.shopifyProductId,
      } as Prisma.InputJsonValue);

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.cjShopifyUsaListing.update({
        where: { id: listing.id },
        data: {
          lastError: message,
        },
      });
      throw error;
    }
  },
};
