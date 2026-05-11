import type { Prisma } from '@prisma/client';

export type PublishVariantRow = {
  listingId: number;
  cjSku: string;
  attrs: unknown;
  price: number;
  quantity: number;
};

export type PublishVariantInput = {
  sku: string;
  price: number;
  optionValues: Array<{ optionName: string; name: string }>;
  listingId: number;
  quantity: number;
  attrs: Record<string, unknown> | null;
};

export function buildVariantLabel(attrs: unknown, productTitle: string): string {
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
export function inferOptionName(labels: string[]): string {
  if (labels.length === 0) return 'Variant';

  const colorPatterns =
    /\b(red|blue|green|black|white|pink|yellow|orange|purple|brown|gray|grey|navy|beige|gold|silver|khaki|rose|sky|ivory|teal|coral|aqua|maroon|magenta|lavender|cream|olive|tan|peach|violet|indigo|ruby|mint|sapphire|turquoise|charcoal|champagne|burgundy|emerald|crimson|scarlet|onyx|ivory|jet)\b/i;
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

export function buildMultiVariantOptions(
  rows: PublishVariantRow[],
  productTitle: string,
): {
  productOptions: Array<{ name: string; position: number; values: Array<{ name: string }> }>;
  variantInputs: PublishVariantInput[];
} {
  const seen = new Set<string>();
  const variantInputs: PublishVariantInput[] = [];
  const allLabels: string[] = [];

  for (const row of rows) {
    const label = buildVariantLabel(row.attrs, productTitle);
    if (seen.has(label)) continue;
    seen.add(label);
    allLabels.push(label);
    variantInputs.push({
      sku: row.cjSku,
      price: row.price,
      optionValues: [],
      listingId: row.listingId,
      quantity: row.quantity,
      attrs: (row.attrs as Record<string, unknown>) || null,
    });
  }

  const optionName = inferOptionName(allLabels);

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

export function resolvePrimarySku(
  listing: { shopifySku?: string | null; variant?: { cjSku?: string } | null },
  draft: Record<string, unknown>,
): string {
  return String(listing.shopifySku || listing.variant?.cjSku || draft.cjSku || '').trim();
}

export function normalizeToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function sanitizeHandle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function toUsdNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export function toSafeInt(value: unknown): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function decodeHtmlEntities(input: string): string {
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

export function stripHtmlToPlainText(input: string): string {
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

export function toTitleCase(input: string): string {
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
