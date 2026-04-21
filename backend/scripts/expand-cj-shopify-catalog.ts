import dotenv from 'dotenv';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

type CollectionKey = 'travel' | 'workspace' | 'everyday';

type ApiListing = {
  id: number;
  status: string;
  listedPriceUsd?: string | number | null;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  shopifyHandle?: string | null;
  draftPayload?: any;
  product?: { id?: number; cjProductId?: string; title?: string };
  variant?: { id?: number; cjSku?: string; cjVid?: string | null };
};

type SearchProduct = {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  listPriceUsd?: number;
};

type Evaluation = {
  ok?: boolean;
  cjProductId: string;
  title: string;
  imageUrls?: string[];
  variants?: Array<{ cjSku: string; cjVid?: string; stock?: number; unitCostUsd?: number; attributes?: any }>;
  shipping?: {
    amountUsd: number;
    method?: string;
    estimatedDays: number | null;
    fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN';
    confidence?: string;
  } | null;
  qualification?: {
    decision: string;
    breakdown: {
      supplierCostUsd: number;
      shippingCostUsd: number;
      incidentBufferUsd?: number;
      totalCostUsd: number;
      paymentProcessingFeeUsd: number;
      targetProfitUsd: number;
      netProfitUsd?: number;
      netMarginPct?: number;
      suggestedSellPriceUsd: number;
    };
  } | null;
  shippingError?: string;
};

type Candidate = {
  collection: CollectionKey;
  keyword: string;
  rank: number;
  cjProductId: string;
  originalTitle: string;
  cleanTitle: string;
  evaluation?: Evaluation;
  score: number;
  eligible: boolean;
  selectedVariantCjVid?: string;
  selectedVariantSku?: string;
  rejectReason?: string;
  published?: boolean;
  listingId?: number;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  shopifyHandle?: string;
  finalPriceUsd?: number;
};

const configuredBaseUrl = process.env.CJ_SHOPIFY_USA_VALIDATION_BASE_URL || process.env.API_URL || '';
const BASE_URL =
  configuredBaseUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configuredBaseUrl)
    ? configuredBaseUrl
    : 'https://ivan-reseller-backend-production.up.railway.app';
