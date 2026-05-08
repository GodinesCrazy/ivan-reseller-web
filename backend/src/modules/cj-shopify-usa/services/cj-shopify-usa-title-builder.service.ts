/**
 * Title & Description Builder Service
 * ────────────────────────────────────
 * Extracted from cj-shopify-usa-publish.service.ts to improve testability
 * and reduce file size. Contains all text-processing logic for generating
 * buyer-ready Shopify titles and HTML descriptions from raw CJ product data.
 *
 * Pure functions only — no database or API calls.
 */

// ── Text utilities ────────────────────────────────────────────────────────────

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
      if (index > 0 && minorWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function sentenceCase(input: string): string {
  const text = normalizeWhitespace(input)
    .replace(/\b([A-Z][A-Z0-9&/-]{2,})\b/g, (word) => {
      if (['RFID', 'USB', 'LED', 'AAA', 'USPS', 'VIP'].includes(word)) return word;
      return toTitleCase(word.toLowerCase());
    })
    .replace(/\s*:\s*/g, ': ');
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function dedupeWords(words: string[]): string[] {
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

export function trimTitleToFit(input: string, maxLength = 58): string {
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

export function uniqueItems(items: string[]): string[] {
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

// ── Title detail extraction ───────────────────────────────────────────────────

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

function normalizedTitleKey(value: unknown): string {
  return normalizeWhitespace(String(value ?? ''))
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(cj[a-z0-9]+|\d{8,}[a-z0-9]*)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Title quality checks ──────────────────────────────────────────────────────

export function titleQualityIssues(title: unknown): string[] {
  const raw = normalizeWhitespace(String(title ?? ''));
  const key = normalizedTitleKey(raw);
  const words = key.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words);
  const issues: string[] = [];
  const genericTitles = new Set([
    'pet', 'pet supplies', 'pet product', 'pet grooming brush', 'pet feeding bowl',
    'pet water fountain', 'pet travel carrier', 'pet nail grooming tool',
    'adjustable pet collar', 'adjustable dog leash', 'dog harness',
    'cat enrichment toy', 'dog enrichment toy', 'pet enrichment toy',
    'dog comfort bed', 'cat comfort bed',
  ]);

  if (!raw || raw.length < 14) issues.push('title_too_short');
  if (words.length < 3) issues.push('title_too_few_words');
  if (genericTitles.has(key)) issues.push('title_too_generic');
  if (/\bcj[a-z0-9]{6,}\b/i.test(raw) || /\b\d{10,}\b/.test(raw)) issues.push('title_contains_supplier_code');
  if (uniqueWords.size > 0 && uniqueWords.size <= Math.ceil(words.length / 2) && words.length >= 6) {
    issues.push('title_repeats_words');
  }
  if (/\b(slave|bondage|bdsm|fetish|erotic|adult toys?|sex(y)?|lingerie|corset|mannequin)\b/i.test(raw)) {
    issues.push('title_unsafe_or_non_pet');
  }
  return issues;
}

export function isGenericBuyerTitle(title: unknown): boolean {
  return titleQualityIssues(title).includes('title_too_generic');
}

// ── Distinctive detail extraction ─────────────────────────────────────────────

function extractDistinctiveTitleDetail(input: {
  rawTitle: string;
  baseTitle: string;
  variantAttributes?: Record<string, unknown> | null;
}): string | null {
  const variantDetail = titleDetail({
    rawTitle: input.rawTitle,
    lower: input.rawTitle.toLowerCase(),
    variantAttributes: input.variantAttributes,
  });
  if (variantDetail) return variantDetail;

  const baseWords = new Set(normalizedTitleKey(input.baseTitle).split(/\s+/).filter(Boolean));
  const stopwords = new Set([
    'pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'kitten',
    'supplies', 'supply', 'accessory', 'accessories', 'product', 'products',
    'new', 'for', 'with', 'and', 'the', 'a', 'an', 'of', 'to',
  ]);
  const words = dedupeWords(
    normalizeWhitespace(input.rawTitle)
      .replace(/&/g, ' and ')
      .replace(/\b(cj[a-z0-9]+|\d{8,}[a-z0-9]*)\b/gi, ' ')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((word) => {
        const key = word.toLowerCase();
        return key.length >= 3 && !stopwords.has(key) && !baseWords.has(key);
      }),
  );

  const preferred = words.filter((word) =>
    /^(reflective|nylon|silicone|ceramic|waterproof|retractable|foldable|portable|automatic|interactive|slow|led|light|chest|harness|rope|filter|bamboo|stainless|steel|plush|braided|safety|training)$/i.test(word),
  );
  const selected = (preferred.length > 0 ? preferred : words).slice(0, 3);
  return selected.length > 0 ? toTitleCase(selected.join(' ')) : null;
}

function specificBuyerReadyTitle(input: {
  base: string;
  rawTitle: string;
  detail: string | null;
  variantAttributes?: Record<string, unknown> | null;
  maxLength?: number;
}): string {
  const maxLength = input.maxLength ?? 58;
  const detail = input.detail || extractDistinctiveTitleDetail({
    rawTitle: input.rawTitle,
    baseTitle: input.base,
    variantAttributes: input.variantAttributes,
  });
  const titled = specificTitle(input.base, detail, maxLength);
  if (!isGenericBuyerTitle(titled)) return titled;
  return trimTitleToFit(`Everyday ${input.base}`, maxLength);
}

// ── Professional title builder (main logic) ───────────────────────────────────

export function buildProfessionalTitle(input: {
  title: string;
  variantAttributes?: Record<string, unknown> | null;
}): string {
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
  const buyerSpecific = (base: string) => specificBuyerReadyTitle({
    base, rawTitle, detail, variantAttributes: input.variantAttributes,
  });

  // Pet product mappings
  if (/airtag|tracker/.test(lower) && /\b(dog|pet|cat|collar)\b/.test(lower)) return buyerSpecific('AirTag Pet Collar');
  if (/missing food ball|food ball|treat ball/.test(lower)) return 'Dog Treat Puzzle Ball';
  if (/food storage|storage bucket|storage container|kibble/.test(lower)) return buyerSpecific('Pet Food Storage Container');
  if (/tent|teepee/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return buyerSpecific('Warm Pet Tent Bed');
  if (/fence|gate|partition/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return buyerSpecific('Retractable Pet Safety Gate');
  if (/chest strap/.test(lower) && /led|illuminated|light/.test(lower) && /\b(dog|pet)\b/.test(lower)) return 'LED Dog Harness';
  if (/terrarium|breeding box|climbing box/.test(lower)) return 'Small Pet Terrarium Box';
  if (/shampoo|dispenser/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return buyerSpecific('Pet Bath Brush with Shampoo Dispenser');
  if (/foaming|foam/.test(lower) && /brush/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return buyerSpecific('Foaming Pet Bath Brush');
  if (/shampoo|bath|groom|brush|comb|nail|lint|hair|fur|massage/.test(lower) && /\b(pet|dog|cat|puppy|kitten)\b/.test(lower)) {
    if (/nail|clipper|trimmer|grinder/.test(lower)) return buyerSpecific('Pet Nail Grooming Tool');
    if (/scissor|shear/.test(lower)) return buyerSpecific('Pet Grooming Scissors');
    if (/glove/.test(lower)) return buyerSpecific('Pet Grooming Glove');
    if (/comb/.test(lower)) return buyerSpecific('Pet Grooming Comb');
    return buyerSpecific('Pet Grooming Brush');
  }
  if (/stair|steps|ladder|ramp|slope/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return buyerSpecific('Pet Stairs for Beds and Sofas');
  if (/fountain|water/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return buyerSpecific('Pet Water Fountain');
  if (/slow/.test(lower) && /feeder|bowl/.test(lower)) return 'Slow Feeder Pet Bowl';
  if (/bowl|feeder|feeding|food/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return buyerSpecific('Pet Feeding Bowl');
  if (/\b(bed|cushion|mat|blanket|sofa|pillow|house|nest)\b/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) {
    if (/\bcat|kitten\b/.test(lower)) return buyerSpecific('Cat Comfort Bed');
    if (/\bdog|puppy\b/.test(lower)) return buyerSpecific('Dog Comfort Bed');
    return buyerSpecific('Pet Comfort Bed');
  }
  if (/scratch/.test(lower) && /\bcat|kitten\b/.test(lower)) return buyerSpecific('Cat Scratcher Toy');
  if (/toy|chew|squeak|puzzle|ball|teaser|tunnel/.test(lower) && /\b(pet|dog|cat|puppy|kitten)\b/.test(lower)) {
    if (/\bdog|puppy\b/.test(lower)) return buyerSpecific('Dog Enrichment Toy');
    if (/\bcat|kitten\b/.test(lower)) return buyerSpecific('Cat Enrichment Toy');
    return buyerSpecific('Pet Enrichment Toy');
  }
  if (/seat belt|safety belt/.test(lower) && /\b(pet|dog|cat)\b/.test(lower)) return 'Pet Seat Belt';
  if (/carrier|sling|bag|backpack/.test(lower) && /\b(pet|dog|cat|hamster)\b/.test(lower)) return buyerSpecific('Pet Travel Carrier');
  if (/leash/.test(lower) && /\b(dog|puppy)\b/.test(lower)) return buyerSpecific('Adjustable Dog Leash');
  if (/harness/.test(lower) && /\b(dog|puppy)\b/.test(lower)) return buyerSpecific('Dog Harness');
  if (/collar/.test(lower) && /\b(dog|cat|pet|puppy|kitten)\b/.test(lower)) return buyerSpecific('Adjustable Pet Collar');

  // Non-pet product mappings
  if (/keyboard.*mouse.*wrist rest/i.test(rawTitle)) return 'Keyboard and Mouse Wrist Rest Set';
  if (/lipstick|lip gloss|chapstick|mascara/i.test(rawTitle) && /(organizer|holder)/i.test(rawTitle)) return 'Lipstick Organizer';
  if (/car seat gap/i.test(rawTitle) && /(organizer|filler|console)/i.test(rawTitle)) return 'Car Seat Gap Organizer';
  if (/carbon fiber/i.test(rawTitle) && /(wallet|card holder)/i.test(rawTitle) && /rfid/i.test(rawTitle)) return 'Carbon Fiber RFID Wallet';
  if (/pet grooming/i.test(rawTitle) && /scissors/i.test(rawTitle)) return 'Pet Grooming Scissors';
  if (/kitchen/i.test(rawTitle) && /timer/i.test(rawTitle)) return 'Digital Kitchen Timer';
  if (/tablet stand/i.test(rawTitle)) return 'Foldable Tablet Stand';

  // Generic fallback
  const firstClause = rawTitle.split(/\s*,\s*/)[0].split(/\s+(?:with|for)\s+/i)[0];
  const tokens = dedupeWords(
    firstClause.replace(/[^a-zA-Z0-9]+/g, ' ').split(/\s+/).filter(Boolean),
  );
  const stopwords = new Set(['for', 'with', 'and', 'the', 'a', 'an', 'of', 'sample', 'commercial', 'practical', 'everyday']);
  const preferred = tokens.filter((token) => !stopwords.has(token.toLowerCase()));
  const fallbackWords = preferred.length > 0 ? preferred : tokens;
  return trimTitleToFit(toTitleCase(fallbackWords.slice(0, 6).join(' ')));
}

// ── Description builder ───────────────────────────────────────────────────────

export function collectAttributeSpecs(attributes: Record<string, unknown> | null | undefined): string[] {
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

function toSafeInt(value: unknown): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

function buildShippingEta(snapshot: Record<string, unknown> | null | undefined): string {
  const minDays = toSafeInt(snapshot?.estimatedMinDays);
  const maxDays = toSafeInt(snapshot?.estimatedMaxDays);
  const origin = normalizeWhitespace(String(snapshot?.originCountryCode ?? '')).toUpperCase();

  if (minDays > 0 && maxDays > 0) {
    if (minDays === maxDays) return `Estimated delivery in ${minDays} business day${minDays === 1 ? '' : 's'}`;
    return `Estimated delivery in ${minDays}-${maxDays} business days`;
  }
  if (maxDays > 0) return `Estimated delivery in up to ${maxDays} business days`;
  if (origin === 'US') return 'Estimated delivery in 3-7 business days';
  return 'Estimated delivery shown at checkout';
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

export function buildDraftDescription(input: {
  title: string;
  description: string | null;
  variantAttributes?: Record<string, unknown> | null;
  shippingSnapshot?: Record<string, unknown> | null;
}): string {
  const professionalTitle = buildProfessionalTitle({
    title: input.title,
    variantAttributes: input.variantAttributes,
  });
  const rawText = stripHtmlToPlainText(String(input.description || ''));
  const lines = rawText.split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean);

  const ignoredHeadings = new Set([
    'product information', 'size information', 'packing list', 'product image', 'product images',
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

    if (sentenceParts.length > 0) highlightLines.push(...sentenceParts);
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

// ── Draft title (entry point) ─────────────────────────────────────────────────

export function buildDraftTitle(input: {
  title: string;
  variantAttributes?: Record<string, unknown> | null;
}): string {
  const professionalTitle = buildProfessionalTitle(input);
  if (professionalTitle.length > 0) return professionalTitle;
  return trimTitleToFit(toTitleCase(stripHtmlToPlainText(input.title)));
}

// ── Re-export normalizedTitleKey for duplicate checks ─────────────────────────

export { normalizedTitleKey };
