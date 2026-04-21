/**
 * Launch Closer QA Script
 * Verifica productos publicados, corrige pricing, crea colecciones
 */

import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.CJ_SHOPIFY_USA_VALIDATION_BASE_URL || 
                 'https://ivan-reseller-backend-production.up.railway.app';
const LOGIN_USER = process.env.AUTOPILOT_LOGIN_USER || 'admin';
const LOGIN_PASSWORD = process.env.AUTOPILOT_LOGIN_PASSWORD || 'admin123';
const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL || 'ivanreseller-2.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';

const OUTPUT_PATH = path.resolve(process.cwd(), 'launch-closer-results.json');

interface ProductCheck {
  cjProductId: string;
  title: string;
  listingId: number;
  shopifyProductId?: string;
  shopifyHandle?: string;
  pricing: {
    cost: number;
    shipping: number;
    sellPrice: number;
  };
  violations: string[];
  needsCorrection: boolean;
}

const COLLECTIONS = [
  { key: 'travel', title: 'Travel Comfort & Organizers', handle: 'travel-comfort-organizers' },
  { key: 'workspace', title: 'Desk / Workspace Upgrades', handle: 'desk-workspace-upgrades' },
  { key: 'everyday', title: 'Smart Everyday Accessories', handle: 'smart-everyday-accessories' },
];

// Productos del curated launch con sus colecciones
const LAUNCH_PRODUCTS: Array<{
  cjProductId: string;
  title: string;
  collection: 'travel' | 'workspace' | 'everyday';
  listingId: number;
  cost: number;
  shipping: number;
  sellPrice: number;
}> = [
  // Travel (5)
  { cjProductId: '2602050314241608000', title: 'PD 20W Universal Travel Adapter Plug', collection: 'travel', listingId: 4, cost: 3.34, shipping: 5.85, sellPrice: 11.92 },
  { cjProductId: '1990664736726372353', title: '9Pcs Clothes Storage Bags', collection: 'travel', listingId: 5, cost: 14.09, shipping: 0, sellPrice: 18.08 },
  { cjProductId: '1645725464138358784', title: 'U Shaped Pillow Travel Neck Pillow', collection: 'travel', listingId: 6, cost: 3.94, shipping: 5.45, sellPrice: 11.95 },
  { cjProductId: 'A863730C-A987-4543-B348-3AEAA3A7043E', title: 'Bottled travel cosmetics silicone bottle', collection: 'travel', listingId: 7, cost: 2.39, shipping: 5.99, sellPrice: 10.83 },
  { cjProductId: '1429375206241210368', title: 'Luggage Scale Portable', collection: 'travel', listingId: 8, cost: 3.68, shipping: 4.24, sellPrice: 10.23 },
  // Workspace (4 - 1 falló)
  { cjProductId: 'A8E4C408-6970-42DE-86C7-C5629D6AD36C', title: 'USB C multi hub docking station', collection: 'workspace', listingId: 9, cost: 7.42, shipping: 4.72, sellPrice: 15.54 },
  { cjProductId: '1631221139164901376', title: 'Simple Vertical Aluminum Laptop Stand', collection: 'workspace', listingId: 10, cost: 5.79, shipping: 5.01, sellPrice: 13.86 },
  { cjProductId: '1414780039492407296', title: 'Dust-proof Storage Cable Management Box', collection: 'workspace', listingId: 11, cost: 4.45, shipping: 4.11, sellPrice: 11.08 },
  { cjProductId: '2509160959231628300', title: 'Anti-Fatigue Rubber Floor Mat', collection: 'workspace', listingId: 12, cost: 8.50, shipping: 6.17, sellPrice: 18.71 },
  // Everyday (5)
  { cjProductId: '1809888855471312896', title: 'Magnetic Phone Holder For Car', collection: 'everyday', listingId: 13, cost: 6.67, shipping: 5.81, sellPrice: 15.99 },
  { cjProductId: '1426120141564940288', title: 'Portable Phone Holder Stand Desk', collection: 'everyday', listingId: 14, cost: 1.32, shipping: 5.84, sellPrice: 9.37 },
  { cjProductId: 'A6235D6D-EC07-4570-8057-E5A8773EF877', title: 'bluetooth tracker key finder', collection: 'everyday', listingId: 15, cost: 10.91, shipping: 4.67, sellPrice: 19.95 },
  { cjProductId: 'CD9753E5-1CF4-4C44-AEBD-098F42A87EB7', title: 'Portable Mini 10000mAh Power Bank', collection: 'everyday', listingId: 16, cost: 3.20, shipping: 6.27, sellPrice: 12.27 },
  { cjProductId: '28191F94-A25B-4A64-A57B-E4674E560FAD', title: '2 In 1 Phone Computer Screen Cleaner Kit', collection: 'everyday', listingId: 17, cost: 1.13, shipping: 4.85, sellPrice: 7.89 },
];

