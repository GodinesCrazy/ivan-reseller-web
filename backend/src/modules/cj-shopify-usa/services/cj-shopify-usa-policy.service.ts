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
  /\bscratching?\b/i,
  /\bperch(es)?\b/i,
  /\bslow feeder(s)?\b/i,
  /\bpet supplies\b/i,
];

const HARD_NON_PET_BLOCK_PATTERNS = [
  /\b(slave|bondage|bdsm|fetish|erotic|adult toys?|chast(e|ity)|sex(y)?|lingerie|corset)\b/i,
  /\b(neck corset|training bundled sheath|bundled sheath)\b/i,
];

/**
 * Hard block: electronics, cameras, phones, and other products that clearly
 * do not belong in a PET store. Added after storefront audit 2026-05-16.
 */
const HARD_NON_PET_ELECTRONICS_PATTERNS = [
  /\b(camera|webcam|dashcam|cctv|surveillance)\b/i,
  /\b(wifi|wi-fi|bluetooth|wireless)\b/i,
  /\b(phone|smartphone|iphone|android|tablet|ipad)\b/i,
  /\b(laptop|computer|keyboard|mouse|monitor|headphone|earbuds?|earphone|speaker)\b/i,
  /\b(charger|charging|power\s*bank|usb\s*(hub|dock|adapter))\b/i,
  /\b(drone|gopro|projector|smartwatch|vr\s*headset)\b/i,
  /\b(makeup|cosmetic|mascara|lipstick|foundation|eyeshadow|nail\s*polish)\b/i,
  /\b(car\s*seat\s*gap|car\s*organizer|car\s*mount|dashboard)\b/i,
  /\b(kitchen\s*timer|kitchen\s*scale|coffee\s*maker)\b/i,
  /\b(wallet|rfid\s*wallet|card\s*holder|money\s*clip)\b/i,
];

const HUMAN_CONTEXT_PATTERNS = [
  /\b(human|women|woman|men|man|lady|girl|boy|mannequin)\b/i,
];

const STRONG_PET_PATTERNS = [
  /\bpet(s)?\b/i,
  /\bdog(s)?\b/i,
  /\bcat(s)?\b/i,
  /\bpuppy\b/i,
  /\bkitten\b/i,
  /\bhamster(s)?\b/i,
  /\brabbit(s)?\b/i,
  /\bbunny\b/i,
  /\baquarium(s)?\b/i,
  /\bfish\b/i,
  /\breptile(s)?\b/i,
  /\bbird(s)?\b/i,
];

const AMBIGUOUS_ACCESSORY_ONLY_PATTERNS = [
  /\bcollar(s)?\b/i,
  /\bharness(es)?\b/i,
  /\bleash(es)?\b/i,
];

/**
 * Products from non-core pet niches that do NOT fit the PawVault brand
 * ("Everything for Dogs & Cats"). These pass the generic PET check but
 * should be blocked for brand consistency.
 */
const OFF_BRAND_PET_PATTERNS = [
  /\baquarium(s)?\b/i,
  /\bfish\s*tank\b/i,
  /\bfish\b/i,
  /\breptile(s)?\b/i,
  /\bvivarium\b/i,
  /\bterrarium\b/i,
  /\bbird\s*(cage|feeder|bath|perch|nest|swing|toy)\b/i,
  /\bparrot\b/i,
  /\bcockatiel\b/i,
  /\bcanary\b/i,
  /\bhamster\s*(cage|wheel|ball)\b/i,
  /\bguinea\s*pig\b/i,
  /\bgerbil\b/i,
  /\bferret\b/i,
  /\bsnake\b/i,
  /\blizard\b/i,
  /\bturtle\b/i,
  /\btortoise\b/i,
  /\bfrog\b/i,
  /\bnewt\b/i,
  /\bsalamander\b/i,
  /\bhedgehog\b/i,
  /\bchinchilla\b/i,
];

/** Supplier URL patterns that should NEVER appear in buyer-facing content. */
const SUPPLIER_URL_PATTERNS = [
  /cjdropshipping\.com/i,
  /cf\.cjdropshipping\.com/i,
  /aliexpress\.com/i,
  /alibaba\.com/i,
  /1688\.com/i,
  /dhgate\.com/i,
  /made-in-china\.com/i,
  /banggood\.com/i,
  /gearbest\.com/i,
];

