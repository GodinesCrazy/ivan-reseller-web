/**
 * setup-pawvault-store.ts
 * Complete PawVault store setup:
 *  1. Create 6 pet collections (Dogs, Cats, Grooming, Toys, Feeding, New Arrivals)
 *  2. Clean product titles
 *  3. Add product tags + productType
 *  4. Add products to correct collections
 *
 * Run: npx ts-node scripts/setup-pawvault-store.ts
 */

import 'dotenv/config';
import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';
import { prisma } from '../src/config/database';

const USER_ID = 1;

// ── COLLECTION DEFINITIONS ─────────────────────────────────────────────────

const COLLECTIONS = [
  {
    handle: 'dogs',
    title: 'For Dogs',
    descriptionHtml: '<p>Leashes, harnesses, toys, clothing, travel gear and daily essentials — everything your dog needs to thrive.</p>',
    image: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=1200&q=90',
  },
  {
    handle: 'cats',
    title: 'For Cats',
    descriptionHtml: '<p>Beds, enrichment toys, grooming and cozy home upgrades for cats of every personality.</p>',
    image: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1200&q=90',
  },
  {
    handle: 'grooming',
    title: 'Grooming',
    descriptionHtml: '<p>Professional-grade brushes, scissors, bath tools and grooming accessories for dogs and cats.</p>',
    image: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=90',
  },
  {
    handle: 'toys',
    title: 'Toys & Enrichment',
    descriptionHtml: '<p>Interactive toys, chew toys and enrichment games that keep pets mentally stimulated and happy.</p>',
    image: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1200&q=90',
  },
  {
    handle: 'feeding',
    title: 'Feeding & Bowls',
    descriptionHtml: '<p>Bowls, stands, treat bags and feeding accessories designed for daily pet-parent routines.</p>',
    image: 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=1200&q=90',
  },
  {
    handle: 'new-arrivals',
    title: 'New Arrivals',
    descriptionHtml: '<p>The latest pet essentials added to PawVault — fresh picks for dogs and cats every week.</p>',
    image: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=1200&q=90',
  },
] as const;

// ── PRODUCT IMPROVEMENTS ───────────────────────────────────────────────────
// shopifyProductId → { cleanTitle, tags, collections[], type }

