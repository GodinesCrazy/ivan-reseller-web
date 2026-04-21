#!/usr/bin/env tsx
/**
 * STANDALONE COLLECTION FIX SCRIPT
 * Assigns products to Shopify collections directly
 */

import { env } from '../src/config/env';

const SHOPIFY_SHOP = env.SHOPIFY_SHOP || 'ivanreseller-2.myshopify.com';
const SHOPIFY_API_VERSION = env.SHOPIFY_API_VERSION || '2024-01';
const SHOPIFY_ACCESS_TOKEN = env.SHOPIFY_ACCESS_TOKEN || '';

// Target collections
const TARGET_COLLECTIONS = [
  {
    title: 'Travel Comfort & Organizers',
    handle: 'travel-comfort-organizers',
    keywords: ['travel', 'luggage', 'organizer', 'packing', 'bag', 'storage', 'trip', 'vacation', 'pillow', 'scale', 'bottle', 'cosmetic']
  },
  {
    title: 'Desk / Workspace Upgrades',
    handle: 'desk-workspace-upgrades',
    keywords: ['desk', 'office', 'workspace', 'organizer', 'stationery', 'productivity', 'stand', 'holder', 'laptop', 'cable', 'mat', 'hub', 'docking']
  },
  {
    title: 'Smart Everyday Accessories',
    handle: 'smart-everyday-accessories',
    keywords: ['accessory', 'gadget', 'daily', 'everyday', 'smart', 'useful', 'practical', 'home', 'phone', 'bluetooth', 'tracker', 'finder', 'power', 'bank', 'cleaner', 'screen', 'mount', 'car']
  }
];

// Product to collection mapping based on titles
const PRODUCT_ASSIGNMENTS: Record<string, string> = {
  'Neck Pillow Travel Pillow': 'travel-comfort-organizers',
  '9Pcs Clothes Storage Bags Water-Resistant Travel Luggage Organizer Clothing Packing Cubes': 'travel-comfort-organizers',
  'Bottled travel cosmetics silicone bottle storage bottle': 'travel-comfort-organizers',
  'Luggage Scale Portable Electronic Scale': 'travel-comfort-organizers',
  'PD 20W Universal Travel Adapter Plug': 'travel-comfort-organizers',
  'U Shaped Pillow Travel Neck Pillow Memory Foam': 'travel-comfort-organizers',
  'Simple Vertical Aluminum Laptop Stand Adjustable': 'desk-workspace-upgrades',
  'USB C multi hub docking station': 'desk-workspace-upgrades',
  'Dust-proof Storage Cable Management Box Hub Organizer Box': 'desk-workspace-upgrades',
  'Anti-Fatigue Rubber Floor Mat Dome Hollow Anti-static': 'desk-workspace-upgrades',
  'bluetooth tracker key finder': 'smart-everyday-accessories',
  'Portable Mini Large  Ccity 10000mAh Power Bank': 'smart-everyday-accessories',
  '2 In 1 Phone Computer Screen Cleaner Kit For Screen Dust Removal Microfiber Cloth Set': 'smart-everyday-accessories',
  'Magnetic Phone Holder For Car, Dashboard Car Phone Holder Mount Magnetic Stainless Steel Car Phone Holder - Dashboard Mount, Water-resistant, Rotatable': 'smart-everyday-accessories',
  'Portable Phone Holder Stand Desk Tablet With Mirror Mobile Phone Bracket With Mirror Foldable Phone Holder': 'smart-everyday-accessories',
  'Wireless TWS Stereo Earbuds': 'smart-everyday-accessories',
  'Earbuds wireless bluetooth headset': 'smart-everyday-accessories'
};

async function shopifyRest(method: string, endpoint: string, body?: unknown): Promise<unknown> {
  const url = `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`REST API error ${response.status}: ${errorText}`);
  }

  return response.status === 204 ? null : await response.json();
}

async function getProducts(): Promise<Array<{ id: number; title: string; handle: string }>> {
  const result = await shopifyRest('GET', 'products.json?limit=100') as {
    products?: Array<{ id: number; title: string; handle: string }>;
  };
  return result.products || [];
}

async function getCollections(): Promise<Map<string, number>> {
  const result = await shopifyRest('GET', 'custom_collections.json?limit=100') as {
    custom_collections?: Array<{ id: number; title: string; handle: string }>;
  };

  const map = new Map<string, number>();
  for (const c of result.custom_collections || []) {
    map.set(c.handle, c.id);
  }
  return map;
}

async function getProductCollects(productId: number): Promise<Array<{ collection_id: number }>> {
  const result = await shopifyRest('GET', `collects.json?product_id=${productId}`) as {
    collects?: Array<{ collection_id: number }>;
  };
  return result.collects || [];
}

async function assignToCollection(productId: number, collectionId: number): Promise<void> {
  await shopifyRest('POST', 'collects.json', {
    collect: {
      product_id: productId,
      collection_id: collectionId,
    },
  });
}

async function main() {
  console.log('=== COLLECTION FIX SCRIPT ===\n');
  console.log(`Shop: ${SHOPIFY_SHOP}`);
  console.log(`API Version: ${SHOPIFY_API_VERSION}`);
  console.log(`Access Token: ${SHOPIFY_ACCESS_TOKEN ? '✅ Set' : '❌ MISSING'}\n`);

  if (!SHOPIFY_ACCESS_TOKEN) {
    console.error('ERROR: SHOPIFY_ACCESS_TOKEN is not set in environment');
    console.error('Please set it in .env.local file');
    process.exit(1);
  }

  try {
    // Get collections
    console.log('Fetching collections...');
    const collections = await getCollections();
    console.log(`Found ${collections.size} collections:`);
    for (const [handle, id] of collections) {
      console.log(`  - ${handle} (ID: ${id})`);
    }

    // Get products
    console.log('\nFetching products...');
    const products = await getProducts();
    console.log(`Found ${products.length} products`);

    // Assign products
    console.log('\n=== ASSIGNING PRODUCTS ===\n');
    let assigned = 0;
    let skipped = 0;
    let failed = 0;

    for (const product of products) {
      const collectionHandle = PRODUCT_ASSIGNMENTS[product.title];
      
      if (!collectionHandle) {
        console.log(`⚠️  No assignment for: ${product.title}`);
        continue;
      }

      const collectionId = collections.get(collectionHandle);
      if (!collectionId) {
        console.log(`❌ Collection not found: ${collectionHandle}`);
        failed++;
        continue;
      }

      // Check if already assigned
      try {
        const existingCollects = await getProductCollects(product.id);
        const alreadyInCollection = existingCollects.some(c => c.collection_id === collectionId);

        if (alreadyInCollection) {
          console.log(`✅ Already assigned: ${product.title} → ${collectionHandle}`);
          skipped++;
        } else {
          await assignToCollection(product.id, collectionId);
          console.log(`✅ Assigned: ${product.title} → ${collectionHandle}`);
          assigned++;
        }
      } catch (error) {
        console.log(`❌ Failed to assign ${product.title}: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 250));
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Assigned: ${assigned}`);
    console.log(`Skipped (already assigned): ${skipped}`);
    console.log(`Failed: ${failed}`);

  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
