import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';

const USER_ID = Number(process.argv.find((arg) => arg.startsWith('--user='))?.split('=')[1] || 1);
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 500);

type Publication = {
  id: string;
  name: string;
  autoPublish?: boolean | null;
  supportsFuturePublishing?: boolean | null;
};

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory?: number | null;
  media?: { nodes?: Array<{ id: string }> | null } | null;
  variants?: { nodes?: Array<{ sku?: string | null; inventoryQuantity?: number | null }> | null } | null;
  [key: string]: unknown;
};

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function aliasForPublication(index: number): string {
  return `pub${index}`;
}

function isGenericTitle(title: string): boolean {
  return new Set([
    'pet',
    'pet supplies',
    'pet product',
    'pet grooming brush',
    'pet feeding bowl',
    'pet water fountain',
    'pet travel carrier',
    'pet nail grooming tool',
    'adjustable pet collar',
    'adjustable dog leash',
    'dog harness',
    'cat enrichment toy',
    'dog enrichment toy',
    'pet enrichment toy',
  ]).has(normalizeTitle(title));
}

async function fetchPublications() {
  const data = await cjShopifyUsaAdminService.graphql<{
    publications: { nodes: Publication[] };
  }>({
    userId: USER_ID,
    query: `
      query PawVaultPublications {
        publications(first: 20) {
          nodes {
            id
            name
            autoPublish
            supportsFuturePublishing
          }
        }
      }
    `,
  });
  return data.publications.nodes ?? [];
}

async function fetchProducts(publications: Publication[]) {
  const productFields = publications
    .map((_, index) => `${aliasForPublication(index)}: publishedOnPublication(publicationId: $publicationId${index})`)
    .join('\n');
  const publicationVariables = Object.fromEntries(
    publications.map((publication, index) => [`publicationId${index}`, publication.id]),
  );
  const publicationVarDefs = publications
    .map((_, index) => `$publicationId${index}: ID!`)
    .join(', ');
  const products: ProductNode[] = [];
  let after: string | null = null;

  do {
    const data = await cjShopifyUsaAdminService.graphql<{
      products: {
        nodes: ProductNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>({
      userId: USER_ID,
      query: `
        query PawVaultPublicationProducts($first: Int!, $after: String, ${publicationVarDefs}) {
          products(first: $first, after: $after, query: "status:active") {
            nodes {
              id
              title
              handle
              status
              totalInventory
              media(first: 1) { nodes { id } }
              variants(first: 20) { nodes { sku inventoryQuantity } }
              ${productFields}
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      variables: {
        first: 100,
        after,
        ...publicationVariables,
      },
    });

    products.push(...(data.products.nodes ?? []));
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after && products.length < LIMIT);

  return products.slice(0, LIMIT);
}

async function main() {
  const publications = await fetchPublications();
  const products = await fetchProducts(publications);
  const titleGroups = new Map<string, ProductNode[]>();
  for (const product of products) {
    const key = normalizeTitle(product.title);
    const group = titleGroups.get(key) ?? [];
    group.push(product);
    titleGroups.set(key, group);
  }

  const publicationCounts = publications.map((publication, index) => {
    const alias = aliasForPublication(index);
    const publishedProducts = products.filter((product) => Boolean(product[alias]));
    return {
      name: publication.name,
      id: publication.id,
      autoPublish: publication.autoPublish ?? null,
      activeProductsPublished: publishedProducts.length,
      missingFromThisPublication: products.length - publishedProducts.length,
      sampleMissing: products
        .filter((product) => !product[alias])
        .slice(0, 10)
        .map((product) => ({ title: product.title, handle: product.handle })),
    };
  });

  const duplicateGroups = [...titleGroups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      title: group[0].title,
      count: group.length,
      handles: group.map((product) => product.handle).slice(0, 10),
    }));

  console.log(JSON.stringify({
    scannedActiveProducts: products.length,
    publications: publicationCounts,
    quality: {
      noMedia: products.filter((product) => !product.media?.nodes?.length).length,
      noInventory: products.filter((product) => Number(product.totalInventory ?? 0) <= 0).length,
      genericTitles: products.filter((product) => isGenericTitle(product.title)).length,
      duplicateTitleGroups: duplicateGroups.length,
      duplicateSamples: duplicateGroups.slice(0, 10),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