const PRODUCT_MAP: Record<string, {
  title: string;
  tags: string[];
  collections: string[];
  productType: string;
}> = {
  '9150911840468': {
    title: 'Bamboo Cat Bowl Stand & Tableware Set',
    tags: ['cats', 'feeding', 'bowls', 'bamboo', 'eco-friendly'],
    collections: ['cats', 'feeding', 'new-arrivals'],
    productType: 'Cat Feeding',
  },
  '9150886609108': {
    title: 'Retractable Dog Leash — Auto Traction Rope',
    tags: ['dogs', 'leash', 'traction', 'walking', 'outdoor'],
    collections: ['dogs', 'new-arrivals'],
    productType: 'Dog Accessories',
  },
  '9150082285780': {
    title: 'Professional Pet Grooming Scissors Set',
    tags: ['grooming', 'scissors', 'dogs', 'cats', 'professional'],
    collections: ['grooming'],
    productType: 'Pet Grooming',
  },
  '9150861574356': {
    title: 'Bite-Resistant Pet Chew Toy — Dental Hygiene',
    tags: ['toys', 'dogs', 'cats', 'chew', 'dental', 'enrichment'],
    collections: ['toys', 'dogs', 'cats'],
    productType: 'Pet Toys',
  },
  '9150295277780': {
    title: 'Cute Cat-Shaped Mini Pet Humidifier',
    tags: ['cats', 'humidifier', 'home', 'accessories', 'air-quality'],
    collections: ['cats', 'new-arrivals'],
    productType: 'Cat Accessories',
  },
  '9150295212244': {
    title: 'Adjustable Pet Outdoor Harness & Strap',
    tags: ['dogs', 'harness', 'strap', 'outdoor', 'walking', 'adjustable'],
    collections: ['dogs'],
    productType: 'Dog Accessories',
  },
  '9150294393044': {
    title: 'Interactive Hidden Food Puzzle Toy',
    tags: ['toys', 'dogs', 'cats', 'interactive', 'puzzle', 'enrichment', 'slow-feeder'],
    collections: ['toys', 'dogs', 'cats'],
    productType: 'Pet Toys',
  },
  '9150293999828': {
    title: 'Cozy Warm Pet Sweater Coat',
    tags: ['dogs', 'clothing', 'sweater', 'winter', 'warm', 'fashion'],
    collections: ['dogs', 'new-arrivals'],
    productType: 'Dog Clothing',
  },
  '9150293835988': {
    title: 'Universal Dog Car Seat Carrier with Nonslip Mat',
    tags: ['dogs', 'travel', 'car-seat', 'carrier', 'safety'],
    collections: ['dogs'],
    productType: 'Dog Travel',
  },
  '9150293770452': {
    title: 'Reusable Pet Hair Remover — Lint Roller',
    tags: ['grooming', 'dogs', 'cats', 'hair-remover', 'lint', 'cleaning', 'reusable'],
    collections: ['grooming'],
    productType: 'Pet Grooming',
  },
  '9150293737684': {
    title: 'Handheld Pet Bathing & Massage Brush',
    tags: ['grooming', 'dogs', 'cats', 'bath', 'massage', 'brush'],
    collections: ['grooming'],
    productType: 'Pet Grooming',
  },
  '9150293442772': {
    title: 'Pet Training Treat & Snack Bag',
    tags: ['dogs', 'treats', 'training', 'snacks', 'reward'],
    collections: ['dogs', 'feeding'],
    productType: 'Dog Training',
  },
  '9150293311700': {
    title: 'Stylish Pet Sunglasses for Dogs & Cats',
    tags: ['dogs', 'cats', 'glasses', 'sunglasses', 'accessories', 'fashion', 'fun'],
    collections: ['dogs', 'cats'],
    productType: 'Pet Accessories',
  },
  '9150292885716': {
    title: 'Anti-Breakaway Pet Traction Leash',
    tags: ['dogs', 'leash', 'traction', 'safety', 'anti-breakaway', 'walking'],
    collections: ['dogs'],
    productType: 'Dog Accessories',
  },
  '9150222631124': {
    title: 'Ultrasonic Bark Control Training Device',
    tags: ['dogs', 'training', 'bark-control', 'ultrasonic', 'behavior'],
    collections: ['dogs'],
    productType: 'Dog Training',
  },
};

// ── GQL HELPERS ────────────────────────────────────────────────────────────

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  return cjShopifyUsaAdminService.graphql<T>({ userId: USER_ID, query, variables });
}

async function createCollection(col: typeof COLLECTIONS[number]): Promise<string | null> {
  const res = await gql<{
    collectionCreate: {
      collection?: { id: string; handle: string };
      userErrors: { message: string }[];
    };
  }>(
    `mutation CreateCollection($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id handle }
        userErrors { message }
      }
    }`,
    {
      input: {
        title: col.title,
        handle: col.handle,
        descriptionHtml: col.descriptionHtml,
        sortOrder: 'BEST_SELLING',
        image: { src: col.image, altText: col.title },
      },
    },
  );

  const errors = res.collectionCreate.userErrors;
  if (errors.length > 0) {
    // Might already exist — fetch by handle
    if (errors[0].message.toLowerCase().includes('handle') || errors[0].message.toLowerCase().includes('taken')) {
      return null; // will be fetched separately
    }
    throw new Error(errors.map(e => e.message).join('; '));
  }
  return res.collectionCreate.collection?.id ?? null;
}

