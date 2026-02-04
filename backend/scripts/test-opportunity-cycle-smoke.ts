/**
 * Smoke test for full dropshipping opportunity cycle (real data only - no mocks).
 * Run: npx tsx scripts/test-opportunity-cycle-smoke.ts [keyword]
 */
import opportunityFinder from '../src/services/opportunity-finder.service';

async function main() {
  const keyword = process.argv[2] || 'phone case';
  console.log('[SMOKE] Starting opportunity cycle test, keyword:', keyword);
  try {
    const opportunities = await opportunityFinder.findOpportunities(1, {
      query: keyword,
      maxItems: 5,
      skipTrendsValidation: true,
    });
    const sample = opportunities[0];
    const ok =
      opportunities.length > 0 &&
      sample &&
      sample.title &&
      (sample.costUsd ?? sample.suggestedPriceUsd) > 0 &&
      Array.isArray(sample.images) &&
      sample.images.length > 0 &&
      (sample.roiPercentage ?? (sample.profitMargin ?? 0) * 100) !== undefined;
    console.log('[SMOKE] Result:', {
      success: ok,
      discovered: opportunities.length,
      sampleOpportunity: sample
        ? {
            title: sample.title?.substring(0, 50),
            price: sample.costUsd ?? sample.suggestedPriceUsd,
            imagesLength: sample.images?.length ?? 0,
            profitabilityScore: sample.roiPercentage ?? (sample.profitMargin ?? 0) * 100,
          }
        : null,
    });
    process.exit(ok ? 0 : 1);
  } catch (err: any) {
    console.error('[SMOKE] Failed:', err?.message);
    process.exit(1);
  }
}

main();
