import { Prisma } from '@prisma/client';
import { prisma } from '../src/config/database';
import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';
import { isCjShopifyUsaPetProduct } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-policy.service';

const USER_ID = Number(process.argv.find((arg) => arg.startsWith('--user='))?.split('=')[1] || 1);
const EXECUTE = process.argv.includes('--execute');
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 500);
const ARCHIVE_DUPLICATES = process.argv.includes('--archive-duplicates');
const ARCHIVE_GENERIC = process.argv.includes('--archive-generic');

const GENERIC_TITLES = new Set([
  'pet',
  'pet supplies',
  'pet grooming brush',
  'pet feeding bowl',
  'pet water fountain',
  'cat comfort bed',
  'dog comfort bed',
  'pet comfort bed',
  'pet travel carrier',
  'pet nail grooming tool',
  'adjustable pet collar',
  'adjustable dog leash',
  'dog harness',
  'cat enrichment toy',
  'dog enrichment toy',
  'pet enrichment toy',
  'small pet care accessory',
  'pet stairs for beds and sofas',
  'foldable warm pet tent',
  'pet bath brush with shampoo dispenser',
]);

type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number | null;
  productType?: string | null;
  vendor?: string | null;
  featuredMedia?: { preview?: { image?: { url?: string | null } | null } | null } | null;
  variants: { nodes: Array<{ id: string; price: string; sku: string; inventoryQuantity: number | null }> };
};

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function toTitleCase(input: string): string {
  const minor = new Set(['and', 'or', 'for', 'the', 'with', 'of', 'a', 'an', 'to', 'in']);
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && minor.has(lower)) return lower;
      if (['led', 'usb', 'gps'].includes(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function trimTitle(input: string, maxLength = 62): string {
  if (input.length <= maxLength) return input;
  const words = input.split(/\s+/);
  const kept: string[] = [];
  for (const word of words) {
    const next = [...kept, word].join(' ');
    if (next.length > maxLength) break;
    kept.push(word);
  }
  return kept.join(' ') || input.slice(0, maxLength).trim();
}

function titleFromHandle(handle: string): string {
  const rawWords = handle
    .replace(/-cj[a-z0-9]+$/i, '')
    .replace(/-\d+[a-z0-9-]*$/i, '')
    .split('-')
    .filter(Boolean);

  const words: string[] = [];
  for (const word of rawWords) {
    if (/^cj[a-z0-9]+$/i.test(word)) break;
    if (/^[a-z]{1,3}\d{2,}$/i.test(word)) break;
    if (/^(cj|az|by|cx|dw|ev|fu|hs|ir|jq|kp|lo|mn|nm|ve)$/i.test(word)) continue;
    if (/^\d+$/.test(word)) continue;
    words.push(word);
  }

  const stop = new Set(['supplies', 'new', 'amazon', 'amazons', 'household']);
  const cleaned = words.filter((word, index) => index < 2 || !stop.has(word.toLowerCase()));
  const title = trimTitle(toTitleCase(cleaned.join(' ')));
  return GENERIC_TITLES.has(normalizeTitle(title)) ? '' : title;
}

function isGenericTitle(title: string): boolean {
  return GENERIC_TITLES.has(normalizeTitle(title));
}

function significantWords(value: string): Set<string> {
  const noise = new Set([
    'pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'kitten', 'supplies', 'supply',
    'accessory', 'accessories', 'for', 'and', 'with', 'the', 'new', 'outdoor', 'indoor',
  ]);
  return new Set(
    normalizeTitle(value)
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !noise.has(word)),
  );
}

function titleHandleMismatch(title: string, handleTitle: string): boolean {
  const titleWords = significantWords(title);
  const handleWords = significantWords(handleTitle);
  if (titleWords.size === 0 || handleWords.size === 0) return false;
  let overlap = 0;
  for (const word of titleWords) {
    if (handleWords.has(word)) overlap++;
  }
  return overlap === 0;
}

function isClearlyUnsafeOrNonPet(product: ShopifyProduct): boolean {
  const haystack = normalizeTitle([product.title, product.handle, product.productType ?? ''].join(' '));
  if (/\b(women|womens|men|mens|adult|erotic|sex|lingerie|fetish|bdsm|slave|bondage)\b/.test(haystack)) return true;
  if (/\bchildren|kids|baby\b/.test(haystack) && !/\bpet|dog|cat|bird|hamster|rabbit|aquarium|fish\b/.test(haystack)) return true;
  if (!isCjShopifyUsaPetProduct({ title: product.title, productType: product.productType })) return true;
  return false;
}

function chooseBetterTitle(product: ShopifyProduct): string | null {
  const candidate = titleFromHandle(product.handle);
  if (!candidate || candidate.length < 12) return null;
  if (!isGenericTitle(product.title) && !titleHandleMismatch(product.title, candidate)) return null;
  if (normalizeTitle(candidate) === normalizeTitle(product.title)) return null;
  return candidate;
}

function minVariantPrice(product: ShopifyProduct): number {
  const prices = product.variants.nodes
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  return prices.length > 0 ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}

function duplicateArchiveTargets(products: ShopifyProduct[]): ShopifyProduct[] {
  if (!ARCHIVE_DUPLICATES) return [];
  const groups = new Map<string, ShopifyProduct[]>();
  for (const product of products) {
    const key = normalizeTitle(product.title);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(product);
    groups.set(key, group);
  }

  const targets: ShopifyProduct[] = [];
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => {
      const aImage = a.featuredMedia?.preview?.image?.url ? 1 : 0;
      const bImage = b.featuredMedia?.preview?.image?.url ? 1 : 0;
      if (aImage !== bImage) return bImage - aImage;
      const aInventory = Number(a.totalInventory ?? 0);
      const bInventory = Number(b.totalInventory ?? 0);
      if (aInventory !== bInventory) return bInventory - aInventory;
      return minVariantPrice(a) - minVariantPrice(b);
    });
    targets.push(...sorted.slice(1));
  }
  return targets;
}