const LOGIN_USER = process.env.CJ_SHOPIFY_USA_VALIDATION_USER || process.env.AUTOPILOT_LOGIN_USER || 'admin';
const LOGIN_PASSWORD = process.env.CJ_SHOPIFY_USA_VALIDATION_PASSWORD || process.env.AUTOPILOT_LOGIN_PASSWORD || 'admin123';
const DEST_POSTAL_CODE = process.env.CJ_SHOPIFY_USA_DEST_POSTAL_CODE || '10001';
const SHOP = (process.env.SHOPIFY_SHOP || 'ivanreseller-2.myshopify.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const OUTPUT_PATH = path.resolve(process.cwd(), 'catalog-expansion-2026-04-21-results.json');

const TARGET_COLLECTIONS: Record<CollectionKey, { title: string; handle: string; descriptionHtml: string }> = {
  travel: {
    title: 'Travel Comfort & Organizers',
    handle: 'travel-comfort-organizers',
    descriptionHtml: '<p>Travel accessories selected for cleaner packing, better comfort, and easier movement.</p>',
  },
  workspace: {
    title: 'Desk / Workspace Upgrades',
    handle: 'desk-workspace-upgrades',
    descriptionHtml: '<p>Workspace tools and desk organizers for cleaner, more productive routines.</p>',
  },
  everyday: {
    title: 'Smart Everyday Accessories',
    handle: 'smart-everyday-accessories',
    descriptionHtml: '<p>Practical accessories that make daily carry, charging, cleaning, and organization easier.</p>',
  },
};

const FEATURED_COLLECTION = {
  title: 'Ivan Reseller Featured Edit',
  handle: 'ivan-reseller-featured-edit',
  descriptionHtml: '<p>A tighter homepage edit of the strongest current Ivan Reseller products.</p>',
};

const KEYWORDS: Record<CollectionKey, string[]> = {
  travel: [
    'travel cable organizer pouch',
    'travel electronics organizer',
    'toiletry bag travel organizer',
    'passport holder travel wallet',
    'travel jewelry organizer',
    'shoe bags travel organizer',
    'luggage tags set',
    'compression packing cube',
  ],
  workspace: [
    'monitor stand desk organizer',
    'desk cable clips organizer',
    'under desk cable tray',
    'mouse wrist rest ergonomic',
    'desk drawer organizer',
    'phone tablet stand aluminum',
    'laptop sleeve stand',
    'desk lamp usb organizer',
  ],
  everyday: [
    'rfid card holder wallet',
    'car seat gap organizer',
    'key organizer compact',
    'mini flashlight keychain',
    'reusable lint remover',
    'magnetic charging cable',
    'bag organizer insert',
    'digital kitchen timer',
  ],
};

const TITLE_OVERRIDES: Record<string, string> = {
  'PD 20W Universal Travel Adapter Plug': '20W Universal Travel Adapter',
  '9Pcs Clothes Storage Bags Water-Resistant Travel Luggage Organizer Clothing Packing Cubes': '9-Piece Packing Cube Set',
  'U Shaped Pillow Travel Neck Pillow Memory Foam': 'Memory Foam Travel Neck Pillow',
  'Bottled travel cosmetics silicone bottle storage bottle': 'Silicone Travel Bottle Set',
  'Luggage Scale Portable Electronic Scale': 'Portable Digital Luggage Scale',
  'USB C multi hub docking station': 'USB-C Multiport Hub',
  'Simple Vertical Aluminum Laptop Stand Adjustable': 'Adjustable Aluminum Laptop Stand',
  'Dust-proof Storage Cable Management Box Hub Organizer Box': 'Cable Management Box',
  'Anti-Fatigue Rubber Floor Mat Dome Hollow Anti-static': 'Anti-Fatigue Desk Mat',
  'Magnetic Phone Holder For Car, Dashboard Car Phone Holder Mount Magnetic Stainless Steel Car Phone Holder - Dashboard Mount, Water-resistant, Rotatable': 'Magnetic Dashboard Phone Mount',
  'Portable Phone Holder Stand Desk Tablet With Mirror Mobile Phone Bracket With Mirror Foldable Phone Holder': 'Foldable Phone and Tablet Stand',
  'bluetooth tracker key finder': 'Bluetooth Key Finder',
  'Portable Mini Large  Ccity 10000mAh Power Bank': '10,000mAh Portable Power Bank',
  '2 In 1 Phone Computer Screen Cleaner Kit For Screen Dust Removal Microfiber Cloth Set': '2-in-1 Screen Cleaner Kit',
  'Neck Pillow Travel Pillow': 'Soft Travel Neck Pillow',
  'Wireless TWS Stereo Earbuds': 'Wireless Stereo Earbuds',
};

const BANNED_TITLE_PARTS = [
  'banned platforms',
  'amazon',
  'temu',
  'tiktok',
  'dog',
  'cat',
  'pet',
  'christmas',
  'halloween',
  'makeup',
  'eyelash',
  'tattoo',
  'wig',
  'sexy',
  'motorcycle',
  'printer accessories',
  '3d printer',
  'replacement parts',
  'raw material',
  'component',
  'screw',
  'nut ',
  'bolt',
  'repair',
  'elephant',
  'kawaii',
  'cute',
  'decorative',
  'bookend',
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gidNumber(gid?: string | null): string {
  return String(gid || '').split('/').pop() || '';
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function cleanTitle(raw: string): string {
  if (TITLE_OVERRIDES[raw]) return TITLE_OVERRIDES[raw];
  let title = raw
    .replace(/\([^)]*(TikTok|Amazon|Temu|Banned Platforms)[^)]*\)/gi, '')
    .replace(/\b(TikTok|Temu|Amazon|Banned Platforms)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+-\s+.*$/g, '')
    .trim();

  const comma = title.indexOf(',');
  if (comma > 24) title = title.slice(0, comma).trim();
  const words = title.split(' ').filter(Boolean);
  if (words.length > 8) title = words.slice(0, 8).join(' ');
  return title.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bUsb\b/g, 'USB').replace(/\bRfid\b/g, 'RFID');
}

function inferCollection(title: string): CollectionKey {
  const t = title.toLowerCase();
  if (/(travel|luggage|passport|packing|toiletry|shoe bag|jewelry|cable organizer pouch|neck pillow|bottle)/.test(t)) return 'travel';
  if (/(desk|workspace|laptop|monitor|cable management|hub|mouse|wrist|under desk|drawer|office|mat)/.test(t)) return 'workspace';
  return 'everyday';
}

function hasTitleRisk(title: string): string | null {
  const t = title.toLowerCase();
  for (const bad of BANNED_TITLE_PARTS) {
    if (t.includes(bad)) return `title risk: ${bad}`;
  }
  if (title.length < 8) return 'title too vague';
  if (/^[^a-zA-Z]*$/.test(title)) return 'title has no readable words';
  return null;
}

