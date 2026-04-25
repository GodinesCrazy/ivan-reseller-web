/**
 * cleanup-collections.ts
 * Archives non-pet collections that don't belong in PawVault.
 * Run: npx ts-node scripts/cleanup-collections.ts
 */

import 'dotenv/config';
import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';
import { prisma } from '../src/config/database';

const USER_ID = 1;

const NON_PET_HANDLES = [
  'desk-workspace-upgrades',
  'electronics-and-accessories-example-products',
  'ivan-reseller-featured-edit',
  'smart-everyday-accessories',
  'travel-comfort-organizers',
  'pagina-de-inicio',
];

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  return cjShopifyUsaAdminService.graphql<T>({ userId: USER_ID, query, variables });
}

async function main() {
  console.log('🧹 Cleaning up non-pet collections...\n');

  for (const handle of NON_PET_HANDLES) {
    process.stdout.write(`  → ${handle}... `);
    const res = await gql<{ collectionByHandle?: { id: string; productsCount: { count: number } } | null }>(
      `query($h: String!) { collectionByHandle(handle: $h) { id productsCount { count } } }`,
      { h: handle },
    );
    const col = res.collectionByHandle;
    if (!col) { console.log('not found'); continue; }

    // Delete the collection
    const del = await gql<{ collectionDelete: { userErrors: { message: string }[] } }>(
      `mutation Delete($id: ID!) { collectionDelete(input: { id: $id }) { userErrors { message } } }`,
      { id: col.id },
    );
    const errs = del.collectionDelete.userErrors;
    if (errs.length) console.log(`⚠️  ${errs[0].message}`);
    else console.log('deleted ✓');

    await new Promise(r => setTimeout(r, 400));
  }

  console.log('\n✅ Cleanup complete.');
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