const PRICING_RULES = {
  minSellPrice: 9.99,
  maxSellPrice: 150.00,
  minProfit: 3.00,
  minMargin: 0.20,
  maxShipping: 8.00,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(): Promise<string> {
  const response = await fetch(new URL('/api/auth/login', BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: LOGIN_USER, password: LOGIN_PASSWORD }),
  });

  const setCookie = response.headers.get('set-cookie') || '';
  const token = setCookie.match(/token=([^;]+)/)?.[1] || '';
  if (!response.ok || !token) {
    throw new Error(`Login failed: ${response.status}`);
  }
  return token;
}

async function apiRequest<T = unknown>(token: string, pathname: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method: options?.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

function checkPricingViolations(product: typeof LAUNCH_PRODUCTS[0]): string[] {
  const violations: string[] = [];
  const totalCost = product.cost + product.shipping;
  const profit = product.sellPrice - totalCost - (product.sellPrice * 0.054 + 0.30);
  const margin = profit / product.sellPrice;

  if (product.sellPrice < PRICING_RULES.minSellPrice) {
    violations.push(`Price $${product.sellPrice.toFixed(2)} < $${PRICING_RULES.minSellPrice} minimum`);
  }
  if (product.sellPrice > PRICING_RULES.maxSellPrice) {
    violations.push(`Price exceeds $${PRICING_RULES.maxSellPrice} maximum`);
  }
  if (profit < PRICING_RULES.minProfit) {
    violations.push(`Profit $${profit.toFixed(2)} < $${PRICING_RULES.minProfit} minimum`);
  }
  if (margin < PRICING_RULES.minMargin) {
    violations.push(`Margin ${(margin * 100).toFixed(1)}% < ${(PRICING_RULES.minMargin * 100).toFixed(0)}% minimum`);
  }
  if (product.shipping > PRICING_RULES.maxShipping) {
    violations.push(`Shipping $${product.shipping.toFixed(2)} > $${PRICING_RULES.maxShipping} maximum`);
  }

  return violations;
}

function calculateCorrectPrice(cost: number, shipping: number): number {
  const totalCost = cost + shipping;
  const incidentBuffer = totalCost * 0.03;
  const targetMargin = 0.20;
  const feePct = 0.054;
  const feeFixed = 0.30;
  
  const price = (totalCost + incidentBuffer + feeFixed) / (1 - targetMargin - feePct);
  const rounded = Math.floor(price) + 0.99;
  return Math.max(rounded, PRICING_RULES.minSellPrice);
}

async function verifyProducts(token: string): Promise<{
  verified: ProductCheck[];
  needsCorrection: ProductCheck[];
}> {
  const results: ProductCheck[] = [];

  // Get current overview
  const overview = await apiRequest<{ ok: boolean; counts?: { products?: number; listingsActive?: number } }>(token, '/api/cj-shopify-usa/overview');
  console.log(`\nCurrent state: ${overview.counts?.products || 0} products, ${overview.counts?.listingsActive || 0} active listings`);

  // Check each product
  for (const product of LAUNCH_PRODUCTS) {
    const violations = checkPricingViolations(product);
    const needsCorrection = violations.length > 0;

    results.push({
      cjProductId: product.cjProductId,
      title: product.title,
      listingId: product.listingId,
      pricing: {
        cost: product.cost,
        shipping: product.shipping,
        sellPrice: product.sellPrice,
      },
      violations,
      needsCorrection,
    });

    const status = needsCorrection ? '⚠️ VIOLATIONS' : '✅ OK';
    console.log(`  ${status}: ${product.title.substring(0, 45)}${violations.length > 0 ? ` - ${violations.join(', ')}` : ''}`);
  }

  const needsCorrection = results.filter(r => r.needsCorrection);
  console.log(`\n${results.length} products checked, ${needsCorrection.length} need correction`);

  return { verified: results, needsCorrection };
}

async function correctPricing(token: string, product: ProductCheck): Promise<boolean> {
  const newPrice = calculateCorrectPrice(product.pricing.cost, product.pricing.shipping);
  console.log(`  Correcting ${product.title.substring(0, 40)}...`);
  console.log(`    Old: $${product.pricing.sellPrice.toFixed(2)} → New: $${newPrice.toFixed(2)}`);

  try {
    // Try to update via API if endpoint exists
    const result = await apiRequest<{ ok: boolean; error?: string }>(
      token,
      `/api/cj-shopify-usa/listings/${product.listingId}/price`,
      {
        method: 'POST',
        body: { sellPriceUsd: newPrice },
      }
    );

    if ((result as { ok?: boolean }).ok) {
      console.log(`    ✅ Price updated successfully`);
      return true;
    } else {
      console.log(`    ⚠️ API endpoint not available, manual correction needed`);
      return false;
    }
  } catch {
    console.log(`    ⚠️ Could not auto-correct, manual fix required`);
    return false;
  }
}

async function createShopifyCollection(token: string, collection: typeof COLLECTIONS[0]): Promise<boolean> {
  console.log(`  Creating collection: ${collection.title}`);
  
  try {
    const result = await apiRequest<{ ok: boolean; collectionId?: string; error?: string }>(
      token,
      '/api/cj-shopify-usa/collections/create',
      {
        method: 'POST',
        body: {
          title: collection.title,
          handle: collection.handle,
          collectionType: 'manual',
        },
      }
    );

    if ((result as { ok?: boolean }).ok) {
      console.log(`    ✅ Collection created: ${(result as { collectionId?: string }).collectionId}`);
      return true;
    } else {
      console.log(`    ⚠️ Collection API not available or failed: ${(result as { error?: string }).error || 'Unknown'}`);
      return false;
    }
  } catch (error) {
    console.log(`    ⚠️ Collection creation failed: ${error}`);
    return false;
  }
}

async function assignToCollection(token: string, product: typeof LAUNCH_PRODUCTS[0], collectionHandle: string): Promise<boolean> {
  try {
    const result = await apiRequest<{ ok: boolean }>(
      token,
      '/api/cj-shopify-usa/collections/assign',
      {
        method: 'POST',
        body: {
          listingId: product.listingId,
          collectionHandle,
        },
      }
    );
    return (result as { ok?: boolean }).ok || false;
  } catch {
    return false;
  }
}

async function generateStorefrontUrl(): Promise<string> {
  return `https://${SHOPIFY_STORE}`;
}

async function main() {
  console.log('=== LAUNCH CLOSER QA ===');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Shopify Store: ${SHOPIFY_STORE}\n`);

  const startedAt = new Date().toISOString();
  const token = await login();

  const output: Record<string, unknown> = {
    startedAt,
    baseUrl: BASE_URL,
    shopifyStore: SHOPIFY_STORE,
  };

  // Phase 1: Verify all products
  console.log('--- PHASE 1: Verify Published Products ---');
  const { verified, needsCorrection } = await verifyProducts(token);
  output.verifiedProducts = verified;
  output.violationsFound = needsCorrection.length;

  // Phase 2: Correct violations
  console.log('\n--- PHASE 2: Correct Pricing Violations ---');
  const corrected: number[] = [];
  const failed: number[] = [];

  for (const product of needsCorrection) {
    const success = await correctPricing(token, product);
    if (success) {
      corrected.push(product.listingId);
    } else {
      failed.push(product.listingId);
    }
    await sleep(500);
  }
  output.correctedListings = corrected;
  output.failedCorrections = failed;

  // Phase 3: Create collections
  console.log('\n--- PHASE 3: Create Collections ---');
  const collectionsCreated: string[] = [];
  const collectionsFailed: string[] = [];

  for (const collection of COLLECTIONS) {
    const success = await createShopifyCollection(token, collection);
    if (success) {
      collectionsCreated.push(collection.handle);
    } else {
      collectionsFailed.push(collection.handle);
    }
    await sleep(500);
  }
  output.collectionsCreated = collectionsCreated;
  output.collectionsFailed = collectionsFailed;

  // Phase 4: Assign products to collections
  console.log('\n--- PHASE 4: Assign Products to Collections ---');
  const assignments: Array<{ product: string; collection: string; success: boolean }> = [];

  for (const product of LAUNCH_PRODUCTS) {
    const collection = COLLECTIONS.find(c => c.key === product.collection);
    if (collection) {
      const success = await assignToCollection(token, product, collection.handle);
      assignments.push({ product: product.title, collection: collection.title, success });
      console.log(`  ${success ? '✅' : '⚠️'} ${product.title.substring(0, 40)} → ${collection.title}`);
    }
  }
  output.collectionAssignments = assignments;

  // Phase 5: Final verification
  console.log('\n--- PHASE 5: Final Verification ---');
  const finalOverview = await apiRequest<{ ok: boolean; counts?: { products?: number; listingsActive?: number } }>(token, '/api/cj-shopify-usa/overview');
  output.finalOverview = finalOverview;

  const storefrontUrl = await generateStorefrontUrl();
  output.storefrontUrl = storefrontUrl;

  // Generate summary
  const summary = {
    totalProducts: LAUNCH_PRODUCTS.length,
    verifiedProducts: verified.length,
    violationsFound: needsCorrection.length,
    corrected: corrected.length,
    correctionsFailed: failed.length,
    collectionsAttempted: COLLECTIONS.length,
    collectionsCreated: collectionsCreated.length,
    collectionsFailed: collectionsFailed.length,
    assignmentsAttempted: assignments.length,
    assignmentsSuccessful: assignments.filter(a => a.success).length,
    storefrontUrl,
    finalProductCount: finalOverview.counts?.products || 0,
    finalActiveListings: finalOverview.counts?.listingsActive || 0,
  };
  output.summary = summary;

  // Manual checklist for visual QA
  output.manualChecklist = {
    storefrontUrl,
    productPaths: LAUNCH_PRODUCTS.map(p => `/products/${p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}`),
    collectionsToVerify: COLLECTIONS.map(c => `/collections/${c.handle}`),
    tasks: [
      'Verify product cards show correct prices',
      'Verify PDPs load images and descriptions',
      'Verify add-to-cart button is clickable',
      'Verify collections show correct products',
      'Verify homepage does not show weak products',
    ],
  };

  output.finishedAt = new Date().toISOString();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  // Final report
  console.log('\n=== LAUNCH CLOSER COMPLETE ===');
  console.log(`Results: ${OUTPUT_PATH}`);
  console.log(`\nStorefront URL: ${storefrontUrl}`);
  console.log(`\nSUMMARY:`);
  console.log(`  Products verified: ${summary.verifiedProducts}`);
  console.log(`  Violations found: ${summary.violationsFound}`);
  console.log(`  Corrections applied: ${summary.corrected}`);
  console.log(`  Collections created: ${summary.collectionsCreated}/${summary.collectionsAttempted}`);
  console.log(`  Products assigned: ${summary.assignmentsSuccessful}/${summary.assignmentsAttempted}`);
  console.log(`\nFinal state: ${summary.finalProductCount} products, ${summary.finalActiveListings} active`);
  console.log(`\n⚠️ MANUAL QA REQUIRED:`);
  console.log(`  1. Visit ${storefrontUrl}/collections/all`);
  console.log(`  2. Check each collection page`);
  console.log(`  3. Verify PDPs render correctly`);
  console.log(`  4. Test add-to-cart functionality`);

  // Exit code based on critical issues
  const criticalIssues = summary.violationsFound - summary.corrected;
  if (criticalIssues > 0) {
    console.log(`\n❌ ${criticalIssues} pricing violations could not be auto-corrected`);
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error('[launch-closer] failed:', error);
  process.exit(1);
});
