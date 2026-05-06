import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';
import { env } from '../src/config/env';

type ShopifyProduct = {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  status: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  descriptionHtml: string | null;
  totalInventory: number | null;
  featuredMedia?: { preview?: { image?: { url?: string | null } | null } | null } | null;
  priceRangeV2?: {
    minVariantPrice?: { amount?: string | null; currencyCode?: string | null } | null;
    maxVariantPrice?: { amount?: string | null; currencyCode?: string | null } | null;
  } | null;
  variants: {
    nodes: Array<{
      sku: string | null;
      price: string | null;
      inventoryQuantity: number | null;
      availableForSale: boolean;
    }>;
  };
};

type CustomCollection = {
  id: number;
  handle: string;
  title: string;
  body_html?: string | null;
};

type RestToken = {
  shopDomain: string;
  accessToken: string;
};

type ProductOptimization = {
  product: ShopifyProduct;
  nextTitle: string;
  nextBodyHtml: string;
  nextTags: string[];
  seoTitle: string;
  seoDescription: string;
  categories: string[];
  score: number;
  needsUpdate: boolean;
  reasons: string[];
};

const USER_ID = Number(process.argv.find((arg) => arg.startsWith('--user='))?.split('=')[1] || 1);
const EXECUTE = process.argv.includes('--execute');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1];
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG)) : 0;
const API_VERSION = env.SHOPIFY_API_VERSION || '2026-04';

const CURATED_COLLECTIONS = [
  {
    handle: 'pawvault-picks',
    title: 'PawVault Picks',
    body_html:
      '<p>Curated pet essentials selected for clear utility, practical pricing, and everyday use.</p>',
  },
  {
    handle: 'grooming-essentials',
    title: 'Grooming Essentials',
    body_html:
      '<p>Brushes, bath helpers, nail tools, and coat-care products for simpler grooming routines.</p>',
  },
  {
    handle: 'walk-travel',
    title: 'Walk & Travel',
    body_html:
      '<p>Leashes, collars, harnesses, carriers, and travel helpers for daily outings.</p>',
  },
  {
    handle: 'feeding-comfort',
    title: 'Feeding & Comfort',
    body_html:
      '<p>Bowls, feeders, beds, mats, and comfort products for calmer daily care.</p>',
  },
  {
    handle: 'play-enrichment',
    title: 'Play & Enrichment',
    body_html:
      '<p>Toys, scratchers, tunnels, puzzles, and enrichment products for active pets.</p>',
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function titleCase(value: string): string {
  const small = new Set(['and', 'or', 'for', 'with', 'to', 'in', 'of']);
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && small.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const tag of tags.map((entry) => String(entry || '').trim()).filter(Boolean)) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(tag);
  }
  return next;
}

