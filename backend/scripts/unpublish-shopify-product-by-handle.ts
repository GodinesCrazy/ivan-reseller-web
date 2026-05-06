import { prisma } from '../src/config/database';
import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';
import { CJ_SHOPIFY_USA_LISTING_STATUS } from '../src/modules/cj-shopify-usa/cj-shopify-usa.constants';

async function main() {
  const userId = Number(process.argv.find((arg) => arg.startsWith('--user='))?.split('=')[1] || 1);
  const handle = process.argv.find((arg) => arg.startsWith('--handle='))?.split('=')[1]?.trim();
  const reason = process.argv.find((arg) => arg.startsWith('--reason='))?.split('=')[1]?.trim()
    || 'Manual removal: product does not match CJ Shopify USA pet-store policy.';

  if (!handle) {
    throw new Error('Usage: tsx scripts/unpublish-shopify-product-by-handle.ts --handle=product-handle');
  }

  const data = await cjShopifyUsaAdminService.graphql<{
    productByHandle: {
      id: string;
      legacyResourceId: string;
      title: string;
      handle: string;
      status: string;
      tags: string[];
    } | null;
    publications: { nodes: Array<{ id: string; name: string }> };
  }>({
    userId,
    query: `query ProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        legacyResourceId
        title
        handle
        status
        tags
      }
      publications(first: 20) {
        nodes { id name }
      }
    }`,
    variables: { handle },
  });

  const product = data.productByHandle;
  if (!product) {
    throw new Error(`Shopify product not found for handle ${handle}`);
  }

  const publication = data.publications.nodes.find((node) => node.name === 'Online Store')
    ?? data.publications.nodes[0];
  if (!publication) {
    throw new Error('No Shopify publication found');
  }

  await cjShopifyUsaAdminService.unpublishProductFromPublication({
    userId,
    productId: product.id,
    publicationId: publication.id,
  });
  await cjShopifyUsaAdminService.updateProductStatus({
    userId,
    productId: product.id,
    status: 'DRAFT',
  });

  const listings = await prisma.cjShopifyUsaListing.updateMany({
    where: {
      userId,
      OR: [
        { shopifyProductId: product.id },
        { shopifyHandle: product.handle },
      ],
    },
    data: {
      status: CJ_SHOPIFY_USA_LISTING_STATUS.PAUSED,
      publishedAt: null,
      lastError: reason,
    },
  });

  await prisma.cjShopifyUsaExecutionTrace.create({
    data: {
      userId,
      step: 'listing.unpublish',
      message: 'listing.unpublish.non_pet_manual_removal',
      meta: {
        productId: product.id,
        legacyResourceId: product.legacyResourceId,
        title: product.title,
        handle: product.handle,
        publicationId: publication.id,
        updatedListings: listings.count,
        reason,
      },
    },
  });

  console.log(JSON.stringify({
    ok: true,
    product,
    publication,
    updatedListings: listings.count,
    reason,
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
