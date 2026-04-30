import { prisma } from '../src/config/database';
import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';

type PublicationNode = { id: string; name: string };

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  publishedOnPublication: boolean;
  variants: {
    nodes: Array<{
      id: string;
      sku: string | null;
      inventoryQuantity: number | null;
      availableForSale: boolean;
    }>;
  };
};

async function main() {
  const userId = Number(process.argv[2] || 1);
  const publicationData = await cjShopifyUsaAdminService.graphql<{ publications: { nodes: PublicationNode[] } }>({
    userId,
    query: `query CjShopifyUsaPublications { publications(first: 20) { nodes { id name } } }`,
  });
  const onlineStore = publicationData.publications.nodes.find((publication) => publication.name === 'Online Store')
    ?? publicationData.publications.nodes[0];
  if (!onlineStore) throw new Error('No Shopify publication found');

  const products: ProductNode[] = [];
  let cursor: string | null = null;
  for (;;) {
    const data = await cjShopifyUsaAdminService.graphql<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ProductNode[];
      };
    }>({
      userId,
      query: `query CjShopifyUsaPublishedProducts($cursor: String, $publicationId: ID!) {
        products(first: 100, after: $cursor, query: "status:active") {
          pageInfo { hasNextPage endCursor }
          nodes {
            id title handle status vendor productType tags
            publishedOnPublication(publicationId: $publicationId)
            variants(first: 100) {
              nodes { id sku inventoryQuantity availableForSale }
            }
          }
        }
      }`,
      variables: { cursor, publicationId: onlineStore.id },
    });
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  const published = products.filter((product) => product.publishedOnPublication);
  const noAvailableVariants = published.filter((product) =>
    product.variants.nodes.length === 0 || product.variants.nodes.every((variant) => !variant.availableForSale),
  );

  const activeListings = await prisma.cjShopifyUsaListing.findMany({
    where: {
      userId,
      status: { in: ['ACTIVE', 'RECONCILE_PENDING'] },
      shopifyProductId: { not: null },
    },
    select: {
      id: true,
      status: true,
      shopifyProductId: true,
      shopifyHandle: true,
      shopifyVariantId: true,
      variant: { select: { cjSku: true, cjVid: true, stockLastKnown: true } },
      product: { select: { cjProductId: true, title: true } },
    },
  });
  const localProductIds = new Set(activeListings.map((listing) => listing.shopifyProductId).filter(Boolean));
  const missingInShopifyPublication = [...localProductIds].filter((productId) =>
    !published.some((product) => product.id === productId),
  );
  const unmanagedPublished = published.filter((product) => !localProductIds.has(product.id));
  const unmanagedNoAvailable = noAvailableVariants.filter((product) => !localProductIds.has(product.id));

  console.log(JSON.stringify({
    publication: onlineStore,
    shopify: {
      activeProducts: products.length,
      publishedProducts: published.length,
      publishedProductsWithoutAvailableVariants: noAvailableVariants.length,
    },
    software: {
      activeOrReconcilePendingListings: activeListings.length,
      activeOrReconcilePendingUniqueShopifyProducts: localProductIds.size,
      activeOrPendingProductsMissingInShopifyPublication: missingInShopifyPublication.length,
    },
    unmanaged: {
      publishedProductsNotManagedByCjShopifyUsa: unmanagedPublished.length,
      publishedWithoutAvailableVariants: unmanagedNoAvailable.length,
    },
    samples: noAvailableVariants.slice(0, 20).map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags,
      managedByCjShopifyUsa: localProductIds.has(product.id),
      variants: product.variants.nodes.map((variant) => ({
        sku: variant.sku,
        inventoryQuantity: variant.inventoryQuantity,
        availableForSale: variant.availableForSale,
      })),
      localListings: activeListings
        .filter((listing) => listing.shopifyProductId === product.id)
        .map((listing) => ({
          id: listing.id,
          status: listing.status,
          shopifyVariantId: listing.shopifyVariantId,
          cjProductId: listing.product?.cjProductId,
          cjSku: listing.variant?.cjSku,
          cjVid: listing.variant?.cjVid,
          stockLastKnown: listing.variant?.stockLastKnown,
        })),
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