function commercialScore(input: { cleanTitle: string; evaluation: Evaluation; collection: CollectionKey }): number {
  const q = input.evaluation.qualification?.breakdown;
  const shipping = input.evaluation.shipping;
  const images = input.evaluation.imageUrls?.length || 0;
  const variants = input.evaluation.variants || [];
  const maxStock = variants.reduce((m, v) => Math.max(m, Number(v.stock || 0)), 0);
  let score = 0;
  score += Math.min(images, 6) * 4;
  score += Math.min(Math.log10(maxStock + 1) * 8, 32);
  if (shipping?.fulfillmentOrigin === 'US') score += 16;
  if (shipping?.estimatedDays != null && shipping.estimatedDays <= 7) score += 10;
  if (shipping?.estimatedDays != null && shipping.estimatedDays > 12) score -= 10;
  if (q) {
    if (q.suggestedSellPriceUsd >= 9.99 && q.suggestedSellPriceUsd <= 39.99) score += 12;
    if (q.shippingCostUsd <= 8) score += 8;
    if (q.supplierCostUsd >= 2) score += 7;
  }
  if (input.cleanTitle.length <= 48) score += 8;
  if (/(organizer|holder|stand|adapter|wallet|scale|hub|charger|travel|desk|cable|cleaner|power bank)/i.test(input.cleanTitle)) {
    score += 10;
  }
  return roundMoney(score);
}

function subtype(title: string, collection: CollectionKey): string {
  const t = title.toLowerCase();
  if (collection === 'travel') {
    if (/electronics|cable|charger|digital/.test(t)) return 'travel-electronics';
    if (/toiletry|cosmetic|bottle/.test(t)) return 'toiletry';
    if (/passport|wallet/.test(t)) return 'passport';
    if (/jewelry|watch/.test(t)) return 'jewelry';
    if (/shoe/.test(t)) return 'shoe-bag';
    if (/tag/.test(t)) return 'luggage-tag';
    if (/packing|cube|clothes/.test(t)) return 'packing';
    return 'travel-general';
  }
  if (collection === 'workspace') {
    if (/monitor|riser/.test(t)) return 'monitor-stand';
    if (/cable|wire|tray/.test(t)) return 'cable';
    if (/wrist|mouse/.test(t)) return 'ergonomic';
    if (/drawer|file|tray|organizer/.test(t)) return 'desk-organizer';
    if (/phone|tablet|stand|holder/.test(t)) return 'device-stand';
    if (/lamp|light/.test(t)) return 'lamp';
    return 'workspace-general';
  }
  if (/rfid|card holder|wallet/.test(t)) return 'wallet';
  if (/car seat|car gap|car organizer/.test(t)) return 'car-organizer';
  if (/key organizer|key holder/.test(t)) return 'key-organizer';
  if (/flashlight|torch/.test(t)) return 'flashlight';
  if (/lint/.test(t)) return 'lint';
  if (/charging|charger|cable/.test(t)) return 'charging';
  if (/bag organizer|insert/.test(t)) return 'bag-organizer';
  if (/timer/.test(t)) return 'timer';
  return 'everyday-general';
}

function stricterPrice(cost: number, shipping: number): number {
  const total = cost + shipping;
  const buffer = total * 0.03;
  const fixedFee = 0.3;
  const feePct = 0.054;
  const margin = 0.2;
  const minProfit = 3.0;
  const marginPrice = (total + buffer + fixedFee) / (1 - feePct - margin);
  const profitPrice = (total + buffer + fixedFee + minProfit) / (1 - feePct);
  const raw = Math.max(marginPrice, profitPrice, 9.99);
  return roundMoney(Math.ceil(raw) - 0.01);
}

function pricingViolations(cost: number, shipping: number, price: number): string[] {
  const violations: string[] = [];
  const total = cost + shipping + (cost + shipping) * 0.03;
  const fee = price * 0.054 + 0.3;
  const profit = price - total - fee;
  const margin = price > 0 ? profit / price : 0;
  if (shipping > 8) violations.push(`shipping $${shipping.toFixed(2)} > $8.00`);
  if (cost < 2) violations.push(`supplier cost $${cost.toFixed(2)} < $2.00`);
  if (price < 9.99) violations.push(`price $${price.toFixed(2)} < $9.99`);
  if (profit < 3) violations.push(`net profit $${profit.toFixed(2)} < $3.00`);
  if (margin < 0.2) violations.push(`net margin ${(margin * 100).toFixed(1)}% < 20%`);
  return violations;
}

async function login(): Promise<string> {
  const response = await fetch(new URL('/api/auth/login', BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: LOGIN_USER, password: LOGIN_PASSWORD }),
  });
  const text = await response.text();
  const cookie = response.headers.get('set-cookie') || '';
  const token = cookie.match(/token=([^;]+)/)?.[1] || '';
  if (!response.ok || !token) throw new Error(`login failed ${response.status}: ${text.slice(0, 200)}`);
  return token;
}

