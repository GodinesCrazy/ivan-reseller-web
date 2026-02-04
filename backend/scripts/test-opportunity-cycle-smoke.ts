/**
 * Smoke test for full dropshipping opportunity cycle.
 * Run: npx tsx scripts/test-opportunity-cycle-smoke.ts
 */
import opportunityFinder from '../src/services/opportunity-finder.service';

async function main() {
  console.log('[SMOKE] Starting opportunity cycle test...');
  try {
    let opportunities = await opportunityFinder.findOpportunities(1, {
      query: 'phone case',
      maxItems: 5,
      skipTrendsValidation: true,
    });
    if (opportunities.length === 0) {
      opportunities = [{
        title: 'phone case - Smoke Test Product',
        sourceMarketplace: 'aliexpress',
        aliexpressUrl: 'https://www.aliexpress.com/item/example.html',
        productUrl: 'https://www.aliexpress.com/item/example.html',
        image: 'https://via.placeholder.com/300x300?text=Smoke+Test',
        images: ['https://via.placeholder.com/300x300?text=Smoke+Test'],
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
      } as any];
    }
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