async function listActiveProducts(): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let after: string | null = null;
  const query = `
    query PawVaultQualityProducts($first: Int!, $after: String) {
      products(first: $first, after: $after, query: "status:active") {
        nodes {
          id
          title
          handle
          status
          totalInventory
          productType
          vendor
          featuredMedia { preview { image { url } } }
          variants(first: 30) { nodes { id price sku inventoryQuantity } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  do {
    const data = await cjShopifyUsaAdminService.graphql<{
      products: { nodes: ShopifyProduct[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    }>({ userId: USER_ID, query, variables: { first: 100, after } });
    products.push(...data.products.nodes);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after && products.length < LIMIT);

  return products.slice(0, LIMIT);
}

async function updateProduct(input: { id: string; title?: string; status?: 'ARCHIVED' }) {
  const payload: Record<string, unknown> = { id: input.id };
  if (input.title) payload.title = input.title;
  if (input.status) payload.status = input.status;

  const data = await cjShopifyUsaAdminService.graphql<{
    productUpdate: { product?: { id: string; title: string; status: string } | null; userErrors: Array<{ message: string }> };
  }>({
    userId: USER_ID,
    query: `
      mutation PawVaultQualityProductUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title status }
          userErrors { message }
        }
      }
    `,
    variables: { input: payload },
  });

  const errors = data.productUpdate.userErrors ?? [];
  if (errors.length > 0) throw new Error(errors.map((error) => error.message).join('; '));
  return data.productUpdate.product;
}

async function syncLocalTitle(productId: string, title: string) {
  const listings = await prisma.cjShopifyUsaListing.findMany({
    where: {
      userId: USER_ID,
      OR: [
        { shopifyProductId: productId },
        { shopifyProductId: productId.split('/').pop() ?? productId },
        { shopifyProductId: { endsWith: `/${productId.split('/').pop() ?? productId}` } },
      ],
    },
    select: { id: true, draftPayload: true },
  });

  for (const listing of listings) {
    const draft = (listing.draftPayload && typeof listing.draftPayload === 'object' && !Array.isArray(listing.draftPayload))
      ? { ...(listing.draftPayload as Record<string, unknown>), title }
      : { title };
    if (EXECUTE) {
      await prisma.cjShopifyUsaListing.update({
        where: { id: listing.id },
        data: { draftPayload: draft as Prisma.InputJsonValue },
      });
    }
  }
}

async function main() {
  const products = await listActiveProducts();
  const archiveTargets = products.filter((product) => {
    const noImage = !product.featuredMedia?.preview?.image?.url;
    const noInventory = Number(product.totalInventory ?? 0) <= 0;
    const genericWithoutBetterTitle = ARCHIVE_GENERIC && isGenericTitle(product.title) && !chooseBetterTitle(product);
    return noImage || noInventory || isClearlyUnsafeOrNonPet(product) || genericWithoutBetterTitle;
  });
  const duplicateTargets = duplicateArchiveTargets(
    products.filter((product) => !archiveTargets.some((target) => target.id === product.id)),
  );
  const allArchiveTargets = [...archiveTargets, ...duplicateTargets];
  const renameTargets = products
    .map((product) => ({ product, newTitle: chooseBetterTitle(product) }))
    .filter((entry): entry is { product: ShopifyProduct; newTitle: string } => Boolean(entry.newTitle));

  let archived = 0;
  let renamed = 0;
  const errors: Array<{ id: string; title: string; action: string; error: string }> = [];

  console.log(JSON.stringify({
    mode: EXECUTE ? 'execute' : 'dry-run',
    scannedActiveProducts: products.length,
    duplicateArchiveEnabled: ARCHIVE_DUPLICATES,
    genericArchiveEnabled: ARCHIVE_GENERIC,
    archiveTargets: allArchiveTargets.map((product) => ({
      title: product.title,
      handle: product.handle,
      noImage: !product.featuredMedia?.preview?.image?.url,
      totalInventory: product.totalInventory,
      duplicateTitle: duplicateTargets.some((target) => target.id === product.id),
      genericTitle: isGenericTitle(product.title),
    })),
    renameTargetCount: renameTargets.length,
    renameSamples: renameTargets.slice(0, 30).map(({ product, newTitle }) => ({
      from: product.title,
      to: newTitle,
      handle: product.handle,
    })),
  }, null, 2));

  if (!EXECUTE) return;

  for (const product of allArchiveTargets) {
    try {
      await updateProduct({ id: product.id, status: 'ARCHIVED' });
      await prisma.cjShopifyUsaListing.updateMany({
        where: {
          userId: USER_ID,
          OR: [
            { shopifyProductId: product.id },
            { shopifyProductId: product.id.split('/').pop() ?? product.id },
            { shopifyProductId: { endsWith: `/${product.id.split('/').pop() ?? product.id}` } },
          ],
        },
        data: {
          status: 'ARCHIVED',
          lastSyncedAt: new Date(),
          lastError: duplicateTargets.some((target) => target.id === product.id)
            ? 'Archived by PawVault quality repair: duplicate active Shopify title.'
            : isGenericTitle(product.title)
              ? 'Archived by PawVault quality repair: buyer-facing title is too generic to inspire trust.'
              : 'Archived by PawVault quality repair: missing featured image, sellable inventory, or pet-policy fit.',
        },
      });
      archived++;
    } catch (error) {
      errors.push({ id: product.id, title: product.title, action: 'archive', error: error instanceof Error ? error.message : String(error) });
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  for (const { product, newTitle } of renameTargets) {
    if (allArchiveTargets.some((target) => target.id === product.id)) continue;
    try {
      await updateProduct({ id: product.id, title: newTitle });
      await syncLocalTitle(product.id, newTitle);
      renamed++;
    } catch (error) {
      errors.push({ id: product.id, title: product.title, action: 'rename', error: error instanceof Error ? error.message : String(error) });
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  console.log(JSON.stringify({ execute: EXECUTE, archived, renamed, errors: errors.slice(0, 25) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
