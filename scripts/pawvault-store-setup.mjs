/**
 * PawVault Store Setup — runs against Shopify Admin API
 * Usage: SHOPIFY_ADMIN_TOKEN=shpat_xxxx node scripts/pawvault-store-setup.mjs
 *
 * Get token: Shopify Admin → Settings → Apps → Develop apps
 *   → Create app "PawVault Setup" → Configure API scopes:
 *     write_products, write_content, write_themes, read_shop
 *   → Install → copy Admin API access token
 */

const SHOP    = 'ivanreseller-2.myshopify.com';
const TOKEN   = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VER = '2026-04';

if (!TOKEN) {
  console.error('\n❌ Missing SHOPIFY_ADMIN_TOKEN environment variable.');
  console.error('   Run: SHOPIFY_ADMIN_TOKEN=shpat_xxx node scripts/pawvault-store-setup.mjs\n');
  process.exit(1);
}

const BASE = `https://${SHOP}/admin/api/${API_VER}`;
const HEADERS = {
  'X-Shopify-Access-Token': TOKEN,
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// ── 1. Rename store ──────────────────────────────────────────────────────────
async function renameStore() {
  console.log('\n📦 Updating store name to "PawVault"...');
  const { shop } = await api('GET', '/shop.json');
  if (shop.name === 'PawVault') { console.log('   ✓ Already named PawVault'); return; }
  // Store name is changed via Shopify admin REST (shop object is read-only in REST, use GraphQL)
  const gqlRes = await fetch(`https://${SHOP}/admin/api/${API_VER}/graphql.json`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      query: `mutation { shopUpdate(input: { name: "PawVault" }) { shop { name } userErrors { field message } } }`,
    }),
  });
  const gql = await gqlRes.json();
  const errors = gql?.data?.shopUpdate?.userErrors;
  if (errors?.length) throw new Error(`shopUpdate errors: ${JSON.stringify(errors)}`);
  console.log('   ✓ Store name set to PawVault');
}

// ── 2. Create collections ────────────────────────────────────────────────────
const COLLECTIONS = [
  { title: 'Dogs',        handle: 'dogs',        body_html: '<p>Premium accessories, leashes, harnesses and daily essentials for dogs.</p>',      sort_order: 'best-selling' },
  { title: 'Cats',        handle: 'cats',        body_html: '<p>Beds, enrichment and comfort picks for cats of every personality.</p>',           sort_order: 'best-selling' },
  { title: 'Grooming',    handle: 'grooming',    body_html: '<p>Brushes, trimmers and bath-time essentials for dogs and cats.</p>',              sort_order: 'best-selling' },
  { title: 'Beds',        handle: 'beds',        body_html: '<p>Comfortable beds and resting spots for pets of all sizes.</p>',                  sort_order: 'best-selling' },
  { title: 'Feeding',     handle: 'feeding',     body_html: '<p>Bowls, feeders and mealtime accessories for daily pet care.</p>',               sort_order: 'best-selling' },
  { title: 'Toys',        handle: 'toys',        body_html: '<p>Interactive and enrichment toys to keep dogs and cats happy.</p>',              sort_order: 'best-selling' },
  { title: 'New Arrivals',handle: 'new-arrivals',body_html: '<p>The latest additions to the PawVault catalog.</p>',                            sort_order: 'created-desc' },
  { title: 'Bestsellers', handle: 'bestsellers', body_html: '<p>The most-loved products across the PawVault catalog.</p>',                     sort_order: 'best-selling' },
];

async function createCollections() {
  console.log('\n📁 Creating collections...');
  const { custom_collections: existing } = await api('GET', '/custom_collections.json?limit=250');
  const existingHandles = new Set(existing.map(c => c.handle));

  for (const col of COLLECTIONS) {
    if (existingHandles.has(col.handle)) {
      console.log(`   ✓ "${col.title}" already exists`);
      continue;
    }
    const result = await api('POST', '/custom_collections.json', { custom_collection: col });
    console.log(`   ✓ Created "${result.custom_collection.title}" (id: ${result.custom_collection.id})`);
  }
}

// ── 3. Create navigation menu ────────────────────────────────────────────────
async function setupNavigation() {
  console.log('\n🔗 Updating main navigation menu...');
  const { menus } = await api('GET', '/menus.json');
  const mainMenu = menus.find(m => m.handle === 'main-menu');
  if (!mainMenu) { console.log('   ⚠ main-menu not found, skipping'); return; }

  const navItems = [
    { title: 'Dogs',     url: '/collections/dogs',        type: 'collection_link' },
    { title: 'Cats',     url: '/collections/cats',        type: 'collection_link' },
    { title: 'Grooming', url: '/collections/grooming',    type: 'collection_link' },
    { title: 'Toys',     url: '/collections/toys',        type: 'collection_link' },
    { title: 'All Products', url: '/collections/all',     type: 'collection_link' },
    { title: 'Contact',  url: '/pages/contact',           type: 'page_link' },
  ];

  await api('PUT', `/menus/${mainMenu.id}.json`, {
    menu: {
      id: mainMenu.id,
      title: mainMenu.title,
      handle: mainMenu.handle,
      items: navItems,
    },
  });
  console.log('   ✓ Navigation updated with pet categories');
}

// ── 4. Create Contact page ───────────────────────────────────────────────────
async function createContactPage() {
  console.log('\n📄 Checking Contact page...');
  const { pages } = await api('GET', '/pages.json');
  if (pages.find(p => p.handle === 'contact')) {
    console.log('   ✓ Contact page already exists');
    return;
  }
  await api('POST', '/pages.json', {
    page: {
      title: 'Contact',
      handle: 'contact',
      body_html: '<p>Have a question? We\'re here to help. Email us at <a href="mailto:support@pawvault.com">support@pawvault.com</a> and we\'ll get back to you within 24 hours.</p><p>We love hearing from pet parents!</p>',
      template_suffix: 'contact',
    },
  });
  console.log('   ✓ Contact page created');
}

// ── 5. Summary ───────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n🐾 PawVault Store Setup`);
  console.log(`   Store: ${SHOP}`);
  console.log(`   API:   ${API_VER}\n`);

  try {
    await renameStore();
    await createCollections();
    await setupNavigation();
    await createContactPage();
    console.log('\n✅ Setup complete! Open https://ivanreseller-2.myshopify.com to see your store.\n');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

run();
