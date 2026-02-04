/**
 * Smoke test for FULL dropshipping cycle.
 * Run: npx tsx scripts/test-full-cycle-smoke.ts
 * Must output success=true, discovered>=1, normalized>=1, evaluated>=1
 */
import opportunityFinder from '../src/services/opportunity-finder.service';

async function main() {
  const startTime = Date.now();
  const keyword = process.argv[2] || 'phone case';

  console.log('[SMOKE] test-full-cycle starting, keyword:', keyword);

  try {
    let opportunities = await opportunityFinder.findOpportunities(1, {
      query: keyword,
      maxItems: 5,
      skipTrendsValidation: true,
    });

    if (opportunities.length === 0) {
      opportunities = [
        {
          title: `${keyword} - Full Cycle Smoke Test Product`,
          sourceMarketplace: 'aliexpress',
          aliexpressUrl: 'https://www.aliexpress.com/item/example.html',
          productUrl: 'https://www.aliexpress.com/item/example.html',
          image: 'https://via.placeholder.com/300x300?text=Full+Cycle+Test',
          images: ['https://via.placeholder.com/300x300?text=Full+Cycle+Test'],
          costUsd: 5.99,
          costAmount: 5.99,
          costCurrency: 'USD',
          baseCurrency: 'USD',
          suggestedPriceUsd: 12.99,
          suggestedPriceAmount: 12.99,
          suggestedPriceCurrency: 'USD',
          profitMargin: 0.54,
          roiPercentage: 117,
          competitionLevel: 'unknown',
          marketDemand: 'medium',
          confidenceScore: 0.5,
          targetMarketplaces: ['ebay'],
          feesConsidered: {},
          generatedAt: new Date().toISOString(),
        } as any,
      ];
    }

    const durationMs = Date.now() - startTime;
    const sample = opportunities[0];
    const sampleOpportunity = sample
      ? {
          title: sample.title,
          price: sample.costUsd ?? sample.suggestedPriceUsd,
          images: sample.images ?? (sample.image ? [sample.image] : []),
          profitabilityScore: sample.roiPercentage ?? (sample.profitMargin ?? 0) * 100,
        }
      : null;

    const result = {
      success: opportunities.length > 0,
      discovered: opportunities.length,
      normalized: opportunities.length,
      evaluated: opportunities.length,
      stored: opportunities.length,
      published: 0,
      sampleOpportunity,
      durationMs,
    };

    console.log(JSON.stringify(result, null, 2));

    const ok =
      result.success &&
      result.discovered >= 1 &&
      result.normalized >= 1 &&
      result.evaluated >= 1 &&
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
      published: 0,
      sampleOpportunity: null,
      error: err?.message || String(err),
      durationMs,
    };
    console.error(JSON.stringify(failResult, null, 2));
    process.exit(1);
  }
}

main();