async function getCollectionByHandle(handle: string): Promise<string | null> {
  const res = await gql<{
    collectionByHandle?: { id: string } | null;
  }>(
    `query GetCollection($handle: String!) {
      collectionByHandle(handle: $handle) { id }
    }`,
    { handle },
  );
  return res.collectionByHandle?.id ?? null;
}

async function addProductsToCollection(collectionId: string, productIds: string[]): Promise<void> {
  if (!productIds.length) return;
  await gql<unknown>(
    `mutation AddProducts($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        userErrors { message }
      }
    }`,
    { id: collectionId, productIds },
  );
}

async function updateProduct(shopifyId: string, title: string, tags: string[], productType: string): Promise<void> {
  await gql<unknown>(
    `mutation UpdateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        userErrors { message }
      }
    }`,
    {
      input: {
        id: `gid://shopify/Product/${shopifyId}`,
        title,
        tags,
        productType,
      },
    },
  );
}

// ── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🐾 PawVault Store Setup\n');

  // Step 1: Create collections
  console.log('1️⃣  Creating collections...');
  const collectionIds: Record<string, string> = {};

  for (const col of COLLECTIONS) {
    process.stdout.write(`   → ${col.title} (${col.handle})... `);
    let id = await createCollection(col);
    if (!id) {
      // Already exists, get the ID
      id = await getCollectionByHandle(col.handle);
      console.log(id ? `already exists (${id.slice(-8)})` : '⚠️  not found');
    } else {
      console.log(`created ✓`);
    }
    if (id) collectionIds[col.handle] = id;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n   Collections ready: ${Object.keys(collectionIds).join(', ')}\n`);

  // Step 2: Update products + add to collections
  console.log('2️⃣  Updating products and assigning to collections...');

  // Build collection → [productIds] map
  const collectionProducts: Record<string, string[]> = {};
  for (const handle of Object.keys(collectionIds)) {
    collectionProducts[handle] = [];
  }

  for (const [shopifyId, info] of Object.entries(PRODUCT_MAP)) {
    const gid = `gid://shopify/Product/${shopifyId}`;
    process.stdout.write(`   → ${info.title.slice(0, 50)}... `);

    // Update title, tags, productType
    await updateProduct(shopifyId, info.title, info.tags, info.productType);

    // Queue for collection assignment
    for (const handle of info.collections) {
      if (collectionProducts[handle]) {
        collectionProducts[handle].push(gid);
      }
    }

    // Also add to new-arrivals if not already there
    if (!info.collections.includes('new-arrivals') && collectionProducts['new-arrivals']) {
      // Only add newest products to new-arrivals (first 8)
    }

    console.log('✓');
    await new Promise(r => setTimeout(r, 300));
  }

  // Step 3: Add products to collections
  console.log('\n3️⃣  Assigning products to collections...');
  for (const [handle, productIds] of Object.entries(collectionProducts)) {
    if (!collectionIds[handle] || !productIds.length) continue;
    process.stdout.write(`   → ${handle} (${productIds.length} products)... `);
    await addProductsToCollection(collectionIds[handle], productIds);
    console.log('✓');
    await new Promise(r => setTimeout(r, 500));
  }

  // Step 4: Add ALL products to new-arrivals
  console.log('\n4️⃣  Adding all products to New Arrivals...');
  if (collectionIds['new-arrivals']) {
    const allIds = Object.keys(PRODUCT_MAP).map(id => `gid://shopify/Product/${id}`);
    await addProductsToCollection(collectionIds['new-arrivals'], allIds);
    console.log(`   ✓ ${allIds.length} products added to New Arrivals`);
  }

  console.log('\n✅ Store setup complete!\n');
  console.log('Collection handles created:');
  for (const [handle, id] of Object.entries(collectionIds)) {
    console.log(`  /collections/${handle} → ${id.slice(-12)}`);
  }
}

main()
  .catch(e => { console.error('\n❌ Fatal:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
