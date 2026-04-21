/**
 * Curated Launch Script for CJ → Shopify USA
 * 
 * This script implements the curated launch specification:
 * - 12-18 products across 3 collections
 * - Travel Comfort & Organizers
 * - Desk / Workspace Upgrades
 * - Smart Everyday Accessories
 * 
 * Run: npx ts-node scripts/curated-launch-cj-shopify.ts
 */

import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

const BASE_URL = process.env.CJ_SHOPIFY_USA_VALIDATION_BASE_URL || 
                 process.env.API_URL || 
                 'https://ivan-reseller-backend-production.up.railway.app';

const LOGIN_USER = process.env.CJ_SHOPIFY_USA_VALIDATION_USER || 
                   process.env.AUTOPILOT_LOGIN_USER || 
                   'admin';

const LOGIN_PASSWORD = process.env.CJ_SHOPIFY_USA_VALIDATION_PASSWORD || 
                       process.env.AUTOPILOT_LOGIN_PASSWORD || 
                       'admin123';

const DEST_POSTAL_CODE = process.env.CJ_SHOPIFY_USA_DEST_POSTAL_CODE || '10001';

// Curated launch keywords by collection
const LAUNCH_KEYWORDS = {
  travel: [
    'universal travel adapter',
    'packing cubes luggage organizer',
    'neck pillow travel memory foam',
    'travel bottles toiletry containers',
    'luggage scale portable',
  ],
  workspace: [
    'usb c hub docking station',
    'laptop stand adjustable aluminum',
    'cable organizer management box',
    'standing desk mat anti fatigue',
    'wireless earbuds bluetooth',
  ],
  everyday: [
    'magnetic car phone holder mount',
    'phone stand foldable desk',
    'key finder bluetooth tracker',
    'power bank 10000mah portable',
    'screen cleaner kit electronics',
  ],
} as const;

const OUTPUT_PATH = path.resolve(process.cwd(), 'curated-launch-results.json');

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeString(value: unknown): string | null {
  const out = String(value ?? '').trim();
  return out.length > 0 ? out : null;
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function login(): Promise<string> {
  const response = await fetch(new URL('/api/auth/login', BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: LOGIN_USER,
      password: LOGIN_PASSWORD,
    }),
  });

  const setCookie = response.headers.get('set-cookie') || '';
  const token = setCookie.match(/token=([^;]+)/)?.[1] || '';
  if (!response.ok || !token) {
    const body = await response.text().catch(() => '');
    throw new Error(`Login failed (${response.status}). ${body.slice(0, 300)}`);
  }

  return token;
}

