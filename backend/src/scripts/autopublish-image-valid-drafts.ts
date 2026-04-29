/**
 * Controlled CJ -> Shopify autopublish.
 *
 * Publishes at most one DRAFT listing per product and only when the listing can
 * provide usable image URLs. If draftPayload.images is empty but product.images
 * has valid URLs, the draft is repaired before publish.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const USER_ID = Number(process.env.CJ_SHOPIFY_USA_AUTOPUBLISH_USER_ID || '1');
const BATCH_SIZE = Number(process.env.CJ_SHOPIFY_USA_AUTOPUBLISH_BATCH_SIZE || '10');
const DELAY_BETWEEN_MS = Number(process.env.CJ_SHOPIFY_USA_AUTOPUBLISH_DELAY_MS || '8000');
const DRY_RUN = process.argv.includes('--dry-run') ||
  process.env.DRY_RUN === '1' ||
  process.env.npm_config_dry_run === 'true';

type DraftPayload = Record<string, any>;

function imageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'src' in item) return String((item as { src?: unknown }).src || '');
      if (item && typeof item === 'object' && 'url' in item) return String((item as { url?: unknown }).url || '');
      return '';
    })
    .map((url) => url.trim())
    .filter((url) => /^https?:\/\//i.test(url));
}

function shortMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 180);
}

async function main() {
  const drafts = await prisma.cjShopifyUsaListing.findMany({
    where: {
      userId: USER_ID,
      status: 'DRAFT',
      draftPayload: { not: {} },
    },
    include: {
      product: { select: { id: true, title: true, images: true } },
      variant: { select: { cjSku: true } },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: 400,
  });

  const selected = [];
  const seenProductIds = new Set<number>();
  let skippedNoImages = 0;
  let skippedDuplicateProduct = 0;

  for (const draft of drafts) {
    if (seenProductIds.has(draft.productId)) {
      skippedDuplicateProduct++;
      continue;
    }

    const payload = (draft.draftPayload || {}) as DraftPayload;
    const draftImages = imageUrls(payload.images);
    const productImages = imageUrls(draft.product.images);
    const usableImages = draftImages.length > 0 ? draftImages : productImages;

    if (usableImages.length === 0) {
      skippedNoImages++;
      continue;
    }

    selected.push({ draft, usableImages, needsImageRepair: draftImages.length === 0 });
    seenProductIds.add(draft.productId);
    if (selected.length >= BATCH_SIZE) break;
  }

  console.log(`Mode: ${DRY_RUN ? 'DRY_RUN' : 'EXECUTE'}`);
  console.log(`DRAFT scanned: ${drafts.length}`);
  console.log(`Selected image-valid product drafts: ${selected.length}`);
  console.log(`Skipped no images: ${skippedNoImages}`);
  console.log(`Skipped duplicate product variants: ${skippedDuplicateProduct}`);

  let repaired = 0;
  let published = 0;
  let errors = 0;
  const publishService = DRY_RUN
    ? null
    : (await import('../modules/cj-shopify-usa/services/cj-shopify-usa-publish.service')).cjShopifyUsaPublishService;

  for (const [index, item] of selected.entries()) {
    const payload = (item.draft.draftPayload || {}) as DraftPayload;
    const title = String(payload.title || item.draft.product.title || item.draft.variant?.cjSku || item.draft.id);
    console.log(`[${index + 1}/${selected.length}] listing ${item.draft.id} product ${item.draft.productId}: ${title.slice(0, 70)}`);

    if (DRY_RUN) {
      console.log(`  ready images=${item.usableImages.length} repair=${item.needsImageRepair}`);
      continue;
    }

    try {
      if (item.needsImageRepair) {
        await prisma.cjShopifyUsaListing.update({
          where: { id: item.draft.id },
          data: {
            draftPayload: {
              ...payload,
              images: item.usableImages,
            },
            lastError: null,
          },
        });
        repaired++;
      }

      await publishService!.publishListing({ userId: USER_ID, listingId: item.draft.id });
      published++;
      console.log('  published');
    } catch (error) {
      errors++;
      console.log(`  error: ${shortMessage(error)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_MS));
  }

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    selected: selected.length,
    repaired,
    published,
    errors,
    finishedAt: new Date().toISOString(),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(shortMessage(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
