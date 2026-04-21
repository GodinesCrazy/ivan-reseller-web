import { prisma } from '../src/config/database';
import { ProductService } from '../src/services/product.service';
import { reconcileProductTruth } from '../src/services/operational-truth.service';

async function collectCounts() {
  const [productByStatus, activeListings, failedPublishArtifacts, legacyLinkedListings] = await Promise.all([
    prisma.product.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.marketplaceListing.count({
      where: {
        status: 'active',
        product: {
          status: 'PUBLISHED',
          targetCountry: { not: null },
          aliexpressSku: { not: null },
          shippingCost: { not: null },
          totalCost: { not: null },
        },
      },
    }),
    prisma.marketplaceListing.count({
      where: { status: 'failed_publish' },
    }),
    prisma.marketplaceListing.count({
      where: {
        product: { status: 'LEGACY_UNVERIFIED' },
        status: { not: 'archived_legacy_artifact' },
      },
    }),
  ]);

  return {
    productByStatus,
    activeListings,
    failedPublishArtifacts,
    legacyLinkedListings,
  };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const productService = new ProductService();

  const candidates = await prisma.product.findMany({
    where: {
      status: { in: ['APPROVED', 'LEGACY_UNVERIFIED', 'PUBLISHED'] as string[] },
    },
    include: {
      marketplaceListings: {
        select: {
          status: true,
          listingId: true,
          publishedAt: true,
        },
      },
    },
  });

  const reconciliationPlan = candidates.map((candidate) => {
    const reconciled = reconcileProductTruth(candidate as any);
    return {
      id: candidate.id,
      userId: candidate.userId,
      title: candidate.title,
      fromStatus: candidate.status,
      fromIsPublished: candidate.isPublished,
      toStatus: reconciled.nextStatus,
      toIsPublished: reconciled.nextIsPublished,
      reason: reconciled.truthReason,
      activeVerifiedListingCount: reconciled.activeVerifiedListingCount,
      hasMachineVerifiableContext: reconciled.hasMachineVerifiableContext,
      requiresChange:
        candidate.status !== reconciled.nextStatus ||
        candidate.isPublished !== reconciled.nextIsPublished,
    };
  });

  const before = await collectCounts();
  let executionSummary: any = {
    statusReconciliation: { scanned: reconciliationPlan.length, changed: 0 },
    legacyListingArchival: { changed: 0 },
  };

  if (execute) {
    const toLegacyIds = reconciliationPlan
      .filter((item) => item.requiresChange && item.toStatus === 'LEGACY_UNVERIFIED')
      .map((item) => item.id);
    const toValidatedReadyIds = reconciliationPlan
      .filter((item) => item.requiresChange && item.toStatus === 'VALIDATED_READY')
      .map((item) => item.id);
    const toPublishedIds = reconciliationPlan
      .filter((item) => item.requiresChange && item.toStatus === 'PUBLISHED')
      .map((item) => item.id);

    const [legacyResult, validatedReadyResult, publishedResult] = await Promise.all([
      toLegacyIds.length > 0
        ? prisma.product.updateMany({
            where: { id: { in: toLegacyIds } },
            data: {
              status: 'LEGACY_UNVERIFIED',
              isPublished: false,
              publishedAt: null,
            },
          })
        : Promise.resolve({ count: 0 }),
      toValidatedReadyIds.length > 0
        ? prisma.product.updateMany({
            where: { id: { in: toValidatedReadyIds } },
            data: {
              status: 'VALIDATED_READY',
              isPublished: false,
              publishedAt: null,
            },
          })
        : Promise.resolve({ count: 0 }),
      toPublishedIds.length > 0
        ? prisma.product.updateMany({
            where: { id: { in: toPublishedIds } },
            data: {
              status: 'PUBLISHED',
              isPublished: true,
            },
          })
        : Promise.resolve({ count: 0 }),
    ]);

    const statusSummary = {
      scanned: reconciliationPlan.length,
      normalizedToLegacy: legacyResult.count,
      normalizedToValidatedReady: validatedReadyResult.count,
      normalizedToPublished: publishedResult.count,
      unchanged: reconciliationPlan.filter((item) => !item.requiresChange).length,
    };
    const archivedLegacyListings = await prisma.marketplaceListing.updateMany({
      where: {
        product: { status: 'LEGACY_UNVERIFIED' },
        status: { not: 'archived_legacy_artifact' },
      },
      data: {
        status: 'archived_legacy_artifact',
        lastReconciledAt: new Date(),
      },
    });

    executionSummary = {
      statusReconciliation: statusSummary,
      legacyListingArchival: { changed: archivedLegacyListings.count },
    };
  }

  const after = await collectCounts();

  console.log(
    JSON.stringify(
      {
        mode: execute ? 'execute' : 'dry-run',
        before,
        executionSummary,
        after,
        reconciliationPreview: reconciliationPlan.slice(0, 25),
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
