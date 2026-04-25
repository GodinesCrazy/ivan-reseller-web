/**
 * publish-collections.ts
 * Publishes PawVault pet collections to the Online Store sales channel.
 * Run: npx ts-node scripts/publish-collections.ts
 */

import 'dotenv/config';
import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';
import { prisma } from '../src/config/database';

const USER_ID = 1;
const PET_HANDLES = ['dogs', 'cats', 'grooming', 'toys', 'feeding', 'new-arrivals'];

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  return cjShopifyUsaAdminService.graphql<T>({ userId: USER_ID, query, variables });
}

async function main() {
  console.log('📢 Publishing pet collections to Online Store...\n');

  // Get the Online Store publication ID
  const pubRes = await gql<{
    publications: { edges: Array<{ node: { id: string; name: string } }> };
  }>(`query { publications(first: 10) { edges { node { id name } } } }`);

  const onlineStore = pubRes.publications.edges
    .map(e => e.node)
    .find(p => p.name.toLowerCase().includes('online store'));

  if (!onlineStore) {
    console.log('Available publications:', pubRes.publications.edges.map(e => e.node.name).join(', '));
    throw new Error('Online Store publication not found');
  }

  console.log(`Online Store publication: ${onlineStore.id}\n`);

  for (const handle of PET_HANDLES) {
    process.stdout.write(`  → ${handle}... `);

    // Get collection ID
    const colRes = await gql<{ collectionByHandle?: { id: string; title: string } | null }>(
      `query($h: String!) { collectionByHandle(handle: $h) { id title } }`,
      { h: handle },
    );

    const col = colRes.collectionByHandle;
    if (!col) { console.log('not found ⚠️'); continue; }

    // Publish to Online Store
    const pubRes2 = await gql<{
      publishablePublish: { userErrors: { message: string }[] };
    }>(
      `mutation Publish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { message }
        }
      }`,
      {
        id: col.id,
        input: [{ publicationId: onlineStore.id }],
      },
    );

    const errs = pubRes2.publishablePublish.userErrors;
    if (errs.length) console.log(`⚠️  ${errs[0].message}`);
    else console.log(`✓ ${col.title} published`);

    await new Promise(r => setTimeout(r, 400));
  }

  console.log('\n✅ Done! Collections are now live on the storefront.');
}

main()
  .catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
