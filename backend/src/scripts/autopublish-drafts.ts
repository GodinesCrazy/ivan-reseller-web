/**
 * Autopublish script — publishes DRAFT listings to Shopify.
 * Respects pet-only policy, max price $45, min margin 12%, min stock 1.
 * Run: npx ts-node --project tsconfig.json src/scripts/autopublish-drafts.ts
 */
import { PrismaClient } from '@prisma/client';
import { cjShopifyUsaPublishService } from '../modules/cj-shopify-usa/services/cj-shopify-usa-publish.service';

const prisma = new PrismaClient();
const USER_ID = 1;
const BATCH_SIZE = 40;          // max per run
const DELAY_BETWEEN_MS = 8000;  // 8s between publishes — stay safe with CJ rate limits

async function main() {
  const drafts = await prisma.cjShopifyUsaListing.findMany({
    where: {
      status: 'DRAFT',
      userId: USER_ID,
      draftPayload: { not: {} },
    },
    orderBy: { updatedAt: 'desc' },
    take: BATCH_SIZE,
    select: { id: true, shopifyHandle: true, draftPayload: true },
  });

  console.log(`Found ${drafts.length} DRAFT listings to publish`);
  let published = 0, skipped = 0, errors = 0;

  for (const draft of drafts) {
    const payload = draft.draftPayload as Record<string, any> | null;
    const title = payload?.title || '';
    process.stdout.write(`  [${published + skipped + errors + 1}/${drafts.length}] ${title.slice(0, 50)}... `);

    try {
      await cjShopifyUsaPublishService.publishListing({ userId: USER_ID, listingId: draft.id });
      console.log('✓ PUBLISHED');
      published++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('stock') || msg.includes('price') || msg.includes('pet') || msg.includes('margin')) {
        console.log(`⚠ SKIP (${msg.slice(0, 60)})`);
        skipped++;
      } else {
        console.log(`✗ ERROR: ${msg.slice(0, 80)}`);
        errors++;
      }
    }

    await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS));
  }

  console.log(`\nDone — ${published} published, ${skipped} skipped, ${errors} errors`);
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
