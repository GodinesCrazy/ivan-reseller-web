import '../src/config/env';

function withMutedOutput<T>(fn: () => Promise<T>): Promise<T> {
  const originalStdout = process.stdout.write.bind(process.stdout);
  const originalStderr = process.stderr.write.bind(process.stderr);
  const mutedWrite = (() => true) as typeof process.stdout.write;

  process.stdout.write = mutedWrite;
  process.stderr.write = mutedWrite;

  const restore = () => {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  };

  return fn().finally(restore);
}

async function main() {
  const [{ default: multiRegionValidationService }, { prisma }] = await Promise.all([
    import('../src/services/multi-region-validation.service'),
    import('../src/config/database'),
  ]);

  const result = await withMutedOutput(() =>
    multiRegionValidationService.runMultiRegionValidation({
      userId: 1,
      marketplaces: ['ebay'],
      queries: [
        'adhesive cable clips',
        'silicone cable ties',
        'webcam cover',
        'screen cleaning cloth',
        'adhesive wall hook',
      ],
      maxPriceUsd: 20,
      maxSearchResults: 5,
      minSupplierSearch: 5,
      environment: 'production',
      enableAlternativeProductFallback: true,
    })
  );

  const validatedCounts = await prisma.product.groupBy({
    by: ['status'],
    _count: { _all: true },
    where: {
      userId: 1,
      status: { in: ['VALIDATED_READY', 'LEGACY_UNVERIFIED', 'PENDING', 'REJECTED'] as any },
    },
  });

  const marketplaceResult = result.marketplaceResults[0];
  console.log(
    JSON.stringify(
      {
        stopReason: result.stopReason,
        firstValidatedProduct: result.firstValidatedProduct,
        marketplace: marketplaceResult
          ? {
              marketplace: marketplaceResult.marketplace,
              scanned: marketplaceResult.scanned,
              rejected: marketplaceResult.rejected,
              validated: marketplaceResult.validated,
              nearValid: marketplaceResult.nearValidProducts.length,
              rejectionSummaryByCode: marketplaceResult.rejectionSummaryByCode,
              blockingIssues: marketplaceResult.blockingIssues,
              bestNearValidCandidate: marketplaceResult.nearValidProducts[0] || null,
            }
          : null,
        validatedCounts,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('../src/config/database');
    await prisma.$disconnect();
  });
