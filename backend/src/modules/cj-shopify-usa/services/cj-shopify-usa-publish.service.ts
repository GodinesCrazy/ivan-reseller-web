import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError, ErrorCode } from '../../../middleware/error.middleware';
import { createCjSupplierAdapter } from '../../cj-ebay/adapters/cj-supplier.adapter';
import { cjShopifyUsaAdminService } from './cj-shopify-usa-admin.service';
import { cjShopifyUsaQualificationService } from './cj-shopify-usa-qualification.service';
import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';
import { cjShopifyUsaCategorizationService } from './cj-shopify-usa-categorization.service';
import { isCjShopifyUsaPetProduct, resolveMaxSellPriceUsd } from './cj-shopify-usa-policy.service';
import { cjShopifyUsaSocialService } from './cj-shopify-usa-social.service';
import {
  CJ_SHOPIFY_USA_LISTING_STATUS,
  CJ_SHOPIFY_USA_TRACE_STEP,
} from '../cj-shopify-usa.constants';

type VariantRow = {
  listingId: number;
  cjSku: string;
  attrs: unknown;
  price: number;
  quantity: number;
};

type VariantInput = {
  sku: string;
  price: number;
  optionValues: Array<{ optionName: string; name: string }>;
  listingId: number;
  quantity: number;
  attrs: Record<string, any> | null;
};

function buildVariantLabel(attrs: unknown, productTitle: string): string {
  const raw = String((attrs as Record<string, string> | null)?.label ?? '').trim();
  if (!raw) return 'Default';
  const prefix = productTitle.trim();
  if (raw.toLowerCase().startsWith(prefix.toLowerCase())) {
    const stripped = raw.slice(prefix.length).trim();
    return stripped || raw;
  }
  return raw;
}

/**
 * Infer the most appropriate Shopify option name (Color, Size, Style, Variant)
 * from the set of variant labels coming from CJ.
 */
function inferOptionName(labels: string[]): string {
  if (labels.length === 0) return 'Variant';

  const colorPatterns = /\b(red|blue|green|black|white|pink|yellow|orange|purple|brown|gray|grey|navy|beige|gold|silver|khaki|rose|sky|ivory|teal|coral|aqua|maroon|magenta|lavender|cream|olive|tan|peach|violet|indigo|ruby|mint|sapphire|turquoise|charcoal|champagne|burgundy|emerald|crimson|scarlet|onyx|ivory|jet)\b/i;
  const sizePatterns = /\b(small|medium|large|xl|xxl|xxxl|xs|s|m|l|\d+\s*(cm|mm|inch|in|ft|oz|ml|kg|lb))\b/i;

  let colorHits = 0;
  let sizeHits = 0;
  for (const label of labels) {
    const lower = label.toLowerCase();
    if (colorPatterns.test(lower)) colorHits++;
    if (sizePatterns.test(lower)) sizeHits++;
  }

  const threshold = labels.length * 0.4;
  if (colorHits > sizeHits && colorHits >= threshold) return 'Color';
  if (sizeHits > colorHits && sizeHits >= threshold) return 'Size';
  if (colorHits > 0 || sizeHits > 0) return colorHits >= sizeHits ? 'Color' : 'Size';
  return 'Style';
}

function buildMultiVariantOptions(
  rows: VariantRow[],
  productTitle: string,
): {
  productOptions: Array<{ name: string; position: number; values: Array<{ name: string }> }>;
  variantInputs: VariantInput[];
} {
  const seen = new Set<string>();
  const variantInputs: VariantInput[] = [];
  const allLabels: string[] = [];

  for (const row of rows) {
    const label = buildVariantLabel(row.attrs, productTitle);
    if (seen.has(label)) continue;
    seen.add(label);
    allLabels.push(label);
    variantInputs.push({
      sku: row.cjSku,
      price: row.price,
      optionValues: [], // filled below once optionName is resolved
      listingId: row.listingId,
      quantity: row.quantity,
      attrs: (row.attrs as Record<string, any>) || null,
    });
  }

  const optionName = inferOptionName(allLabels);

  // Fill optionValues with the resolved optionName
  for (let i = 0; i < variantInputs.length; i++) {
    variantInputs[i].optionValues = [{ optionName, name: allLabels[i] }];
  }

  return {
    productOptions: [
      { name: optionName, position: 1, values: variantInputs.map((v) => ({ name: v.optionValues[0].name })) },
    ],
    variantInputs,
  };
}

