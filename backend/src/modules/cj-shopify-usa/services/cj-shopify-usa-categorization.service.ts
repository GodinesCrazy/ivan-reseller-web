import { cjShopifyUsaAdminService } from './cj-shopify-usa-admin.service';

type PetCollectionRule = {
  handle: string;
  title: string;
  terms: RegExp;
};

const PET_COLLECTION_RULES: PetCollectionRule[] = [
  { handle: 'dogs', title: 'Dogs', terms: /\b(dog|dogs|puppy|canine|leash|harness|bark|collar)\b/i },
  { handle: 'cats', title: 'Cats', terms: /\b(cat|cats|kitten|feline|catnip|litter|scratch)\b/i },
  { handle: 'grooming', title: 'Grooming', terms: /\b(groom|brush|comb|scissors|shear|bath|shampoo|nail|lint|hair)\b/i },
  { handle: 'beds', title: 'Beds', terms: /\b(bed|cushion|mat|blanket|house|sofa|pillow|warm)\b/i },
  { handle: 'feeding', title: 'Feeding', terms: /\b(bowl|feed|feeder|treat|snack|food|water|fountain|dispenser)\b/i },
  { handle: 'toys', title: 'Toys', terms: /\b(toy|puzzle|chew|squeak|interactive|play|ball|teaser|tunnel)\b/i },
];

const DEFAULT_COLLECTIONS = [
  { handle: 'new-arrivals', title: 'New Arrivals' },
  { handle: 'bestsellers', title: 'Bestsellers' },
];

function numericShopifyId(id: string): number | null {
  const raw = id.includes('gid://') ? id.split('/').pop() : id;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function inferHandles(title: string): string[] {
  const matched = PET_COLLECTION_RULES
    .filter((rule) => rule.terms.test(title))
    .map((rule) => rule.handle);
  return uniq([...DEFAULT_COLLECTIONS.map((entry) => entry.handle), ...matched]);
}

export const cjShopifyUsaCategorizationService = {
  inferProductType(title: string): string {
    const handles = inferHandles(title);
    if (handles.includes('grooming')) return 'Pet Grooming';
    if (handles.includes('toys')) return 'Pet Toys';
    if (handles.includes('feeding')) return 'Pet Feeding';
    if (handles.includes('beds')) return 'Pet Beds';
    if (handles.includes('dogs') && !handles.includes('cats')) return 'Dog Accessories';
    if (handles.includes('cats') && !handles.includes('dogs')) return 'Cat Accessories';
    return 'Pet Supplies';
  },

  buildProductTags(cjProductId: string, title: string): string[] {
    return uniq([
      'cj-shopify-usa',
      'pawvault',
      'pet-supplies',
      `cj-product:${cjProductId}`,
      ...inferHandles(title),
    ]);
  },

  inferCollectionHandles(title: string): string[] {
    return inferHandles(title);
  },

  async assignProductToPetCollections(input: {
    userId: number;
    shopifyProductId: string;
    title: string;
  }): Promise<string[]> {
    const numericId = numericShopifyId(input.shopifyProductId);
    if (!numericId) return [];

    const token = await cjShopifyUsaAdminService.getAccessToken(input.userId);
    const base = `https://${token.shopDomain}/admin/api/2026-04`;
    const headers = {
      'X-Shopify-Access-Token': token.accessToken,
      'Content-Type': 'application/json',
    };

    const desiredHandles = inferHandles(input.title);
    const allDesired = uniq([
      ...DEFAULT_COLLECTIONS.map((entry) => entry.handle),
      ...desiredHandles,
    ]);

    const collectionRes = await fetch(`${base}/custom_collections.json?limit=250&fields=id,handle,title`, { headers });
    if (!collectionRes.ok) return [];
    const payload = await collectionRes.json() as {
      custom_collections?: Array<{ id: number; handle: string; title: string }>;
    };
    const byHandle = new Map((payload.custom_collections ?? []).map((collection) => [collection.handle, collection]));

    for (const wanted of [...DEFAULT_COLLECTIONS, ...PET_COLLECTION_RULES]) {
      if (!allDesired.includes(wanted.handle) || byHandle.has(wanted.handle)) continue;
      const createRes = await fetch(`${base}/custom_collections.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          custom_collection: {
            title: wanted.title,
            handle: wanted.handle,
            published: true,
          },
        }),
      });
      if (!createRes.ok) continue;
      const created = await createRes.json() as {
        custom_collection?: { id: number; handle: string; title: string };
      };
      if (created.custom_collection) {
        byHandle.set(created.custom_collection.handle, created.custom_collection);
      }
    }

    const assigned: string[] = [];
    for (const handle of allDesired) {
      const collection = byHandle.get(handle);
      if (!collection?.id) continue;
      const collectRes = await fetch(`${base}/collects.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          collect: {
            product_id: numericId,
            collection_id: collection.id,
          },
        }),
      });
      if (collectRes.ok || collectRes.status === 422) {
        assigned.push(handle);
      }
    }
    return assigned;
  },
};