async function apiRequest<T = unknown>(input: {
  token: string;
  method?: 'GET' | 'POST';
  pathname: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}): Promise<{ status: number; data: T }> {
  const method = input.method || 'GET';
  const url = new URL(input.pathname, BASE_URL);
  for (const [key, value] of Object.entries(input.query || {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${input.token}`,
      ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: method !== 'GET' ? JSON.stringify(input.body ?? {}) : undefined,
  });

  const text = await response.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = { raw: text } as T;
  }

  if (!response.ok) {
    const message =
      safeString((data as JsonRecord)?.error) ||
      safeString((data as JsonRecord)?.message) ||
      `HTTP ${response.status}`;
    throw new Error(`${method} ${url.pathname} failed: ${message}`);
  }

  return { status: response.status, data };
}

interface DiscoveredProduct {
  cjProductId: string;
  title: string;
  keyword: string;
  collection: 'travel' | 'workspace' | 'everyday';
}

interface EvaluatedProduct extends DiscoveredProduct {
  evaluated: boolean;
  eligible: boolean;
  hasStock: boolean;
  isApproved: boolean;
  hasShipping: boolean;
  discardReason?: string;
  error?: string;
  variantCjVid?: string;
  variantCjSku?: string;
  pricing?: {
    supplierCostUsd: number;
    shippingCostUsd: number;
    suggestedSellPriceUsd: number;
  };
  shipping?: {
    amountUsd: number;
    method?: string;
    estimatedDays: number | null;
    fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN';
  };
}

interface PublishedProduct extends EvaluatedProduct {
  published: boolean;
  listingId?: number;
  shopifyProductId?: string;
  shopifyHandle?: string;
  publishError?: string;
}

async function discoverProducts(
  token: string,
  collection: 'travel' | 'workspace' | 'everyday'
): Promise<DiscoveredProduct[]> {
  const keywords = LAUNCH_KEYWORDS[collection];
  const discovered: DiscoveredProduct[] = [];

  for (const keyword of keywords) {
    try {
      const search = await apiRequest<{
        ok: boolean;
        results: Array<{
          cjProductId: string;
          title: string;
          mainImageUrl?: string;
        }>;
      }>({
        token,
        pathname: '/api/cj-shopify-usa/discover/search',
        query: {
          keyword,
          page: 1,
          pageSize: 5,
        },
      });

      if (search.data.ok && Array.isArray(search.data.results)) {
        // Take first result for each keyword
        const first = search.data.results[0];
        if (first) {
          discovered.push({
            cjProductId: first.cjProductId,
            title: first.title,
            keyword,
            collection,
          });
        }
      }

      await sleep(1000);
    } catch (error) {
      console.log(`Search failed for "${keyword}": ${summarizeError(error)}`);
    }
  }

  return discovered;
}

async function evaluateProduct(
  token: string,
  product: DiscoveredProduct
): Promise<EvaluatedProduct> {
  const base: EvaluatedProduct = {
    ...product,
    evaluated: false,
    eligible: false,
    hasStock: false,
    isApproved: false,
    hasShipping: false,
  };

  try {
    const evalResult = await apiRequest<{
      ok: boolean;
      cjProductId: string;
      title: string;
      variants: Array<{
        cjSku: string;
        cjVid?: string;
        stock: number;
        unitCostUsd: number;
      }>;
      shipping?: {
        amountUsd: number;
        method?: string;
        estimatedDays: number | null;
        fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN';
      };
      qualification?: {
        decision: string;
        breakdown: {
          supplierCostUsd: number;
          shippingCostUsd: number;
          suggestedSellPriceUsd: number;
        };
      };
      shippingError?: string;
    }>({
      token,
      method: 'POST',
      pathname: '/api/cj-shopify-usa/discover/evaluate',
      body: {
        cjProductId: product.cjProductId,
        quantity: 1,
        destPostalCode: DEST_POSTAL_CODE,
      },
    });

    const data = evalResult.data;
    base.evaluated = true;

    if (!data.ok) {
      base.discardReason = 'Evaluation returned not ok';
      return base;
    }

    // Check stock
    const variants = data.variants || [];
    const eligibleVariants = variants.filter(v => (v.stock || 0) >= 1);
    base.hasStock = eligibleVariants.length > 0;

    // Select best variant (highest stock)
    const selectedVariant = eligibleVariants.sort((a, b) => (b.stock || 0) - (a.stock || 0))[0];
    if (selectedVariant) {
      base.variantCjVid = selectedVariant.cjVid;
      base.variantCjSku = selectedVariant.cjSku;
    }

    // Check shipping
    base.hasShipping = !!data.shipping;
    base.shipping = data.shipping;

    // Check approval
    base.isApproved = data.qualification?.decision === 'APPROVED';

    // Save pricing
    if (data.qualification?.breakdown) {
      base.pricing = {
        supplierCostUsd: data.qualification.breakdown.supplierCostUsd,
        shippingCostUsd: data.qualification.breakdown.shippingCostUsd,
        suggestedSellPriceUsd: data.qualification.breakdown.suggestedSellPriceUsd,
      };
    }

    // Determine eligibility
    base.eligible = base.hasStock && base.hasShipping && base.isApproved;
    
    if (!base.eligible) {
      if (!base.hasStock) base.discardReason = 'No variants with stock >= 1';
      else if (!base.hasShipping) base.discardReason = data.shippingError || 'No shipping quote';
      else if (!base.isApproved) base.discardReason = `Qualification: ${data.qualification?.decision || 'UNKNOWN'}`;
    }

    await sleep(1000);
  } catch (error) {
    base.error = summarizeError(error);
    base.discardReason = 'Evaluation request failed';
  }

  return base;
}

async function importAndPublish(
  token: string,
  product: EvaluatedProduct
): Promise<PublishedProduct> {
  const result: PublishedProduct = {
    ...product,
    published: false,
  };

  if (!product.eligible) {
    return result;
  }

  try {
    // Import and create draft
    const importDraft = await apiRequest<{
      ok: boolean;
      dbProductId: number;
      listing: {
        id: number;
        status: string;
      };
    }>({
      token,
      method: 'POST',
      pathname: '/api/cj-shopify-usa/discover/import-draft',
      body: {
        cjProductId: product.cjProductId,
        variantCjVid: product.variantCjVid,
        quantity: 1,
        destPostalCode: DEST_POSTAL_CODE,
      },
    });

    if (!importDraft.data.ok) {
      result.publishError = 'Import draft failed';
      return result;
    }

    result.listingId = importDraft.data.listing.id;

    // Publish to Shopify
    const publish = await apiRequest<{
      ok: boolean;
      shopifyProductId?: string;
      shopifyHandle?: string;
    }>({
      token,
      method: 'POST',
      pathname: '/api/cj-shopify-usa/listings/publish',
      body: {
        listingId: result.listingId,
      },
    });

    if (publish.data.ok) {
      result.published = true;
      result.shopifyProductId = publish.data.shopifyProductId;
      result.shopifyHandle = publish.data.shopifyHandle;
    } else {
      result.publishError = 'Publish request returned not ok';
    }

    await sleep(2000);
  } catch (error) {
    result.publishError = summarizeError(error);
  }

  return result;
}

async function main() {
  console.log('=== Ivan Reseller Curated Launch ===');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Collections: Travel, Workspace, Everyday\n`);

  const startedAt = new Date().toISOString();
  const token = await login();

  const output: JsonRecord = {
    startedAt,
    baseUrl: BASE_URL,
    loginUser: LOGIN_USER,
    launchConfig: LAUNCH_KEYWORDS,
  };

  // Get current state
  console.log('Fetching current state...');
  const overview = await apiRequest({
    token,
    pathname: '/api/cj-shopify-usa/overview',
  });
  output.overviewBefore = overview.data;
  const overviewData = overview.data as JsonRecord;
  const counts = overviewData?.counts as JsonRecord | undefined;
  console.log(`Current products: ${counts?.products ?? 0}`);
  console.log(`Current active listings: ${counts?.listingsActive ?? 0}\n`);

  // Discover products
  console.log('--- Discovery Phase ---');
  const discovered: DiscoveredProduct[] = [];
  
  for (const collection of ['travel', 'workspace', 'everyday'] as const) {
    console.log(`Discovering ${collection} products...`);
    const found = await discoverProducts(token, collection);
    discovered.push(...found);
    console.log(`  Found ${found.length} products`);
  }
  
  output.discovered = discovered;
  console.log(`\nTotal discovered: ${discovered.length}\n`);

  // Evaluate products
  console.log('--- Evaluation Phase ---');
  const evaluated: EvaluatedProduct[] = [];
  
  for (const product of discovered) {
    process.stdout.write(`Evaluating "${product.title.substring(0, 40)}..." `);
    const result = await evaluateProduct(token, product);
    evaluated.push(result);
    
    if (result.eligible) {
      console.log('✓ ELIGIBLE');
    } else {
      console.log(`✗ ${result.discardReason || 'Not eligible'}`);
    }
  }
  
  output.evaluated = evaluated;
  
  const eligibleCount = evaluated.filter(e => e.eligible).length;
  console.log(`\nEligible products: ${eligibleCount}/${evaluated.length}\n`);

  // Import and publish eligible products
  console.log('--- Publishing Phase ---');
  const published: PublishedProduct[] = [];
  
  // Limit to prevent overwhelming the system
  const toPublish = evaluated.filter(e => e.eligible).slice(0, 15);
  
  for (const product of toPublish) {
    process.stdout.write(`Publishing "${product.title.substring(0, 40)}..." `);
    const result = await importAndPublish(token, product);
    published.push(result);
    
    if (result.published) {
      console.log(`✓ Published (ID: ${result.shopifyProductId?.substring(0, 20)}...)`);
    } else {
      console.log(`✗ ${result.publishError || 'Failed'}`);
    }
  }
  
  output.published = published;
  
  const successCount = published.filter(p => p.published).length;
  console.log(`\nSuccessfully published: ${successCount}/${published.length}\n`);

  // Final state
  const overviewAfter = await apiRequest({
    token,
    pathname: '/api/cj-shopify-usa/overview',
  });
  output.overviewAfter = overviewAfter.data;

  // Summary
  output.summary = {
    discovered: discovered.length,
    evaluated: evaluated.length,
    eligible: eligibleCount,
    attempted: toPublish.length,
    published: successCount,
    byCollection: {
      travel: {
        discovered: discovered.filter(d => d.collection === 'travel').length,
        published: published.filter(p => p.published && p.collection === 'travel').length,
      },
      workspace: {
        discovered: discovered.filter(d => d.collection === 'workspace').length,
        published: published.filter(p => p.published && p.collection === 'workspace').length,
      },
      everyday: {
        discovered: discovered.filter(d => d.collection === 'everyday').length,
        published: published.filter(p => p.published && p.collection === 'everyday').length,
      },
    },
  };

  output.finishedAt = new Date().toISOString();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log('=== Launch Complete ===');
  console.log(`Results written to: ${OUTPUT_PATH}`);
  console.log('\nSummary:');
  console.log(`  Discovered: ${discovered.length}`);
  console.log(`  Evaluated: ${evaluated.length}`);
  console.log(`  Eligible: ${eligibleCount}`);
  console.log(`  Published: ${successCount}`);
  console.log('\nBy Collection:');
  const summary = output.summary as JsonRecord;
  const byCollection = summary?.byCollection as JsonRecord | undefined;
  const travel = byCollection?.travel as JsonRecord | undefined;
  const workspace = byCollection?.workspace as JsonRecord | undefined;
  const everyday = byCollection?.everyday as JsonRecord | undefined;
  console.log(`  Travel: ${travel?.published ?? 0} published`);
  console.log(`  Workspace: ${workspace?.published ?? 0} published`);
  console.log(`  Everyday: ${everyday?.published ?? 0} published`);
}

void main().catch(async (error) => {
  const failure = {
    failedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    message: summarizeError(error),
  };
  try {
    await writeFile(OUTPUT_PATH, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  } catch {
    // Best effort
  }
  console.error('[curated-launch] failed:', failure.message);
  process.exit(1);
});