async function apiRequest<T>(token: string, method: string, pathname: string, body?: unknown, query?: Record<string, string | number>) {
  const url = new URL(pathname, BASE_URL);
  for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: method !== 'GET' ? JSON.stringify(body || {}) : undefined,
  });
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed ${response.status}: ${data.error || data.message || text.slice(0, 250)}`);
  }
  return data as T;
}

async function getShopifyAccessToken(): Promise<string> {
  const clientId = process.env.SHOPIFY_CLIENT_ID || '';
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) throw new Error('SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET missing from env');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
  const response = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(`Shopify token failed: ${response.status}`);
  return payload.access_token;
}

async function shopifyRest<T>(accessToken: string, method: string, endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) throw new Error(`${method} ${endpoint} failed ${response.status}: ${text.slice(0, 300)}`);
  return data as T;
}

async function discoverAndEvaluate(token: string, activeCjIds: Set<string>, targetByCollection: Record<CollectionKey, number>) {
  const rejected: Candidate[] = [];
  const selected: Candidate[] = [];
  const evaluatedIds = new Set<string>(activeCjIds);

  for (const collection of ['travel', 'workspace', 'everyday'] as CollectionKey[]) {
    let evaluationsForCollection = 0;
    for (const keyword of KEYWORDS[collection]) {
      if (
        evaluationsForCollection >= 34 ||
        selected.filter((c) => c.collection === collection).length >= Math.max(targetByCollection[collection] * 4, targetByCollection[collection])
      ) {
        break;
      }
      const search = await apiRequest<{ ok: boolean; results: SearchProduct[] }>(
        token,
        'GET',
        '/api/cj-shopify-usa/discover/search',
        undefined,
        { keyword, page: 1, pageSize: 10 },
      );
      await sleep(700);

      for (const [index, product] of (search.results || []).slice(0, 6).entries()) {
        if (evaluationsForCollection >= 34) break;
        if (!product.cjProductId || evaluatedIds.has(product.cjProductId)) continue;
        evaluatedIds.add(product.cjProductId);

        const clean = cleanTitle(product.title);
        const base: Candidate = {
          collection,
          keyword,
          rank: index + 1,
          cjProductId: product.cjProductId,
          originalTitle: product.title,
          cleanTitle: clean,
          score: 0,
          eligible: false,
        };

        const titleRisk = hasTitleRisk(product.title);
        if (titleRisk) {
          rejected.push({ ...base, rejectReason: titleRisk });
          continue;
        }

        let evaluation: Evaluation;
        try {
          evaluationsForCollection += 1;
          evaluation = await apiRequest<Evaluation>(token, 'POST', '/api/cj-shopify-usa/discover/evaluate', {
            cjProductId: product.cjProductId,
            quantity: 1,
            destPostalCode: DEST_POSTAL_CODE,
          });
        } catch (error) {
          rejected.push({ ...base, rejectReason: error instanceof Error ? error.message : String(error) });
          continue;
        } finally {
          await sleep(900);
        }

        const variants = evaluation.variants || [];
        const eligibleVariants = variants.filter((v) => Number(v.stock || 0) >= 1);
        const variant = eligibleVariants.sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0))[0];
        const q = evaluation.qualification?.breakdown;
        const violations = q
          ? pricingViolations(Number(q.supplierCostUsd || 0), Number(evaluation.shipping?.amountUsd || q.shippingCostUsd || 0), stricterPrice(Number(q.supplierCostUsd || 0), Number(evaluation.shipping?.amountUsd || q.shippingCostUsd || 0)))
          : ['missing pricing breakdown'];

        const candidate: Candidate = {
          ...base,
          evaluation,
          selectedVariantCjVid: variant?.cjVid,
          selectedVariantSku: variant?.cjSku,
          score: commercialScore({ cleanTitle: clean, evaluation, collection }),
          eligible: false,
        };

        if (!variant) {
          rejected.push({ ...candidate, rejectReason: 'no live stock variant' });
          continue;
        }
        if (!evaluation.shipping) {
          rejected.push({ ...candidate, rejectReason: evaluation.shippingError || 'no USA shipping quote' });
          continue;
        }
        if (evaluation.qualification?.decision !== 'APPROVED') {
          rejected.push({ ...candidate, rejectReason: `qualification ${evaluation.qualification?.decision || 'missing'}` });
          continue;
        }
        if (violations.length > 0) {
          rejected.push({ ...candidate, rejectReason: violations.join('; ') });
          continue;
        }
        if ((evaluation.imageUrls || []).length < 1) {
          rejected.push({ ...candidate, rejectReason: 'no product imagery' });
          continue;
        }
        if ((evaluation.shipping.estimatedDays || 99) > 14) {
          rejected.push({ ...candidate, rejectReason: `delivery estimate ${evaluation.shipping.estimatedDays} days too slow` });
          continue;
        }
        if (candidate.score < 56) {
          rejected.push({ ...candidate, rejectReason: `quality score ${candidate.score} below floor` });
          continue;
        }

        selected.push({ ...candidate, eligible: true });
      }
    }
  }

  return { selected, rejected };
}

async function ensureCollections(accessToken: string) {
  const current = await shopifyRest<{ custom_collections: Array<{ id: number; title: string; handle: string; products_count?: number }> }>(
    accessToken,
    'GET',
    'custom_collections.json?limit=250',
  );
  const byHandle = new Map((current.custom_collections || []).map((c) => [c.handle, c]));
  const out = new Map<string, number>();
  for (const def of [...Object.values(TARGET_COLLECTIONS), FEATURED_COLLECTION]) {
    const existing = byHandle.get(def.handle);
    if (existing?.id) {
      out.set(def.handle, existing.id);
      continue;
    }
    const created = await shopifyRest<{ custom_collection: { id: number; handle: string } }>(
      accessToken,
      'POST',
      'custom_collections.json',
      { custom_collection: { title: def.title, handle: def.handle, body_html: def.descriptionHtml, published: true } },
    );
    out.set(def.handle, created.custom_collection.id);
    await sleep(350);
  }
  return out;
}

async function assignProduct(accessToken: string, productId: string, collectionId: number) {
  const numericProductId = gidNumber(productId);
  const collects = await shopifyRest<{ collects: Array<{ id: number; collection_id: number }> }>(
    accessToken,
    'GET',
    `collects.json?product_id=${numericProductId}&limit=250`,
  );
  if ((collects.collects || []).some((c) => Number(c.collection_id) === Number(collectionId))) return 'existing';
  await shopifyRest(accessToken, 'POST', 'collects.json', { collect: { product_id: numericProductId, collection_id: collectionId } });
  await sleep(250);
  return 'created';
}

async function updateShopifyProduct(accessToken: string, input: { productId: string; title: string; handle?: string; bodyHtml?: string }) {
  const numeric = gidNumber(input.productId);
  await shopifyRest(accessToken, 'PUT', `products/${numeric}.json`, {
    product: {
      id: numeric,
      title: input.title,
      ...(input.handle ? { handle: input.handle } : {}),
      ...(input.bodyHtml ? { body_html: input.bodyHtml } : {}),
    },
  });
}

async function updateVariantPrice(accessToken: string, variantGid: string, price: number) {
  const variantId = gidNumber(variantGid);
  if (!variantId) return false;
  await shopifyRest(accessToken, 'PUT', `variants/${variantId}.json`, { variant: { id: variantId, price: price.toFixed(2) } });
  return true;
}

async function addImagesIfMissing(accessToken: string, productId: string, imageUrls: string[]) {
  const numeric = gidNumber(productId);
  const existing = await shopifyRest<{ images: Array<{ id: number; src: string }> }>(accessToken, 'GET', `products/${numeric}/images.json`);
  if ((existing.images || []).length > 0) return 0;
  let added = 0;
  for (const src of imageUrls.slice(0, 5)) {
    if (!/^https?:\/\//.test(src)) continue;
    try {
      await shopifyRest(accessToken, 'POST', `products/${numeric}/images.json`, { image: { src } });
      added += 1;
      await sleep(650);
    } catch {
      // Keep publishing progress even if one CJ CDN image is rejected.
    }
  }
  return added;
}

async function publishCandidate(token: string, accessToken: string, candidate: Candidate): Promise<Candidate> {
  const q = candidate.evaluation?.qualification?.breakdown;
  const shipping = Number(candidate.evaluation?.shipping?.amountUsd || q?.shippingCostUsd || 0);
  const cost = Number(q?.supplierCostUsd || 0);
  const finalPrice = stricterPrice(cost, shipping);

  const draft = await apiRequest<{ ok: boolean; dbProductId: number; listing: { id: number; status: string; listedPriceUsd: number; shopifySku: string } }>(
    token,
    'POST',
    '/api/cj-shopify-usa/discover/import-draft',
    {
      cjProductId: candidate.cjProductId,
      variantCjVid: candidate.selectedVariantCjVid,
      quantity: 1,
      destPostalCode: DEST_POSTAL_CODE,
    },
  );

  const publish = await apiRequest<{ ok: boolean; listing: ApiListing }>(
    token,
    'POST',
    '/api/cj-shopify-usa/listings/publish',
    { listingId: draft.listing.id },
  );
  const listing = publish.listing;
  if (!publish.ok || !listing.shopifyProductId) throw new Error('publish returned no Shopify product id');

  await updateShopifyProduct(accessToken, {
    productId: listing.shopifyProductId,
    title: candidate.cleanTitle,
    handle: `${cleanTitle(candidate.cleanTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${draft.listing.id}`,
  });
  if (listing.shopifyVariantId) await updateVariantPrice(accessToken, listing.shopifyVariantId, finalPrice);
  await addImagesIfMissing(accessToken, listing.shopifyProductId, candidate.evaluation?.imageUrls || []);

  return {
    ...candidate,
    published: true,
    listingId: draft.listing.id,
    shopifyProductId: listing.shopifyProductId,
    shopifyVariantId: listing.shopifyVariantId || undefined,
    shopifyHandle: listing.shopifyHandle || undefined,
    finalPriceUsd: finalPrice,
  };
}

async function updateExistingMerchandising(accessToken: string, listings: ApiListing[], collectionIds: Map<string, number>) {
  const assignments: Array<{ title: string; collection: string; result: string }> = [];
  const priceCorrections: Array<{ title: string; listingId: number; oldPrice: number; newPrice: number; result: string }> = [];
  const titleUpdates: Array<{ from: string; to: string }> = [];
  const imageAdds: Array<{ title: string; added: number }> = [];

  for (const listing of listings.filter((l) => l.status === 'ACTIVE' && l.shopifyProductId)) {
    const rawTitle = String(listing.product?.title || listing.draftPayload?.title || '').trim();
    const title = cleanTitle(rawTitle);
    const collection = inferCollection(rawTitle);
    const collectionId = collectionIds.get(TARGET_COLLECTIONS[collection].handle);
    if (collectionId) {
      const result = await assignProduct(accessToken, listing.shopifyProductId!, collectionId);
      assignments.push({ title, collection: TARGET_COLLECTIONS[collection].title, result });
    }

    if (title && title !== rawTitle) {
      try {
        await updateShopifyProduct(accessToken, { productId: listing.shopifyProductId!, title });
        titleUpdates.push({ from: rawTitle, to: title });
      } catch {
        // Non-critical; keep catalog expansion moving.
      }
    }

    const pricing = listing.draftPayload?.pricingSnapshot || {};
    const shipping = listing.draftPayload?.shippingSnapshot || {};
    const cost = Number(pricing.supplierCostUsd || 0);
    const ship = Number(shipping.amountUsd ?? pricing.shippingCostUsd ?? 0);
    if (cost > 0) {
      const current = Number(listing.listedPriceUsd || pricing.suggestedSellPriceUsd || 0);
      const target = stricterPrice(cost, ship);
      const violations = pricingViolations(cost, ship, current);
      if (violations.length > 0 && listing.shopifyVariantId) {
        try {
          await updateVariantPrice(accessToken, listing.shopifyVariantId, target);
          priceCorrections.push({ title, listingId: listing.id, oldPrice: current, newPrice: target, result: 'shopify_updated' });
        } catch (error) {
          priceCorrections.push({ title, listingId: listing.id, oldPrice: current, newPrice: target, result: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    const images = Array.isArray(listing.draftPayload?.images) ? listing.draftPayload.images : [];
    if (images.length > 0) {
      const added = await addImagesIfMissing(accessToken, listing.shopifyProductId!, images);
      if (added > 0) imageAdds.push({ title, added });
    }
  }
  return { assignments, priceCorrections, titleUpdates, imageAdds };
}

async function getCollectionDistribution(accessToken: string, collectionIds: Map<string, number>) {
  const out: Record<string, number> = {};
  for (const def of Object.values(TARGET_COLLECTIONS)) {
    const id = collectionIds.get(def.handle);
    if (!id) {
      out[def.title] = 0;
      continue;
    }
    const collects = await shopifyRest<{ collects: Array<unknown> }>(accessToken, 'GET', `collects.json?collection_id=${id}&limit=250`);
    out[def.title] = (collects.collects || []).length;
  }
  return out;
}

async function curateFeatured(accessToken: string, activeListings: ApiListing[], newProducts: Candidate[], collectionIds: Map<string, number>) {
  const featuredId = collectionIds.get(FEATURED_COLLECTION.handle);
  if (!featuredId) return { assigned: [], themeUpdated: false };

  const preferred = [
    'USB-C Multiport Hub',
    'Adjustable Aluminum Laptop Stand',
    '9-Piece Packing Cube Set',
    '20W Universal Travel Adapter',
    'Bluetooth Key Finder',
    '10,000mAh Portable Power Bank',
    'Magnetic Dashboard Phone Mount',
    'Cable Management Box',
  ];
  const activeByCleanTitle = new Map<string, ApiListing>();
  for (const listing of activeListings) {
    if (listing.status !== 'ACTIVE' || !listing.shopifyProductId) continue;
    activeByCleanTitle.set(cleanTitle(String(listing.product?.title || listing.draftPayload?.title || '')), listing);
  }
  const newByCleanTitle = new Map(newProducts.filter((p) => p.published && p.shopifyProductId).map((p) => [p.cleanTitle, p]));
  const assigned: string[] = [];

  for (const title of preferred) {
    const existing = activeByCleanTitle.get(title);
    const fresh = newByCleanTitle.get(title);
    const productId = fresh?.shopifyProductId || existing?.shopifyProductId;
    if (!productId) continue;
    await assignProduct(accessToken, productId, featuredId);
    assigned.push(title);
  }

  let main: { id: number; role: string; name: string } | undefined;
  let themeUpdateError: string | null = null;
  try {
    const themes = await shopifyRest<{ themes: Array<{ id: number; role: string; name: string }> }>(accessToken, 'GET', 'themes.json');
    main = (themes.themes || []).find((t) => t.role === 'main');
  } catch (error) {
    themeUpdateError = error instanceof Error ? error.message : String(error);
  }
  let themeUpdated = false;
  if (main) {
    try {
      const asset = await shopifyRest<{ asset: { value: string } }>(
        accessToken,
        'GET',
        `themes/${main.id}/assets.json?asset[key]=templates/index.json`,
      );
      const json = JSON.parse(asset.asset.value);
      if (json.sections?.product_list_fa6P9H?.settings) {
        json.sections.product_list_fa6P9H.settings.collection = FEATURED_COLLECTION.handle;
      }
      if (json.sections?.ir_merch_story_main?.settings) {
        json.sections.ir_merch_story_main.settings.collection = FEATURED_COLLECTION.handle;
      }
      await shopifyRest(accessToken, 'PUT', `themes/${main.id}/assets.json`, {
        asset: { key: 'templates/index.json', value: JSON.stringify(json, null, 2) },
      });
      themeUpdated = true;
    } catch (error) {
      themeUpdateError = error instanceof Error ? error.message : String(error);
    }
  }

  return { assigned, themeUpdated, themeUpdateError };
}

async function storefrontQa(handles: string[]) {
  const results = [];
  for (const handle of handles.slice(0, 4)) {
    const url = `https://${SHOP}/products/${handle}`;
    try {
      const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 Ivan Reseller QA' } });
      const html = await response.text();
      results.push({
        handle,
        status: response.status,
        finalUrl: response.url,
        passwordGate: response.url.includes('/password') || /Opening soon|Enter store using password/i.test(html),
        hasProductForm: /<form[^>]+action="\/cart\/add|name="add"|Add to cart|Agregar al carrito|data-type="add-to-cart-form"/i.test(html),
        hasPrice: /\$\s?\d|USD/i.test(html),
        hasBrokenCardMarker: /product-card-gallery__title-placeholder/i.test(html),
      });
    } catch (error) {
      results.push({ handle, error: error instanceof Error ? error.message : String(error) });
    }
    await sleep(400);
  }
  return results;
}

