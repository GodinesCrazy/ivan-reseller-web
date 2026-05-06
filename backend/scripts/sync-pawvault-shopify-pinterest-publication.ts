import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';

const USER_ID = Number(process.argv.find((arg) => arg.startsWith('--user='))?.split('=')[1] || 1);
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 500);
const EXECUTE = process.argv.includes('--execute');

type Publication = { id: string; name: string };
type ProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory?: number | null;
  media?: { nodes?: Array<{ id: string }> | null } | null;
  pinterestPublished?: boolean | null;
};

async function fetchPinterestPublication() {
  const data = await cjShopifyUsaAdminService.graphql<{
    publications: { nodes: Publication[] };
  }>({
    userId: USER_ID,
    query: `
      query PawVaultPinterestPublication {
        publications(first: 20) {
          nodes { id name }
        }
      }
    `,
  });
  const publication = data.publications.nodes.find((node) => node.name.toLowerCase().includes('pinterest'));
  if (!publication) throw new Error('Pinterest publication/channel was not found in Shopify.');
  return publication;
}

async function fetchActiveProducts(publicationId: string) {
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
        query PawVaultPinterestProducts($first: Int!, $after: String, $publicationId: ID!) {
          products(first: $first, after: $after, query: "status:active") {
            nodes {
              id
              title
              handle
              status
              totalInventory
              media(first: 1) { nodes { id } }
              pinterestPublished: publishedOnPublication(publicationId: $publicationId)
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      variables: { first: 100, after, publicationId },
    });
    products.push(...(data.products.nodes ?? []));
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after && products.length < LIMIT);

  return products.slice(0, LIMIT);
}

async function main() {
  const publication = await fetchPinterestPublication();
  const products = await fetchActiveProducts(publication.id);
  const candidates = products.filter((product) =>
    !product.pinterestPublished &&
    Number(product.totalInventory ?? 0) > 0 &&
    Boolean(product.media?.nodes?.length),
  );

  const failures: Array<{ id: string; title: string; error: string }> = [];
  let published = 0;

  console.log(JSON.stringify({
    mode: EXECUTE ? 'execute' : 'dry-run',
    publication,
    scannedActiveProducts: products.length,
    alreadyPublished: products.filter((product) => product.pinterestPublished).length,
    publishableMissing: candidates.length,
    sampleMissing: candidates.slice(0, 25).map((product) => ({
      title: product.title,
      handle: product.handle,
    })),
  }, null, 2));

  if (!EXECUTE) return;

  for (const product of candidates) {
    try {
      await cjShopifyUsaAdminService.publishProductToPublication({
        userId: USER_ID,
        productId: product.id,
        publicationId: publication.id,
      });
      published++;
    } catch (error) {
      failures.push({
        id: product.id,
        title: product.title,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.log(JSON.stringify({ execute: true, published, failures: failures.slice(0, 50) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