/** Supplier code patterns in titles/descriptions. */
const SUPPLIER_CODE_PATTERNS = [
  /\bcj[a-z0-9]{6,}\b/i,
  /\b\d{13,}\b/,
  /\b[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}\b/i,
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

  if (HARD_NON_PET_BLOCK_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return false;
  }

  // Block electronics and other clearly non-PET products
  if (HARD_NON_PET_ELECTRONICS_PATTERNS.some((pattern) => pattern.test(haystack))) {
    // Allow if product also has a strong pet context (e.g. "pet camera", "dog GPS tracker")
    const titleOnly = String(input.title ?? '');
    const hasPetInTitle = /\b(pet|dog|cat|puppy|kitten)\b/i.test(titleOnly);
    if (!hasPetInTitle) return false;
  }

  const hasStrongPetSignal = STRONG_PET_PATTERNS.some((pattern) => pattern.test(haystack));
  if (!hasStrongPetSignal && HUMAN_CONTEXT_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return false;
  }

  const hasOnlyAmbiguousAccessorySignal =
    !hasStrongPetSignal &&
    AMBIGUOUS_ACCESSORY_ONLY_PATTERNS.some((pattern) => pattern.test(haystack));

  if (hasOnlyAmbiguousAccessorySignal) {
    return false;
  }

  return PET_PATTERNS.some((pattern) => pattern.test(haystack));
}

/**
 * Stricter brand filter: only allows products clearly for dogs and cats.
 * Blocks aquarium, fish, reptile, bird, hamster, and other exotic pet products
 * that do not match the PawVault "Dogs & Cats" positioning.
 * Added 2026-05-16 after storefront audit found brand-diluting products.
 */
export function isCjShopifyUsaDogsCatsOnly(input: {
  title?: unknown;
  description?: unknown;
  productType?: unknown;
  tags?: unknown;
  attributes?: unknown;
}): boolean {
  // First pass: must be a PET product
  if (!isCjShopifyUsaPetProduct(input)) return false;

  const haystack = [
    input.title,
    stripHtml(input.description),
    input.productType,
    input.tags,
  ].join(' ');

  // Block off-brand pet categories (aquarium, bird, reptile, etc.)
  // UNLESS the product also explicitly mentions dog/cat (e.g. "fish-shaped dog toy")
  const hasOffBrandSignal = OFF_BRAND_PET_PATTERNS.some((pattern) => pattern.test(haystack));
  if (hasOffBrandSignal) {
    const hasDogCatSignal = /\b(dog|dogs|puppy|puppies|cat|cats|kitten|kittens)\b/i.test(haystack);
    if (!hasDogCatSignal) return false;
  }

  return true;
}

/**
 * Detects supplier URLs in buyer-facing content.
 * Returns true if any supplier URL is found — meaning the content is UNSAFE.
 */
export function hasSupplierUrlLeak(content: unknown): boolean {
  const text = stripHtml(content);
  return SUPPLIER_URL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Detects supplier codes (CJ SKU hashes, UUIDs) in buyer-facing titles.
 * Returns true if supplier noise is detected.
 */
export function hasSupplierCodeNoise(text: unknown): boolean {
  const clean = String(text ?? '');
  return SUPPLIER_CODE_PATTERNS.some((pattern) => pattern.test(clean));
}

/**
 * Combined storefront quality gate — checks all brand-safety rules.
 * Returns { pass: boolean, issues: string[] } for diagnostic use.
 */
export function storefrontQualityGate(input: {
  title?: unknown;
  description?: unknown;
  productType?: unknown;
  tags?: unknown;
  attributes?: unknown;
}): { pass: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!isCjShopifyUsaDogsCatsOnly(input)) {
    issues.push('off_brand_not_dogs_cats');
  }
  if (hasSupplierUrlLeak(input.description)) {
    issues.push('supplier_url_in_description');
  }
  if (hasSupplierCodeNoise(input.title)) {
    issues.push('supplier_code_in_title');
  }

  return { pass: issues.length === 0, issues };
}

export function resolveMaxSellPriceUsd(value: unknown): number {
  if (value === null || value === undefined) return CJ_SHOPIFY_USA_DEFAULT_MAX_SELL_PRICE_USD;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? numeric
    : CJ_SHOPIFY_USA_DEFAULT_MAX_SELL_PRICE_USD;
}
