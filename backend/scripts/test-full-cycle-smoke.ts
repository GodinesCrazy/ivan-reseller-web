/**
 * Smoke test for FULL dropshipping cycle (real data only - no mocks).
 * Run: npx tsx scripts/test-full-cycle-smoke.ts [keyword]
 * Exits 0 if success=true, 1 otherwise.
 */
import opportunityFinder from '../src/services/opportunity-finder.service';

async function main() {
  const startTime = Date.now();
  const keyword = process.argv[2] || 'phone case';

  console.log('[SMOKE] test-full-cycle starting, keyword:', keyword);

  try {
    const result = await opportunityFinder.findOpportunitiesWithDiagnostics(1, {
      query: keyword,
      maxItems: 5,
      skipTrendsValidation: true,
    });

    const durationMs = Date.now() - startTime;
    const sample = result.opportunities[0];
    const sampleOpportunity = sample
      ? {
          title: sample.title,
          price: sample.costUsd ?? sample.suggestedPriceUsd,
          images: sample.images ?? (sample.image ? [sample.image] : []),
          profitabilityScore: sample.roiPercentage ?? (sample.profitMargin ?? 0) * 100,
        }
      : null;

    const output = {
      success: result.success,
      discovered: result.diagnostics?.discovered ?? 0,
      normalized: result.diagnostics?.normalized ?? 0,
      evaluated: result.opportunities.length,
      stored: result.opportunities.length,
      sampleOpportunity: result.success ? sampleOpportunity : null,
      durationMs,
      diagnostics: result.diagnostics,
    };

    console.log(JSON.stringify(output, null, 2));

    const ok =
      result.success &&
      (result.diagnostics?.discovered ?? 0) >= 1 &&
      (result.diagnostics?.normalized ?? 0) >= 1 &&
      result.opportunities.length >= 1 &&
      sampleOpportunity &&
      sampleOpportunity.title &&
      typeof sampleOpportunity.price === 'number' &&
      Array.isArray(sampleOpportunity.images) &&
      sampleOpportunity.images.length > 0;

    process.exit(ok ? 0 : 1);
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const failResult = {
      success: false,
      discovered: 0,
      normalized: 0,
      evaluated: 0,
      stored: 0,
      sampleOpportunity: null,
      error: err?.message || String(err),
      durationMs,
    };
    console.error(JSON.stringify(failResult, null, 2));
    process.exit(1);
  }
}

main();
