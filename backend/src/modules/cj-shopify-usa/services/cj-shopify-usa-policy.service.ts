export const CJ_SHOPIFY_USA_DEFAULT_MAX_SELL_PRICE_USD = 45;

const PET_PATTERNS = [
  /\bpet(s)?\b/i,
  /\bdog(s)?\b/i,
  /\bcat(s)?\b/i,
  /\bpuppy\b/i,
  /\bkitten\b/i,
  /\bpaw(s)?\b/i,
  /\bleash(es)?\b/i,
  /\bharness(es)?\b/i,
  /\bcollar(s)?\b/i,
  /\bgroom(ing)?\b/i,
  /\btreat(s)?\b/i,
  /\bchew(s|y)?\b/i,
  /\bbowl(s)?\b/i,
  /\bfeeder(s)?\b/i,
  /\blitter\b/i,
  /\bcatnip\b/i,
  /\bhamster(s)?\b/i,
  /\bbird(s)?\b/i,
  /\brabbit(s)?\b/i,
  /\bbunny\b/i,
  /\baquarium(s)?\b/i,
  /\bfish\b/i,
  /\breptile(s)?\b/i,
  /\bkennel(s)?\b/i,
  /\bcarrier(s)?\b/i,
  /\bcrate(s)?\b/i,
  /\bcage(s)?\b/i,
  /\bscratch(ing)?\b/i,
  /\bperch(es)?\b/i,
  /\bslow feeder(s)?\b/i,
  /\bpet supplies\b/i,
];

function stripHtml(input: unknown): string {
  return String(input || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCjShopifyUsaPetProduct(input: {
  title?: unknown;
  description?: unknown;
  productType?: unknown;
  tags?: unknown;
  attributes?: unknown;
}): boolean {
  const haystack = [
    input.title,
    stripHtml(input.description),
    input.productType,
    input.tags,
    input.attributes ? JSON.stringify(input.attributes) : '',
  ].join(' ');

  return PET_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function resolveMaxSellPriceUsd(value: unknown): number {
  if (value === null || value === undefined) return CJ_SHOPIFY_USA_DEFAULT_MAX_SELL_PRICE_USD;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? numeric
    : CJ_SHOPIFY_USA_DEFAULT_MAX_SELL_PRICE_USD;
}