async function assignPetCollectionsBestEffort(input: {
  userId: number;
  shopifyProductId: string | null | undefined;
  title: string;
}) {
  if (!input.shopifyProductId) return;
  try {
    await cjShopifyUsaCategorizationService.assignProductToPetCollections({
      userId: input.userId,
      shopifyProductId: input.shopifyProductId,
      title: input.title,
    });
  } catch (error) {
    console.warn(
      `[ShopifyPublish] Category assignment failed for ${input.shopifyProductId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function resolvePrimarySku(
  listing: { shopifySku?: string | null; variant?: { cjSku?: string } | null },
  draft: Record<string, any>,
): string {
  return String(listing.shopifySku || listing.variant?.cjSku || draft.cjSku || '').trim();
}

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

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

function attributeValue(input: Record<string, unknown> | null | undefined, patterns: RegExp[]): string | null {
  if (!input || typeof input !== 'object') return null;
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = normalizeWhitespace(key).toLowerCase();
    if (!patterns.some((pattern) => pattern.test(normalizedKey))) continue;
    const normalizedValue = normalizeWhitespace(String(value ?? ''));
    if (!normalizedValue || /^default$/i.test(normalizedValue) || normalizedValue.length > 32) continue;
    return normalizedValue;
  }
  return null;
}

function titleDetail(input: {
  rawTitle: string;
  lower: string;
  variantAttributes?: Record<string, unknown> | null;
}): string | null {
  const material = attributeValue(input.variantAttributes, [/material/, /texture/, /fabric/]);
  const color = attributeValue(input.variantAttributes, [/color/, /colour/]);
  const size = attributeValue(input.variantAttributes, [/size/, /capacity/, /spec/, /style/, /type/]);

  if (/ceramic|porcelain/.test(input.lower)) return 'Ceramic';
  if (/stainless|steel|metal/.test(input.lower)) return 'Stainless Steel';
  if (/silicone/.test(input.lower)) return 'Silicone';
  if (/bamboo/.test(input.lower)) return 'Bamboo';
  if (/plush|fleece|velvet/.test(input.lower)) return 'Plush';
  if (/waterproof/.test(input.lower)) return 'Waterproof';
  if (/rechargeable|usb|electric|automatic/.test(input.lower)) return 'Rechargeable';
  if (/slow/.test(input.lower)) return 'Slow Feeder';
  if (/foldable|collapsible/.test(input.lower)) return 'Foldable';
  if (material) return toTitleCase(material);
  if (size && !/^\d+$/.test(size)) return toTitleCase(size);
  if (color && input.rawTitle.split(/\s+/).length < 5) return toTitleCase(color);
  return null;
}

function specificTitle(base: string, detail: string | null, maxLength = 58): string {
  if (!detail) return base;
  if (base.toLowerCase().includes(detail.toLowerCase())) return trimTitleToFit(base, maxLength);
  return trimTitleToFit(`${detail} ${base}`, maxLength);
}

function hasUsableImages(images: unknown): boolean {
  return Array.isArray(images)
    && images.some((image) => {
      const url = typeof image === 'string'
        ? image
        : image && typeof image === 'object'
          ? String((image as Record<string, unknown>).src ?? (image as Record<string, unknown>).url ?? '')
          : '';
      return /^https?:\/\//i.test(url.trim());
    });
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
  const lower = rawTitle.toLowerCase();
  if (/slave|bondage|bdsm|fetish|erotic|adult toy|lingerie|corset|training bundled sheath|bundled sheath/.test(lower)) {
    return trimTitleToFit(toTitleCase(rawTitle));
  }
  const detail = titleDetail({ rawTitle, lower, variantAttributes: input.variantAttributes });
  if (/airtag|tracker/.test(lower) && /\b(dog|pet|cat|collar)\b/.test(lower)) return specificTitle('AirTag Pet Collar', detail);
  if (/missing food ball|food ball|treat ball/.test(lower)) return 'Dog Treat Puzzle Ball';
  if (/food storage|storage bucket|storage container|kibble/.test(lower)) return specificTitle('Pet Food Storage Container', detail);
  if (/tent|teepee/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return specificTitle('Warm Pet Tent Bed', detail);
  if (/fence|gate|partition/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return specificTitle('Retractable Pet Safety Gate', detail);
  if (/chest strap/.test(lower) && /led|illuminated|light/.test(lower) && /\b(dog|pet)\b/.test(lower)) return 'LED Dog Harness';
  if (/terrarium|breeding box|climbing box/.test(lower)) return 'Small Pet Terrarium Box';
  if (/shampoo|dispenser/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return specificTitle('Pet Bath Brush with Shampoo Dispenser', detail);
  if (/foaming|foam/.test(lower) && /brush/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return specificTitle('Foaming Pet Bath Brush', detail);
  if (/shampoo|bath|groom|brush|comb|nail|lint|hair|fur|massage/.test(lower) && /\b(pet|dog|cat|puppy|kitten)\b/.test(lower)) {
    if (/nail|clipper|trimmer|grinder/.test(lower)) return specificTitle('Pet Nail Grooming Tool', detail);
    if (/scissor|shear/.test(lower)) return specificTitle('Pet Grooming Scissors', detail);
    if (/glove/.test(lower)) return specificTitle('Pet Grooming Glove', detail);
    if (/comb/.test(lower)) return specificTitle('Pet Grooming Comb', detail);
    return specificTitle('Pet Grooming Brush', detail);
  }
  if (/stair|steps|ladder|ramp|slope/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return specificTitle('Pet Stairs for Beds and Sofas', detail);
  if (/fountain|water/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return specificTitle('Pet Water Fountain', detail);
  if (/slow/.test(lower) && /feeder|bowl/.test(lower)) return 'Slow Feeder Pet Bowl';
  if (/bowl|feeder|feeding|food/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return specificTitle('Pet Feeding Bowl', detail);
  if (/\b(bed|cushion|mat|blanket|sofa|pillow|house|nest)\b/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) {
    if (/\bcat|kitten\b/.test(lower)) return specificTitle('Cat Comfort Bed', detail);
    if (/\bdog|puppy\b/.test(lower)) return specificTitle('Dog Comfort Bed', detail);
    return specificTitle('Pet Comfort Bed', detail);
  }
  if (/scratch/.test(lower) && /\bcat|kitten\b/.test(lower)) return specificTitle('Cat Scratcher Toy', detail);
  if (/toy|chew|squeak|puzzle|ball|teaser|tunnel/.test(lower) && /\b(pet|dog|cat|puppy|kitten)\b/.test(lower)) {
    if (/\bdog|puppy\b/.test(lower)) return specificTitle('Dog Enrichment Toy', detail);
    if (/\bcat|kitten\b/.test(lower)) return specificTitle('Cat Enrichment Toy', detail);
    return specificTitle('Pet Enrichment Toy', detail);
  }
  if (/seat belt|safety belt/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return 'Pet Seat Belt';
  if (/carrier|sling|bag|backpack/.test(lower) && /\b(pet|dog|cat|hamster)\b/.test(lower)) return specificTitle('Pet Travel Carrier', detail);
  if (/leash/.test(lower) && /\b(dog|puppy)\b/.test(lower)) return specificTitle('Adjustable Dog Leash', detail);
  if (/harness/.test(lower) && /\b(dog|puppy)\b/.test(lower)) return specificTitle('Dog Harness', detail);
  if (/collar/.test(lower) && /\b(dog|cat|pet|puppy|kitten)\b/.test(lower)) return specificTitle('Adjustable Pet Collar', detail);
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

function buildShippingEta(snapshot: Record<string, unknown> | null | undefined): string {
  const minDays = toSafeInt(snapshot?.estimatedMinDays);
  const maxDays = toSafeInt(snapshot?.estimatedMaxDays);
  const origin = normalizeWhitespace(String(snapshot?.originCountryCode ?? '')).toUpperCase();

  if (minDays > 0 && maxDays > 0) {
    if (minDays === maxDays) {
      return `Estimated delivery in ${minDays} business day${minDays === 1 ? '' : 's'}`;
    }
    return `Estimated delivery in ${minDays}-${maxDays} business days`;
  }

  if (maxDays > 0) {
    return `Estimated delivery in up to ${maxDays} business days`;
  }

  if (origin === 'US') {
    return 'Estimated delivery in 3-7 business days';
  }

  return 'Estimated delivery shown at checkout';
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
  shippingSnapshot?: Record<string, unknown> | null;
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
  const shippingEta = buildShippingEta(input.shippingSnapshot);

  if (shippingEta && shippingEta !== 'Estimated delivery shown at checkout') {
    htmlParts.push(`<p><strong>USA stock.</strong> ${shippingEta}.</p>`);
  }

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
    preferredShippingQuoteId?: number | null;
  }) {
    const product = await prisma.cjShopifyUsaProduct.findFirst({
      where: {
        id: input.productId,
        userId: input.userId,
      },
      include: {
        variants: { orderBy: { id: 'asc' } },
        listings: {
          where: { userId: input.userId },
          select: { id: true, status: true, variantId: true },
        },
      },
    });

    if (!product) {
      throw new AppError('CJ Shopify USA product not found.', 404, ErrorCode.NOT_FOUND);
    }

    if (!isCjShopifyUsaPetProduct({ title: product.title, description: product.description })) {
      throw new AppError(
        'Only pet-related products can be drafted for the CJ → Shopify USA pet store.',
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    if (!hasUsableImages(product.images)) {
      throw new AppError(
        'Product has no usable product images. Add or sync images before creating a Shopify draft.',
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // ── Duplicate guard: reject if THIS VARIANT already has an active/draft listing ──
    // Allows multiple drafts for different variants of the same product (multi-variant publishing).
    const BUSY = ['ACTIVE', 'PUBLISHING', 'RECONCILE_PENDING'];
    const DRAFT_BUSY = ['DRAFT', ...BUSY];
    const resolvedVariantId = input.variantId
      ? input.variantId
      : product.variants[0]?.id ?? null;

    // Block if ANY listing is already ACTIVE/PUBLISHING (product is live on Shopify)
    const activeListing = product.listings.find((l) => BUSY.includes(l.status));
    if (activeListing) {
      throw new AppError(
        `Product already has a ${activeListing.status} listing (#${activeListing.id}). Use expandProductVariants to add more variants.`,
        409,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // Block if THIS specific variant already has a DRAFT listing
    if (resolvedVariantId) {
      const variantDraftListing = product.listings.find(
        (l) => l.status === 'DRAFT' && l.variantId === resolvedVariantId,
      );
      if (variantDraftListing) {
        throw new AppError(
          `Variant already has a DRAFT listing (#${variantDraftListing.id}). Publish it or remove it first.`,
          409,
          ErrorCode.VALIDATION_ERROR,
        );
      }
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

    const shippingQuote = input.preferredShippingQuoteId
      ? await prisma.cjShopifyUsaShippingQuote.findUnique({
          where: { id: input.preferredShippingQuoteId },
        })
      : await prisma.cjShopifyUsaShippingQuote.findFirst({
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
    const maxSellPriceUsd = resolveMaxSellPriceUsd(settings.maxSellPriceUsd);
    if (suggestedSellPriceUsd > maxSellPriceUsd) {
      throw new AppError(
        `Suggested sell price $${suggestedSellPriceUsd.toFixed(2)} exceeds configured maximum $${maxSellPriceUsd.toFixed(2)}.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }
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
      shippingSnapshot: shippingQuote
        ? {
            estimatedMinDays: shippingQuote.estimatedMinDays,
            estimatedMaxDays: shippingQuote.estimatedMaxDays,
            originCountryCode: shippingQuote.originCountryCode,
          }
        : null,
    });

    const draftPayload = {
      cjProductId: product.cjProductId,
      cjSku: variant.cjSku,
      cjVid: variant.cjVid,
      title: draftTitle,
      descriptionHtml,
      vendor: 'CJ Dropshipping',
      productType: cjShopifyUsaCategorizationService.inferProductType(draftTitle),
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
        maxSellPriceUsd,
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

    const publishableStatuses = new Set<string>([
      CJ_SHOPIFY_USA_LISTING_STATUS.DRAFT,
      CJ_SHOPIFY_USA_LISTING_STATUS.PAUSED,
      CJ_SHOPIFY_USA_LISTING_STATUS.FAILED,
      CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING,
    ]);
    if (!publishableStatuses.has(listing.status)) {
      throw new AppError(
        `Listing status ${listing.status} cannot be published. Re-sync Shopify first or create a fresh draft.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const draft = (listing.draftPayload || null) as Record<string, any> | null;
    if (!draft) {
      throw new AppError('Listing draft payload is missing. Create a draft first.', 400, ErrorCode.VALIDATION_ERROR);
    }

    const { settings, probe, location, publication } = await resolveShopifyPublishTargets(input.userId);
    const minStock = Math.max(0, Number(settings.minStock ?? 1));
    const maxSellPriceUsd = resolveMaxSellPriceUsd(settings.maxSellPriceUsd);
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

    const primaryPrice = Number(listing.listedPriceUsd || draft.pricingSnapshot?.suggestedSellPriceUsd || 0);
    if (!Number.isFinite(primaryPrice) || primaryPrice <= 0) {
      throw new AppError('Listing sell price is missing or invalid.', 400, ErrorCode.VALIDATION_ERROR);
    }

    if (primaryPrice > maxSellPriceUsd) {
      throw new AppError(
        `Listing sell price $${primaryPrice.toFixed(2)} exceeds configured maximum $${maxSellPriceUsd.toFixed(2)}.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const minMarginPct = Number(settings.minMarginPct ?? 12);
    const minProfitUsd = Number(settings.minProfitUsd ?? 1.5);
    const maxShippingUsd = Number(settings.maxShippingUsd ?? 15);
    const pricingSnapshot = (draft.pricingSnapshot || {}) as Record<string, any>;
    const shippingSnapshot = (draft.shippingSnapshot || {}) as Record<string, any>;
    const snapshotMarginPct = Number(pricingSnapshot.netMarginPct ?? NaN);
    const snapshotProfitUsd = Number(pricingSnapshot.netProfitUsd ?? NaN);
    const snapshotShippingUsd = Number(
      pricingSnapshot.shippingCostUsd ?? shippingSnapshot.amountUsd ?? NaN,
    );

    if (!Number.isFinite(snapshotMarginPct) || snapshotMarginPct < minMarginPct) {
      throw new AppError(
        `Listing margin snapshot is not safe to publish: ${Number.isFinite(snapshotMarginPct) ? snapshotMarginPct.toFixed(1) : 'missing'}% < ${minMarginPct.toFixed(1)}% minimum. Re-evaluate product before publishing.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    if (!Number.isFinite(snapshotProfitUsd) || snapshotProfitUsd < minProfitUsd) {
      throw new AppError(
        `Listing profit snapshot is not safe to publish: ${Number.isFinite(snapshotProfitUsd) ? `$${snapshotProfitUsd.toFixed(2)}` : 'missing'} < $${minProfitUsd.toFixed(2)} minimum. Re-evaluate product before publishing.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    if (Number.isFinite(snapshotShippingUsd) && snapshotShippingUsd > maxShippingUsd) {
      throw new AppError(
        `Listing shipping snapshot $${snapshotShippingUsd.toFixed(2)} exceeds configured maximum $${maxShippingUsd.toFixed(2)}. Re-evaluate product before publishing.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    if (!isCjShopifyUsaPetProduct({
      title: draft.title || listing.product.title,
      description: draft.descriptionHtml || listing.product.description,
      productType: draft.productType,
      attributes: draft.variantAttributes ?? listing.variant?.attributes,
    })) {
      throw new AppError(
        'Only pet-related products can be published to the CJ → Shopify USA pet store.',
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    if (!hasUsableImages(draft.images) && !hasUsableImages(listing.product.images)) {
      throw new AppError(
        'Listing has no usable product images. Add or sync images before publishing to Shopify.',
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

    let publishAttemptListingIds = [listing.id];

    try {
      const mediaPayload = (Array.isArray(draft.images) ? draft.images : [])
        .map((src: string) => String(src).trim())
        .filter(Boolean)
        .map((src: string) => ({
          originalSource: src,
          mediaContentType: 'IMAGE' as const,
          alt: src, // Link original URL for variant image mapping
        }));

      const siblingDraftRows = await prisma.cjShopifyUsaListing.findMany({
        where: {
          userId: input.userId,
          productId: listing.productId,
          status: CJ_SHOPIFY_USA_LISTING_STATUS.DRAFT,
          id: { not: listing.id },
        },
        include: { variant: true },
      });
      const siblingDrafts = siblingDraftRows.filter((candidate) =>
        Number(candidate.variant?.unitCostUsd ?? 0) > 0 &&
        Number(candidate.variant?.stockLastKnown ?? 0) > 0 &&
        toSafeInt(candidate.quantity ?? ((candidate.draftPayload || {}) as Record<string, any>).quantity ?? 0) > 0,
      );

      const allToPublish = [listing, ...siblingDrafts];
      publishAttemptListingIds = allToPublish.map((candidate) => candidate.id);
      const isMultiVariant = allToPublish.length > 1;
      const productTitle = String(draft.title || listing.product.title || 'Pet Product');

      // Build variant options when there are multiple variants
      let productOptions: Parameters<typeof cjShopifyUsaAdminService.upsertProduct>[0]['productOptions'];
      let variantInputsForUpsert: Parameters<typeof cjShopifyUsaAdminService.upsertProduct>[0]['variants'];
      let variantConfig: ReturnType<typeof buildMultiVariantOptions>['variantInputs'] = [];

      if (isMultiVariant) {
        const rows = allToPublish.map((l) => {
          const lDraft = (l.draftPayload || {}) as Record<string, any>;
          return {
            listingId: l.id,
            cjSku: String(l.shopifySku || l.variant?.cjSku || lDraft.cjSku || '').trim(),
            attrs: l.variant?.attributes ?? lDraft.variantAttributes ?? null,
            price: Number(l.listedPriceUsd ?? lDraft.pricingSnapshot?.suggestedSellPriceUsd ?? 0),
            quantity: toSafeInt(l.quantity ?? lDraft.quantity ?? 0),
            netMarginPct: Number(lDraft.pricingSnapshot?.netMarginPct ?? NaN),
            netProfitUsd: Number(lDraft.pricingSnapshot?.netProfitUsd ?? NaN),
          };
        });

        const overpricedRows = rows.filter((row) => row.price > maxSellPriceUsd);
        if (overpricedRows.length > 0) {
          throw new AppError(
            `One or more variants exceed configured maximum sell price $${maxSellPriceUsd.toFixed(2)}: ${overpricedRows
              .map((row) => `listing #${row.listingId} $${row.price.toFixed(2)}`)
              .join(', ')}`,
            400,
            ErrorCode.VALIDATION_ERROR,
          );
        }

        const unsafeMarginRows = rows.filter((row) => !Number.isFinite(row.netMarginPct) || row.netMarginPct < minMarginPct);
        if (unsafeMarginRows.length > 0) {
          throw new AppError(
            `One or more variants have unsafe margin snapshots. Re-evaluate before publishing: ${unsafeMarginRows
              .map((row) => `listing #${row.listingId}`)
              .join(', ')}`,
            400,
            ErrorCode.VALIDATION_ERROR,
          );
        }

        const unsafeProfitRows = rows.filter((row) => !Number.isFinite(row.netProfitUsd) || row.netProfitUsd < minProfitUsd);
        if (unsafeProfitRows.length > 0) {
          throw new AppError(
            `One or more variants have unsafe profit snapshots. Re-evaluate before publishing: ${unsafeProfitRows
              .map((row) => `listing #${row.listingId}`)
              .join(', ')}`,
            400,
            ErrorCode.VALIDATION_ERROR,
          );
        }

        const built = buildMultiVariantOptions(rows, productTitle);
        productOptions = built.productOptions;
        variantInputsForUpsert = built.variantInputs.map((v) => ({
          sku: v.sku,
          price: v.price,
          optionValues: v.optionValues,
        }));
        variantConfig = built.variantInputs;

        // Set ALL siblings to PUBLISHING so they're tracked
        if (siblingDrafts.length > 0) {
          await prisma.cjShopifyUsaListing.updateMany({
            where: { id: { in: siblingDrafts.map((l) => l.id) } },
            data: { status: CJ_SHOPIFY_USA_LISTING_STATUS.PUBLISHING, lastError: null },
          });
        }

        console.log(`[ShopifyPublish] Multi-variant: listing ${listing.id} + ${siblingDrafts.length} siblings → 1 Shopify product with ${variantConfig.length} variants`);
      } else {
        console.log(`[ShopifyPublish] Publishing listing ${listing.id} with ${mediaPayload.length} images`);
      }

      const requestedHandle = String(listing.shopifyHandle || draft.handle || '').trim();
      const expectedCjTag = `cj-product:${listing.product.cjProductId}`;
      const expectedSkus = new Set(
        allToPublish
          .map((candidate) => {
            const candidateDraft = (candidate.draftPayload || {}) as Record<string, any>;
            return normalizeToken(resolvePrimarySku(candidate, candidateDraft));
          })
          .filter(Boolean),
      );
      const primarySkuForUpsert = resolvePrimarySku(listing, draft);
      let identifierIdForUpsert = listing.shopifyProductId;

      if (!identifierIdForUpsert && requestedHandle) {
        const existingProduct = await cjShopifyUsaAdminService.findProductByHandle({
          userId: input.userId,
          handle: requestedHandle,
        });

        if (existingProduct) {
          const existingTags = new Set((existingProduct.tags ?? []).map(normalizeToken));
          const existingSkus = new Set(
            (existingProduct.variants?.nodes ?? [])
              .map((variant) => normalizeToken(variant.sku))
              .filter(Boolean),
          );
          const matchesCjTag = existingTags.has(normalizeToken(expectedCjTag));
          const matchesSku = [...expectedSkus].some((sku) => existingSkus.has(sku));

          if (matchesCjTag || matchesSku) {
            const existingVariantBySku = new Map(
              (existingProduct.variants?.nodes ?? [])
                .map((variant) => [normalizeToken(variant.sku), variant] as const)
                .filter(([sku, variant]) => Boolean(sku && variant.inventoryItem?.id)),
            );
            const primaryExistingVariant = existingVariantBySku.get(normalizeToken(primarySkuForUpsert));

            if (normalizeToken(existingProduct.status) === 'active' && primaryExistingVariant?.inventoryItem?.id) {
              console.log(
                `[ShopifyPublish] Adopting existing Shopify product for handle ${requestedHandle}: ${existingProduct.id}`,
              );

              await cjShopifyUsaAdminService.setInventoryQuantity({
                userId: input.userId,
                inventoryItemId: primaryExistingVariant.inventoryItem.id,
                locationId: location.id,
                quantity: desiredQuantity,
                referenceDocumentUri: `logistics://cj-shopify-usa/adopt/${listing.id}`,
                idempotencyKey: `adopt-${listing.id}-${primarySkuForUpsert}-${desiredQuantity}`,
              });

              await cjShopifyUsaAdminService.publishProductToPublication({
                userId: input.userId,
                productId: existingProduct.id,
                publicationId: publication.id,
              });

              await cjShopifyUsaAdminService.setProductMetafields({
                userId: input.userId,
                productId: existingProduct.id,
                metafields: [
                  {
                    namespace: 'ivan_reseller',
                    key: 'shipping_eta',
                    type: 'single_line_text_field',
                    value: buildShippingEta((draft.shippingSnapshot ?? null) as Record<string, unknown> | null),
                  },
                  {
                    namespace: 'ivan_reseller',
                    key: 'fulfillment_origin',
                    type: 'single_line_text_field',
                    value: String(draft.shippingSnapshot?.originCountryCode || 'US').toUpperCase(),
                  },
                ],
              });

              const storefrontVerification = await cjShopifyUsaAdminService.verifyStorefrontProductPage({
                userId: input.userId,
                productHandle: existingProduct.handle,
              });

              const readyForStorefront = storefrontVerification.buyerFacingOk;
              const adoptedStatus = readyForStorefront
                ? CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE
                : CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING;
              const adoptionError = readyForStorefront
                ? null
                : `Adopted existing Shopify product, but buyer-facing storefront verification failed: storefrontUrl=${storefrontVerification.storefrontUrl}; status=${storefrontVerification.status ?? 'FETCH_ERROR'}; passwordGate=${storefrontVerification.passwordGate}; hasAddToCart=${storefrontVerification.hasAddToCart}; hasPrice=${storefrontVerification.hasPrice}`;

              for (const sibling of siblingDrafts) {
                const siblingDraft = (sibling.draftPayload || {}) as Record<string, any>;
                const siblingSku = resolvePrimarySku(sibling, siblingDraft);
                const siblingVariant = existingVariantBySku.get(normalizeToken(siblingSku));
                if (!siblingVariant?.inventoryItem?.id) continue;

                await cjShopifyUsaAdminService.setInventoryQuantity({
                  userId: input.userId,
                  inventoryItemId: siblingVariant.inventoryItem.id,
                  locationId: location.id,
                  quantity: toSafeInt(sibling.quantity ?? siblingDraft.quantity ?? 1),
                  referenceDocumentUri: `logistics://cj-shopify-usa/adopt/${sibling.id}`,
                  idempotencyKey: `adopt-${sibling.id}-${siblingSku}-${toSafeInt(sibling.quantity ?? siblingDraft.quantity ?? 1)}`,
                });

                await prisma.cjShopifyUsaListing.update({
                  where: { id: sibling.id },
                  data: {
                    status: adoptedStatus,
                    shopifyProductId: existingProduct.id,
                    shopifyVariantId: siblingVariant.id,
                    shopifyHandle: existingProduct.handle,
                    shopifySku: siblingSku,
                    publishedAt: readyForStorefront ? new Date() : null,
                    lastSyncedAt: new Date(),
                    lastError: adoptionError,
                  },
                });
              }

              const adopted = await prisma.cjShopifyUsaListing.update({
                where: { id: listing.id },
                data: {
                  status: adoptedStatus,
                  shopifyProductId: existingProduct.id,
                  shopifyVariantId: primaryExistingVariant.id,
                  shopifyHandle: existingProduct.handle,
                  shopifySku: primarySkuForUpsert,
                  publishedAt: readyForStorefront ? new Date() : null,
                  lastSyncedAt: new Date(),
                  lastError: adoptionError,
                },
              });

              await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_PUBLISH_SUCCESS, 'listing.publish.adopt-existing-handle', {
                listingId: listing.id,
                shopifyProductId: existingProduct.id,
                shopifyVariantId: primaryExistingVariant.id,
                shopifyHandle: existingProduct.handle,
                storefrontVerification,
                siblingCount: siblingDrafts.length,
              } as Prisma.InputJsonValue);

              await assignPetCollectionsBestEffort({
                userId: input.userId,
                shopifyProductId: existingProduct.id,
                title: productTitle,
              });

              return adopted;
            }

            identifierIdForUpsert = existingProduct.id;
            console.log(
              `[ShopifyPublish] Reusing existing Shopify product identifier for handle ${requestedHandle}: ${existingProduct.id}`,
            );
          } else {
            throw new AppError(
              `Shopify handle '${requestedHandle}' is already used by another product (${existingProduct.title}, ${existingProduct.status}, ${existingProduct.id}). Choose a different handle before publishing this CJ product.`,
              400,
              ErrorCode.EXTERNAL_API_ERROR,
            );
          }
        }
      }

      const categoryProductType = cjShopifyUsaCategorizationService.inferProductType(productTitle);
      const categoryTags = cjShopifyUsaCategorizationService.buildProductTags(
        listing.product.cjProductId,
        productTitle,
      );

      const upserted = await cjShopifyUsaAdminService.upsertProduct({
        userId: input.userId,
        identifierId: identifierIdForUpsert,
        handle: requestedHandle || null,
        title: productTitle,
        descriptionHtml: String(draft.descriptionHtml || ''),
        vendor: String(draft.vendor || 'CJ Dropshipping'),
        productType: categoryProductType,
        tags: categoryTags,
        sku: primarySkuForUpsert,
        price: Number(listing.listedPriceUsd || draft.pricingSnapshot?.suggestedSellPriceUsd || 0),
        media: mediaPayload,
        status: 'ACTIVE',
        productOptions,
        variants: variantInputsForUpsert,
      });

      const attachedMediaCount = await ensureShopifyImagesAttached({
        userId: input.userId,
        listingId: listing.id,
        productId: upserted.productId,
        mediaPayload,
      });

      const shopifyVariantBySku = new Map(upserted.allVariants.map((v) => [v.sku, v]));

      const inventoryCalls = isMultiVariant && variantConfig.length > 0
        ? variantConfig
            .map((vc) => {
              const sv = shopifyVariantBySku.get(vc.sku);
              if (!sv) return null;
              return cjShopifyUsaAdminService.setInventoryQuantity({
                userId: input.userId,
                inventoryItemId: sv.inventoryItemId,
                locationId: location.id,
                quantity: vc.quantity,
                referenceDocumentUri: `logistics://cj-shopify-usa/listing/${vc.listingId}`,
                idempotencyKey: `cj-shopify-usa-${vc.listingId}-qty-${vc.quantity}`,
              });
            })
            .filter(Boolean)
        : [
            cjShopifyUsaAdminService.setInventoryQuantity({
              userId: input.userId,
              inventoryItemId: upserted.inventoryItemId,
              locationId: location.id,
              quantity: desiredQuantity,
              referenceDocumentUri: `logistics://cj-shopify-usa/listing/${listing.id}`,
              idempotencyKey: `cj-shopify-usa-${listing.id}-${desiredQuantity}`,
            }),
          ];

      await Promise.all(inventoryCalls);

      // Phase 3: Map Variant Images
      try {
        const fullMedia = await cjShopifyUsaAdminService.getProductMedia({ userId: input.userId, productId: upserted.productId });
        const mediaMap = new Map<string, string>();
        for (const m of fullMedia) {
          if (m.alt) mediaMap.set(m.alt.trim(), m.id);
        }

        const variantMediaCalls = isMultiVariant ? variantConfig.map((vc) => {
          const sv = shopifyVariantBySku.get(vc.sku);
          const vImg = vc.attrs?.variantImage;
          if (sv && vImg && typeof vImg === 'string') {
            const mediaId = mediaMap.get(vImg.trim());
            if (mediaId) {
              return cjShopifyUsaAdminService.updateVariantMedia({
                userId: input.userId,
                variantId: sv.id,
                mediaId,
              });
            }
          }
          return null;
        }).filter(Boolean) : [];

        if (variantMediaCalls.length > 0) {
          await Promise.all(variantMediaCalls);
          console.log(`[ShopifyPublish] Mapped ${variantMediaCalls.length} variant images.`);
        }
      } catch (err) {
        console.warn(`[ShopifyPublish] Failed to map variant images:`, err);
      }

      await cjShopifyUsaAdminService.publishProductToPublication({
        userId: input.userId,
        productId: upserted.productId,
        publicationId: publication.id,
      });

      await assignPetCollectionsBestEffort({
        userId: input.userId,
        shopifyProductId: upserted.productId,
        title: productTitle,
      });

      await cjShopifyUsaAdminService.setProductMetafields({
        userId: input.userId,
        productId: upserted.productId,
        metafields: [
          {
            namespace: 'ivan_reseller',
            key: 'shipping_eta',
            type: 'single_line_text_field',
            value: buildShippingEta((draft.shippingSnapshot ?? null) as Record<string, unknown> | null),
          },
          {
            namespace: 'ivan_reseller',
            key: 'fulfillment_origin',
            type: 'single_line_text_field',
            value: String(draft.shippingSnapshot?.originCountryCode || 'US').toUpperCase(),
          },
        ],
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

        const primarySkuPending = resolvePrimarySku(listing, draft);
        const pendingVariantId = shopifyVariantBySku.get(primarySkuPending)?.id ?? upserted.variantId;
        if (isMultiVariant && siblingDrafts.length > 0) {
          await prisma.cjShopifyUsaListing.updateMany({
            where: { id: { in: siblingDrafts.map((sibling) => sibling.id) } },
            data: {
              status: CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING,
              shopifyProductId: upserted.productId,
              shopifyHandle: upserted.handle,
              lastSyncedAt: new Date(),
              lastError: `Shopify product was created/published but buyer-facing storefront verification failed: ${reason}`,
            },
          });
        }
        const pending = await prisma.cjShopifyUsaListing.update({
          where: { id: listing.id },
          data: {
            status: CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING,
            shopifyProductId: upserted.productId,
            shopifyVariantId: pendingVariantId,
            shopifyHandle: upserted.handle,
            shopifySku: primarySkuPending,
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

      if (isMultiVariant && variantConfig.length > 0) {
        const handledListingIds = new Set<number>([listing.id]);
        for (const vc of variantConfig) {
          if (vc.listingId === listing.id) continue; // handled below
          handledListingIds.add(vc.listingId);
          const sv = shopifyVariantBySku.get(vc.sku);
          await prisma.cjShopifyUsaListing.update({
            where: { id: vc.listingId },
            data: {
              status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
              shopifyProductId: upserted.productId,
              shopifyVariantId: sv?.id ?? null,
              shopifyHandle: upserted.handle,
              publishedAt: new Date(),
              lastSyncedAt: new Date(),
              lastError: null,
            },
          });
        }

        const collapsedDuplicateIds = siblingDrafts
          .map((sibling) => sibling.id)
          .filter((id) => !handledListingIds.has(id));
        if (collapsedDuplicateIds.length > 0) {
          await prisma.cjShopifyUsaListing.updateMany({
            where: { id: { in: collapsedDuplicateIds } },
            data: {
              status: CJ_SHOPIFY_USA_LISTING_STATUS.ARCHIVED,
              lastSyncedAt: new Date(),
              publishedAt: null,
              lastError: `Archived duplicate draft collapsed into Shopify product ${upserted.productId}`,
            },
          });
        }
      }

      const primarySku = resolvePrimarySku(listing, draft);
      const primaryShopifyVariant = shopifyVariantBySku.get(primarySku);
      const resolvedVariantId = primaryShopifyVariant?.id ?? upserted.variantId;

      const updated = await prisma.cjShopifyUsaListing.update({
        where: { id: listing.id },
        data: {
          status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
          shopifyProductId: upserted.productId,
          shopifyVariantId: resolvedVariantId,
          shopifyHandle: upserted.handle,
          shopifySku: primarySku,
          publishedAt: new Date(),
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });

      await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_PUBLISH_SUCCESS, 'listing.publish.success', {
        listingId: listing.id,
        shopifyProductId: upserted.productId,
        shopifyVariantId: resolvedVariantId,
        shopifyHandle: upserted.handle,
        publicationId: publication.id,
        locationId: location.id,
        attachedMediaCount,
        storefrontVerification,
        siblingCount: siblingDrafts.length,
        isMultiVariant,
      } as Prisma.InputJsonValue);

      // Non-blocking: distribute to social channels after successful publish.
      // Errors inside schedulePost are swallowed and persisted to CjShopifyUsaSocialPost.
      cjShopifyUsaSocialService.schedulePost({
        userId: input.userId,
        listingId: listing.id,
        title: draft.title || listing.product.title,
      });

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.cjShopifyUsaListing.updateMany({
        where: {
          id: { in: publishAttemptListingIds },
          status: CJ_SHOPIFY_USA_LISTING_STATUS.PUBLISHING,
        },
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

  /**
   * Expands an ACTIVE single-variant Shopify product to include ALL CJ variants
   * of the same product. Creates listings for previously-unpublished variants
   * and updates the Shopify product with a proper variant picker.
   */
  async expandProductVariants(input: {
    userId: number;
    listingId: number;
  }) {
    // 1. Load the primary (already-published) listing
    const primary = await prisma.cjShopifyUsaListing.findFirst({
      where: { id: input.listingId, userId: input.userId },
      include: { product: true, variant: true },
    });

    if (!primary) throw new AppError('Listing not found.', 404, ErrorCode.NOT_FOUND);
    if (!primary.shopifyProductId) throw new AppError('Listing has no Shopify product — publish it first.', 400, ErrorCode.VALIDATION_ERROR);
    if (primary.status !== CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE) {
      throw new AppError('Only ACTIVE listings can be expanded.', 400, ErrorCode.VALIDATION_ERROR);
    }

    // 2. Find ALL CJ variants for this product (published or not)
    const allCjVariants = await prisma.cjShopifyUsaProductVariant.findMany({
      where: { productId: primary.productId },
      include: {
        listings: {
          where: { userId: input.userId },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { id: 'asc' },
    });

    const sellableCjVariants = allCjVariants.filter((variant) =>
      Number(variant.unitCostUsd ?? 0) > 0 &&
      Number(variant.stockLastKnown ?? 0) > 0,
    );

    if (sellableCjVariants.length <= 1) {
      return { message: 'Product has only one variant — nothing to expand.', expanded: 0 };
    }

    // 3. Resolve Shopify publish targets
    const { location } = await resolveShopifyPublishTargets(input.userId);
    if (!location?.id) throw new AppError('No Shopify location available for inventory sync.', 400, ErrorCode.EXTERNAL_API_ERROR);
    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(input.userId);
    const maxSellPriceUsd = resolveMaxSellPriceUsd(settings.maxSellPriceUsd);

    const basePrice = Number(primary.listedPriceUsd ?? 14.99);
    if (basePrice > maxSellPriceUsd) {
      throw new AppError(
        `Primary listing sell price $${basePrice.toFixed(2)} exceeds configured maximum $${maxSellPriceUsd.toFixed(2)}.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }
    const productTitle = String(primary.product.title);
    if (!isCjShopifyUsaPetProduct({ title: productTitle, description: primary.product.description })) {
      throw new AppError(
        'Only pet-related products can be expanded in the CJ → Shopify USA pet store.',
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // 4. Build the full variant option set for Shopify
    const variantRows = sellableCjVariants.map((v) => ({
      listingId: v.listings[0]?.id ?? null,       // null = no existing listing
      cjSku: v.cjSku,
      attrs: v.attributes,
      price: Number(v.listings[0]?.listedPriceUsd ?? basePrice),
      quantity: Math.min(v.stockLastKnown ?? 1, 50), // cap at 50 for safety
      cjVariantId: v.id,
      cjVid: v.cjVid,
    }));

    const { productOptions, variantInputs } = buildMultiVariantOptions(variantRows, productTitle);
    const overpricedVariant = variantInputs.find((variant) => variant.price > maxSellPriceUsd);
    if (overpricedVariant) {
      throw new AppError(
        `Variant ${overpricedVariant.sku} sell price $${overpricedVariant.price.toFixed(2)} exceeds configured maximum $${maxSellPriceUsd.toFixed(2)}.`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // 5. Update the existing Shopify product with ALL variants
    const draft = (primary.draftPayload || {}) as Record<string, any>;
    const categoryProductType = cjShopifyUsaCategorizationService.inferProductType(productTitle);
    const categoryTags = cjShopifyUsaCategorizationService.buildProductTags(
      primary.product.cjProductId,
      productTitle,
    );
    const upserted = await cjShopifyUsaAdminService.upsertProduct({
      userId: input.userId,
      identifierId: primary.shopifyProductId,
      handle: primary.shopifyHandle || draft.handle || null,
      title: productTitle,
      descriptionHtml: String(draft.descriptionHtml || ''),
      vendor: String(draft.vendor || 'CJ Dropshipping'),
      productType: categoryProductType,
      tags: categoryTags,
      sku: String(primary.shopifySku || '').trim(),
      price: basePrice,
      status: 'ACTIVE',
      productOptions,
      variants: variantInputs.map((v) => ({ sku: v.sku, price: v.price, optionValues: v.optionValues })),
    });

    const shopifyVariantBySku = new Map(upserted.allVariants.map((v) => [v.sku, v]));
    // O(1) lookup instead of O(N) find inside loop
    const cjVariantBySku = new Map(sellableCjVariants.map((v) => [v.cjSku, v]));

    // Parallel inventory calls
    await Promise.all(
      variantInputs
        .filter((vc) => vc.quantity > 0 && shopifyVariantBySku.has(vc.sku))
        .map((vc) =>
          cjShopifyUsaAdminService.setInventoryQuantity({
            userId: input.userId,
            inventoryItemId: shopifyVariantBySku.get(vc.sku)!.inventoryItemId,
            locationId: location.id,
            quantity: vc.quantity,
            referenceDocumentUri: `logistics://cj-shopify-usa/expand/${primary.id}`,
            idempotencyKey: `expand-${primary.id}-${vc.sku}-${vc.quantity}`,
          }),
        ),
    );

    let expanded = 0;
    const now = new Date();

    for (const vc of variantInputs) {
      const sv = shopifyVariantBySku.get(vc.sku);
      const cjVarRow = cjVariantBySku.get(vc.sku);
      if (!sv || !cjVarRow) continue;

      const sharedFields = {
        shopifyProductId: upserted.productId,
        shopifyVariantId: sv.id,
        shopifyHandle: upserted.handle,
        status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
        publishedAt: now,
        lastSyncedAt: now,
        lastError: null,
      };

      if (vc.listingId) {
        await prisma.cjShopifyUsaListing.update({ where: { id: vc.listingId }, data: sharedFields });
      } else {
        await prisma.cjShopifyUsaListing.create({
          data: {
            userId: input.userId,
            productId: primary.productId,
            variantId: cjVarRow.id,
            ...sharedFields,
            shopifySku: vc.sku,
            listedPriceUsd: vc.price,
            quantity: vc.quantity,
            draftPayload: {
              cjSku: vc.sku,
              cjVid: cjVarRow.cjVid,
              title: productTitle,
              vendor: 'CJ Dropshipping',
              productType: categoryProductType,
              pricingSnapshot: { suggestedSellPriceUsd: vc.price },
              variantAttributes: cjVarRow.attributes,
            } as Prisma.InputJsonValue,
          },
        });
        expanded++;
      }
    }

    await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.LISTING_PUBLISH_SUCCESS, 'listing.expand-variants.success', {
      primaryListingId: primary.id,
      shopifyProductId: upserted.productId,
      totalVariants: variantInputs.length,
      newVariantsAdded: expanded,
    } as Prisma.InputJsonValue);

    await assignPetCollectionsBestEffort({
      userId: input.userId,
      shopifyProductId: upserted.productId,
      title: productTitle,
    });

    return {
      message: `Product updated with ${variantInputs.length} variants. ${expanded} new variants added.`,
      shopifyProductId: upserted.productId,
      shopifyHandle: upserted.handle,
      totalVariants: variantInputs.length,
      expanded,
    };
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