async function main() {
  const startedAt = new Date().toISOString();
  const token = await login();
  const accessToken = await getShopifyAccessToken();
  const overviewBefore = await apiRequest<{ ok: boolean; counts: Record<string, number> }>(token, 'GET', '/api/cj-shopify-usa/overview');
  const listingsBefore = await apiRequest<{ ok: boolean; listings: ApiListing[] }>(token, 'GET', '/api/cj-shopify-usa/listings');
  const activeBefore = listingsBefore.listings.filter((l) => l.status === 'ACTIVE');
  const activeCjIds = new Set(activeBefore.map((l) => String(l.product?.cjProductId || l.draftPayload?.cjProductId || '')).filter(Boolean));
  const beforeByCollection = activeBefore.reduce(
    (acc, l) => {
      acc[inferCollection(String(l.product?.title || l.draftPayload?.title || ''))] += 1;
      return acc;
    },
    { travel: 0, workspace: 0, everyday: 0 } as Record<CollectionKey, number>,
  );

  const targetTotal = 24;
  const neededTotal = Math.max(0, targetTotal - activeBefore.length);
  const targetByCollection: Record<CollectionKey, number> = {
    travel: Math.max(0, 8 - beforeByCollection.travel),
    workspace: Math.max(0, 8 - beforeByCollection.workspace),
    everyday: Math.max(0, 8 - beforeByCollection.everyday),
  };
  let allocated = targetByCollection.travel + targetByCollection.workspace + targetByCollection.everyday;
  while (allocated > neededTotal) {
    const key = (Object.entries(targetByCollection).sort((a, b) => b[1] - a[1])[0]?.[0] || 'everyday') as CollectionKey;
    targetByCollection[key] -= 1;
    allocated -= 1;
  }

  const { selected, rejected } = await discoverAndEvaluate(token, activeCjIds, targetByCollection);
  const toPublish: Candidate[] = [];
  const usedSubtypes = new Set<string>();
  for (const collection of ['travel', 'workspace', 'everyday'] as CollectionKey[]) {
    const wanted = targetByCollection[collection];
    const pool = selected.filter((candidate) => candidate.collection === collection).sort((a, b) => b.score - a.score);
    for (const candidate of pool) {
      if (toPublish.filter((p) => p.collection === collection).length >= wanted) break;
      const key = `${collection}:${subtype(candidate.cleanTitle || candidate.originalTitle, collection)}`;
      if (usedSubtypes.has(key)) continue;
      usedSubtypes.add(key);
      toPublish.push(candidate);
    }
    for (const candidate of pool) {
      if (toPublish.filter((p) => p.collection === collection).length >= wanted) break;
      if (toPublish.some((p) => p.cjProductId === candidate.cjProductId)) continue;
      toPublish.push(candidate);
    }
  }
  if (toPublish.length < neededTotal) {
    for (const candidate of selected.sort((a, b) => b.score - a.score)) {
      if (toPublish.length >= neededTotal) break;
      if (toPublish.some((p) => p.cjProductId === candidate.cjProductId)) continue;
      toPublish.push(candidate);
    }
  }

  const published: Candidate[] = [];
  const publishFailures: Candidate[] = [];
  for (const candidate of toPublish) {
    try {
      const out = await publishCandidate(token, accessToken, candidate);
      published.push(out);
    } catch (error) {
      publishFailures.push({ ...candidate, published: false, rejectReason: error instanceof Error ? error.message : String(error) });
    }
    await sleep(1200);
  }

  const overviewMid = await apiRequest<{ ok: boolean; counts: Record<string, number> }>(token, 'GET', '/api/cj-shopify-usa/overview');
  const listingsAfterPublish = await apiRequest<{ ok: boolean; listings: ApiListing[] }>(token, 'GET', '/api/cj-shopify-usa/listings');
  const collectionIds = await ensureCollections(accessToken);
  const merchandising = await updateExistingMerchandising(accessToken, listingsAfterPublish.listings, collectionIds);

  for (const candidate of published) {
    const id = collectionIds.get(TARGET_COLLECTIONS[candidate.collection].handle);
    if (id && candidate.shopifyProductId) await assignProduct(accessToken, candidate.shopifyProductId, id);
  }

  const listingsAfterMerch = await apiRequest<{ ok: boolean; listings: ApiListing[] }>(token, 'GET', '/api/cj-shopify-usa/listings');
  const featured = await curateFeatured(accessToken, listingsAfterMerch.listings, published, collectionIds);
  const collectionDistribution = await getCollectionDistribution(accessToken, collectionIds);

  const overviewAfter = await apiRequest<{ ok: boolean; counts: Record<string, number> }>(token, 'GET', '/api/cj-shopify-usa/overview');
  const qaHandles = published.map((p) => p.shopifyHandle).filter(Boolean) as string[];
  const qa = await storefrontQa(qaHandles);

  const result = {
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    shop: SHOP,
    overviewBefore,
    activeBefore: activeBefore.length,
    inferredBeforeByCollection: beforeByCollection,
    targetByCollection,
    selected,
    rejected: rejected.concat(publishFailures),
    published,
    overviewAfterPublish: overviewMid,
    overviewAfter,
    merchandising,
    collectionDistribution,
    featured,
    storefrontQa: qa,
    finalActiveListings: overviewAfter.counts.listingsActive,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    outputPath: OUTPUT_PATH,
    activeBefore: activeBefore.length,
    published: published.length,
    finalActiveListings: overviewAfter.counts.listingsActive,
    collectionDistribution,
    qa,
  }, null, 2));
}

main().catch(async (error) => {
  const failure = { failedAt: new Date().toISOString(), message: error instanceof Error ? error.message : String(error) };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(failure, null, 2)}\n`, 'utf8').catch(() => undefined);
  console.error(failure.message);
  process.exit(1);
});
