/**
 * Auto-assigns PawVault products to the right collections
 * based on product type, tags and title keywords.
 */

const SHOP    = 'ivanreseller-2.myshopify.com';
const API_VER = '2026-04';

async function getToken() {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  });
  const { access_token } = await res.json();
  return access_token;
}

const BASE_URL = `https://${SHOP}/admin/api/${API_VER}`;
let TOKEN;

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Collection assignment rules ───────────────────────────────────────────────
// Returns array of collection handles this product belongs to
function assignCollections(product) {
  const title = product.title.toLowerCase();
  const type  = (product.product_type || '').toLowerCase();
  const tags  = (product.tags || '').toLowerCase();
  const collections = new Set();

  // Skip non-pet CJ products
  if (type === 'cj dropshipping' && !tags.includes('dog') && !tags.includes('cat') && !tags.includes('pet')) {
    return [];
  }

  // ── DOGS ──
  if (
    type.includes('dog') ||
    tags.includes('dogs') ||
    title.includes('dog') ||
    title.includes('leash') ||
    title.includes('harness') ||
    title.includes('bark') ||
    title.includes('traction')
  ) {
    collections.add('dogs');
  }

  // ── CATS ──
  if (
    type.includes('cat') ||
    tags.includes('cats') ||
    title.includes('cat') ||
    title.includes('kitten') ||
    title.includes('feline')
  ) {
    collections.add('cats');
  }

  // If tagged for both, add to both
  if (tags.includes('dogs') && tags.includes('cats')) {
    collections.add('dogs');
    collections.add('cats');
  }

  // ── GROOMING ──
  if (
    type.includes('grooming') ||
    tags.includes('grooming') ||
    title.includes('groom') ||
    title.includes('brush') ||
    title.includes('comb') ||
    title.includes('scissors') ||
    title.includes('shear') ||
    title.includes('lint') ||
    title.includes('hair remover') ||
    title.includes('bath')
  ) {
    collections.add('grooming');
  }

  // ── TOYS ──
  if (
    type.includes('toy') ||
    tags.includes('toys') ||
    tags.includes('enrichment') ||
    title.includes('toy') ||
    title.includes('puzzle') ||
    title.includes('chew') ||
    title.includes('interactive')
  ) {
    collections.add('toys');
  }

  // ── FEEDING ──
  if (
    type.includes('feed') ||
    tags.includes('feeding') ||
    tags.includes('bowl') ||
    title.includes('bowl') ||
    title.includes('feed') ||
    title.includes('tableware') ||
    title.includes('snack') ||
    title.includes('treat')
  ) {
    collections.add('feeding');
  }

  // ── BEDS ──
  if (
    tags.includes('beds') ||
    tags.includes('comfort') ||
    title.includes('bed') ||
    title.includes('blanket') ||
    title.includes('cushion') ||
    title.includes('mat') ||
    title.includes('sweater') ||
    title.includes('coat') ||
    title.includes('warm')
  ) {
    collections.add('beds');
  }

  // All pet products go to new-arrivals (for homepage "Just Added" section)
  if (collections.size > 0) {
    collections.add('new-arrivals');
  }

  return [...collections];
}

async function run() {
  console.log('\n🐾 PawVault — Auto Collection Assignment');
  console.log('=========================================');

  TOKEN = await getToken();
  console.log('✓ Token obtained\n');

  // Get all products
  const { products } = await api('GET', '/products.json?limit=250&fields=id,title,product_type,tags');
  console.log(`Found ${products.length} total products\n`);

  // Get all collections with their IDs
  const { custom_collections } = await api('GET', '/custom_collections.json?limit=250&fields=id,handle,title');
  const colMap = {};
  custom_collections.forEach(c => { colMap[c.handle] = c.id; });
  console.log('Collections available:', Object.keys(colMap).join(', '));

  // Get existing collects to avoid duplicates
  const { collects: existingCollects } = await api('GET', '/collects.json?limit=250');
  const existing = new Set(existingCollects.map(c => `${c.product_id}-${c.collection_id}`));

  console.log('\n📦 Assigning products to collections...\n');

  let assigned = 0;
  let skipped  = 0;
  let ignored  = 0;

  for (const product of products) {
    const handles = assignCollections(product);

    if (handles.length === 0) {
      ignored++;
      continue;
    }

    console.log(`✦ ${product.title.slice(0, 52)}`);
    console.log(`  → ${handles.join(', ')}`);

    for (const handle of handles) {
      const colId = colMap[handle];
      if (!colId) { console.log(`  ⚠ Collection "${handle}" not found, skipping`); continue; }

      const key = `${product.id}-${colId}`;
      if (existing.has(key)) {
        skipped++;
        continue;
      }

      const result = await api('POST', '/collects.json', {
        collect: { product_id: product.id, collection_id: colId },
      });

      if (result.collect) {
        assigned++;
      } else {
        console.log(`  ❌ Failed:`, JSON.stringify(result).slice(0, 80));
      }
    }
  }

  console.log('\n=========================================');
  console.log(`✅ Done!`);
  console.log(`   New assignments: ${assigned}`);
  console.log(`   Already assigned: ${skipped}`);
  console.log(`   Non-pet products skipped: ${ignored}`);
  console.log('\nOpen https://ivanreseller-2.myshopify.com/collections/dogs to verify\n');
}

run().catch(err => { console.error('❌ Fatal:', err.message); process.exit(1); });