function compactTitle(rawTitle: string): string {
  return rawTitle
    .replace(/[A-Z0-9]{8,}-[A-Z0-9-]{8,}/gi, ' ')
    .replace(/\b(CJ|USA|US|Wholesale|Dropshipping|Supplier|Supplies|Accessories)\b/gi, ' ')
    .replace(/\b(Cat Dog|Dog Cat|Pet Pet|Pet Supplies|Pet Accessories)\b/gi, 'Pet')
    .replace(/\b(For Cat Dog|For Dog Cat|For Pets)\b/gi, 'for Pets')
    .replace(/[|_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildBuyerTitle(rawTitle: string): string {
  const lower = rawTitle.toLowerCase();
  const target = /\bcat|kitten|scratch|catnip|litter\b/i.test(rawTitle)
    ? 'Cat'
    : /\bdog|puppy|leash|harness|bark|collar\b/i.test(rawTitle)
      ? 'Dog'
      : 'Pet';

  let title = '';
  if (/funeral|urn|cinerary|memorial|ashes/.test(lower)) {
    title = 'Pet Memorial Urn';
  } else if (/^dog treat puzzle ball$/.test(lower)) {
    title = 'Dog Treat Puzzle Ball';
  } else if (/^led dog harness$/.test(lower)) {
    title = 'LED Dog Harness';
  } else if (/airtag|tracker/.test(lower)) {
    title = 'AirTag Pet Collar';
  } else if (/missing food ball|food ball|treat ball/.test(lower)) {
    title = 'Dog Treat Puzzle Ball';
  } else if (/food storage|storage bucket|storage container|kibble/.test(lower)) {
    title = 'Pet Food Storage Container';
  } else if (/tent|teepee/.test(lower)) {
    title = 'Foldable Warm Pet Tent';
  } else if (/fence|gate|partition/.test(lower)) {
    title = 'Retractable Pet Safety Gate';
  } else if (/cowboy hat|headgear|headwear|cap/.test(lower)) {
    title = 'Adjustable Pet Cowboy Hat';
  } else if (/chest strap/.test(lower) && /led|illuminated|light/.test(lower)) {
    title = 'LED Dog Harness';
  } else if (/terrarium|breeding box|climbing box/.test(lower)) {
    title = 'Small Pet Terrarium Box';
  } else if (/shampoo|bath|groom|brush|comb|nail|lint|hair|fur|massage/.test(lower)) {
    if (/shampoo|dispenser/.test(lower)) title = 'Pet Bath Brush with Shampoo Dispenser';
    else if (/foaming|foam/.test(lower)) title = 'Foaming Pet Bath Brush';
    else if (/nail|clipper|trimmer/.test(lower)) title = 'Pet Nail Grooming Tool';
    else title = 'Pet Grooming Brush';
  } else if (/stair|steps|ladder|ramp|slope/.test(lower)) {
    title = 'Pet Stairs for Beds and Sofas';
  } else if (/bowl|feeder|feeding|food|water|fountain|dispenser|slow feeder/.test(lower)) {
    if (/fountain|water/.test(lower)) title = 'Pet Water Fountain';
    else if (/slow/.test(lower)) title = 'Slow Feeder Pet Bowl';
    else title = 'Pet Feeding Bowl';
  } else if (/\b(bed|cushion|mat|blanket|sofa|pillow|house|nest)\b/.test(lower)) {
    title = `${target} Comfort Bed`;
  } else if (/toy|chew|squeak|puzzle|ball|teaser|tunnel|scratch|roller/.test(lower)) {
    if (/scratch/.test(lower)) title = 'Cat Scratcher Toy';
    else if (/tunnel/.test(lower)) title = 'Pet Play Tunnel';
    else title = `${target} Enrichment Toy`;
  } else if (/leash|harness|collar|seat belt|belt|carrier|sling|bag|backpack|travel/.test(lower)) {
    if (/leash/.test(lower)) title = 'Adjustable Dog Leash';
    else if (/harness/.test(lower)) title = 'Dog Harness';
    else if (/seat belt|belt/.test(lower)) title = 'Pet Seat Belt';
    else if (/carrier|sling|bag|backpack/.test(lower)) title = 'Pet Travel Carrier';
    else title = 'Adjustable Pet Collar';
  } else if (/clothes|clothing|bow|bandana|sunglasses|costume|scarf/.test(lower)) {
    if (/bow/.test(lower)) title = `${target} Bow Tie Collar`;
    else if (/bandana|scarf/.test(lower)) title = `${target} Bandana Scarf`;
    else title = `${target} Outfit Accessory`;
  } else if (/hamster|rabbit|bird|turtle|small animal/.test(lower)) {
    title = 'Small Pet Care Accessory';
  }

  if (!title) {
    title = titleCase(compactTitle(rawTitle));
  }

  const clean = title
    .replace(/\s+/g, ' ')
    .replace(/\bPet Pet\b/gi, 'Pet')
    .trim();

  if (clean.length <= 68) return clean;
  return clean.slice(0, 65).replace(/\s+\S*$/, '').trim();
}

function inferCategories(title: string, productType?: string | null): string[] {
  const text = `${title} ${productType || ''}`.toLowerCase();
  const categories = new Set<string>();
  if (/funeral|urn|cinerary|memorial|ashes/.test(text)) return [];
  if (/shampoo|bath|groom|brush|comb|nail|lint|hair|fur|massage/.test(text)) categories.add('grooming-essentials');
  if (/leash|harness|collar|seat belt|belt|carrier|sling|bag|backpack|travel/.test(text)) categories.add('walk-travel');
  if (/bowl|feeder|feeding|food|water|fountain|\b(bed|cushion|mat|blanket|sofa|pillow|house|nest)\b/.test(text)) {
    categories.add('feeding-comfort');
  }
  if (/toy|chew|squeak|puzzle|ball|teaser|tunnel|scratch|roller/.test(text)) categories.add('play-enrichment');
  return [...categories];
}

function buildDescription(title: string, categories: string[], minPrice: number): string {
  const useCase = categories.includes('grooming-essentials')
    ? 'cleaner grooming routines'
    : categories.includes('walk-travel')
      ? 'walks, travel, and everyday outings'
      : categories.includes('feeding-comfort')
        ? 'daily feeding and comfort'
        : categories.includes('play-enrichment')
          ? 'active play and enrichment'
          : 'everyday pet care';

  const priceLine = Number.isFinite(minPrice) && minPrice > 0
    ? `<li>Selected for practical value at a buyer-friendly starting price of $${minPrice.toFixed(2)}.</li>`
    : '<li>Selected for practical value and everyday usefulness.</li>';

  return [
    `<p>${title} is a practical PawVault pick for ${useCase}. It is curated for pet parents who want useful products without digging through crowded marketplaces.</p>`,
    '<h3>Why pet parents like it</h3>',
    '<ul>',
    '<li>Clear, everyday use case for dogs, cats, or small pets.</li>',
    '<li>Designed for simple care routines at home or on the go.</li>',
    priceLine,
    '</ul>',
    '<h3>Good to know</h3>',
    '<ul>',
    '<li>Choose the correct size, color, or variant before checkout when options are available.</li>',
    '<li>Product measurements may vary slightly by production batch.</li>',
    '<li>Secure checkout available through the store payment options.</li>',
    '</ul>',
  ].join('');
}

function buildSeoDescription(title: string, categories: string[], minPrice: number): string {
  const focus = categories.includes('grooming-essentials')
    ? 'grooming'
    : categories.includes('walk-travel')
      ? 'walks and travel'
      : categories.includes('feeding-comfort')
        ? 'feeding and comfort'
        : categories.includes('play-enrichment')
          ? 'play and enrichment'
          : 'daily pet care';
  const price = Number.isFinite(minPrice) && minPrice > 0 ? ` from $${minPrice.toFixed(2)}` : '';
  return `${title}${price}. A curated PawVault pet essential for ${focus}, selected for practical everyday use.`
    .slice(0, 155)
    .replace(/\s+\S*$/, '')
    .trim();
}

function needsDescriptionRefresh(descriptionHtml: string | null): boolean {
  const text = stripHtml(descriptionHtml || '');
  if (text.length < 140) return true;
  return /wholesale|dropshipping|supplier|cj|product description|undefined/i.test(text);
}

function scoreProduct(product: ShopifyProduct, nextTitle: string, categories: string[], minPrice: number): number {
  let score = 0;
  if (/funeral|urn|cinerary|memorial|ashes/i.test(`${product.title} ${nextTitle}`)) score -= 80;
  if ((product.totalInventory || 0) > 10) score += 15;
  if ((product.totalInventory || 0) > 50) score += 10;
  if (minPrice >= 8 && minPrice <= 45) score += 20;
  if (product.featuredMedia?.preview?.image?.url) score += 15;
  if (categories.length > 0) score += 15;
  if (nextTitle.length >= 18 && nextTitle.length <= 60) score += 10;
  if (product.tags.includes('cj-shopify-usa')) score += 10;
  if (product.variants.nodes.some((variant) => variant.availableForSale)) score += 15;
  return score;
}

async function shopifyRest<T>(token: RestToken, method: string, endpoint: string, body?: unknown): Promise<T> {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(`https://${token.shopDomain}/admin/api/${API_VERSION}/${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token.accessToken,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (response.ok) {
      return data as T;
    }
    if (response.status === 429 && attempt < 6) {
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 1600 * attempt;
      console.log(`Shopify rate limit on ${method} ${endpoint}; retrying in ${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`${method} ${endpoint} failed ${response.status}: ${text.slice(0, 400)}`);
  }
  throw new Error(`${method} ${endpoint} failed after retries`);
}

async function fetchProducts(): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;
  for (;;) {
    const data = await cjShopifyUsaAdminService.graphql<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ShopifyProduct[];
      };
    }>({
      userId: USER_ID,
      query: `query PawVaultProducts($cursor: String) {
        products(first: 100, after: $cursor, query: "status:active") {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            legacyResourceId
            title
            handle
            status
            vendor
            productType
            tags
            descriptionHtml
            totalInventory
            featuredMedia {
              preview {
                image { url }
              }
            }
            priceRangeV2 {
              minVariantPrice { amount currencyCode }
              maxVariantPrice { amount currencyCode }
            }
            variants(first: 100) {
              nodes { sku price inventoryQuantity availableForSale }
            }
          }
        }
      }`,
      variables: { cursor },
    });
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return products;
}

function buildOptimization(product: ShopifyProduct): ProductOptimization {
  const nextTitle = buildBuyerTitle(product.title);
  const categories = inferCategories(`${product.title} ${nextTitle}`, product.productType);
  const minPrice = Number(product.priceRangeV2?.minVariantPrice?.amount || product.variants.nodes[0]?.price || 0);
  const nextBodyHtml = buildDescription(nextTitle, categories, minPrice);
  const tagAdds = [
    'pawvault-curated',
    ...categories.map((category) => `collection:${category}`),
  ];
  const nextTags = normalizeTags([...product.tags, ...tagAdds]);
  const seoTitle = `${nextTitle} | PawVault`.slice(0, 70);
  const seoDescription = buildSeoDescription(nextTitle, categories, minPrice);
  const reasons: string[] = [];
  if (nextTitle !== product.title) reasons.push('title');
  if (needsDescriptionRefresh(product.descriptionHtml)) reasons.push('description');
  if (tagAdds.some((tag) => !product.tags.includes(tag))) reasons.push('tags');
  const score = scoreProduct(product, nextTitle, categories, minPrice);
  return {
    product,
    nextTitle,
    nextBodyHtml,
    nextTags,
    seoTitle,
    seoDescription,
    categories,
    score,
    needsUpdate: reasons.length > 0,
    reasons,
  };
}

async function ensureCollections(token: RestToken): Promise<Map<string, CustomCollection>> {
  const existing = await shopifyRest<{ custom_collections: CustomCollection[] }>(
    token,
    'GET',
    'custom_collections.json?limit=250&fields=id,handle,title,body_html',
  );
  const byHandle = new Map(existing.custom_collections.map((collection) => [collection.handle, collection]));

  for (const definition of CURATED_COLLECTIONS) {
    const current = byHandle.get(definition.handle);
    if (!EXECUTE) {
      if (!current) {
        console.log(`[dry-run] would create collection: ${definition.title}`);
      } else if (current.title !== definition.title || String(current.body_html || '') !== definition.body_html) {
        console.log(`[dry-run] would refresh collection copy: ${definition.title}`);
      }
      continue;
    }

    if (!current) {
      const created = await shopifyRest<{ custom_collection: CustomCollection }>(token, 'POST', 'custom_collections.json', {
        custom_collection: {
          title: definition.title,
          handle: definition.handle,
          body_html: definition.body_html,
          published: true,
        },
      });
      byHandle.set(definition.handle, created.custom_collection);
      console.log(`created collection: ${definition.title}`);
      await sleep(300);
    } else if (current.title !== definition.title || String(current.body_html || '') !== definition.body_html) {
      const updated = await shopifyRest<{ custom_collection: CustomCollection }>(
        token,
        'PUT',
        `custom_collections/${current.id}.json`,
        {
          custom_collection: {
            id: current.id,
            title: definition.title,
            body_html: definition.body_html,
            published: true,
          },
        },
      );
      byHandle.set(definition.handle, updated.custom_collection);
      console.log(`refreshed collection: ${definition.title}`);
      await sleep(300);
    }
  }

  return byHandle;
}

async function fetchCollectionProductIds(token: RestToken, collectionId: number): Promise<Set<number>> {
  const existing = await shopifyRest<{ collects: Array<{ id: number; product_id: number }> }>(
    token,
    'GET',
    `collects.json?collection_id=${collectionId}&limit=250&fields=id,product_id`,
  );
  return new Set(existing.collects.map((collect) => collect.product_id));
}

async function addProductToCollection(token: RestToken, collectionId: number, productId: number) {
  await shopifyRest(token, 'POST', 'collects.json', {
    collect: {
      collection_id: collectionId,
      product_id: productId,
    },
  });
}

async function updateProduct(token: RestToken, optimization: ProductOptimization) {
  await shopifyRest(token, 'PUT', `products/${optimization.product.legacyResourceId}.json`, {
    product: {
      id: Number(optimization.product.legacyResourceId),
      title: optimization.nextTitle,
      body_html: optimization.nextBodyHtml,
      tags: optimization.nextTags.join(', '),
      metafields_global_title_tag: optimization.seoTitle,
      metafields_global_description_tag: optimization.seoDescription,
    },
  });
}

async function main() {
  const token = await cjShopifyUsaAdminService.getAccessToken(USER_ID);
  const restToken: RestToken = { shopDomain: token.shopDomain, accessToken: token.accessToken };
  const products = (await fetchProducts()).filter((product) => product.tags.includes('cj-shopify-usa'));
  const selectedProducts = LIMIT ? products.slice(0, LIMIT) : products;
  const optimizations = selectedProducts.map(buildOptimization);
  const updates = optimizations.filter((optimization) => optimization.needsUpdate);
  const picks = [...optimizations]
    .filter((optimization) => optimization.score >= 60 && optimization.product.variants.nodes.some((variant) => variant.availableForSale))
    .sort((a, b) => b.score - a.score)
    .slice(0, 72);

  console.log(JSON.stringify({
    mode: EXECUTE ? 'execute' : 'dry-run',
    shop: restToken.shopDomain,
    scannedCjProducts: products.length,
    selectedProducts: selectedProducts.length,
    productsNeedingUpdate: updates.length,
    curatedPicks: picks.length,
    categoryAssignments: CURATED_COLLECTIONS.map((collection) => ({
      handle: collection.handle,
      count: collection.handle === 'pawvault-picks'
        ? picks.length
        : optimizations.filter((optimization) => optimization.categories.includes(collection.handle)).length,
    })),
    sampleUpdates: updates.slice(0, 12).map((optimization) => ({
      id: optimization.product.legacyResourceId,
      from: optimization.product.title,
      to: optimization.nextTitle,
      reasons: optimization.reasons,
      categories: optimization.categories,
      score: optimization.score,
    })),
  }, null, 2));

  const collections = await ensureCollections(restToken);
  if (!EXECUTE) return;

  let updatedCount = 0;
  for (const optimization of updates) {
    await updateProduct(restToken, optimization);
    updatedCount += 1;
    if (updatedCount % 25 === 0) {
      console.log(`updated ${updatedCount}/${updates.length} products`);
    }
    await sleep(650);
  }

  for (const collection of CURATED_COLLECTIONS) {
    const collectionRecord = collections.get(collection.handle);
    if (!collectionRecord) continue;
    const target = collection.handle === 'pawvault-picks'
      ? picks
      : optimizations.filter((optimization) => optimization.categories.includes(collection.handle));
    const existingProductIds = await fetchCollectionProductIds(restToken, collectionRecord.id);
    let added = 0;
    for (const optimization of target) {
      const productId = Number(optimization.product.legacyResourceId);
      if (!existingProductIds.has(productId)) {
        await addProductToCollection(restToken, collectionRecord.id, productId);
        added += 1;
        await sleep(250);
      }
    }
    console.log(`collection ${collection.title}: ${target.length} targeted, ${added} added`);
  }

  console.log(JSON.stringify({
    executed: true,
    updatedProducts: updatedCount,
    curatedPicks: picks.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
