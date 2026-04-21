import '../src/config/env';
import { createCjMlChileSupplierAdapter } from '../src/modules/cj-ml-chile/adapters/cj-ml-chile-supplier.adapter';
import { rankMlChileSearchResults } from '../src/modules/cj-ml-chile/services/cj-ml-chile-search-ranking';
import {
  probeProductChileLocalStock,
  seedMlChileSearchCandidate,
} from '../src/modules/cj-ml-chile/services/cj-ml-chile-local-stock.service';

const DEFAULT_QUERIES = [
  'wireless earbuds',
  'earbuds',
  'smartphone holder',
  'charger',
  'phone case',
  'ring',
];

const PAGE_SIZE = 12;
const VERIFY_LIMIT = 6;
const USER_ID = Number(process.env.CJ_VALIDATION_USER_ID || 1);

type StrongStatus = 'chile_local' | 'global_only' | 'stock_unknown' | 'out_of_stock' | 'error';

async function oldFastVerify(
  adapter: ReturnType<typeof createCjMlChileSupplierAdapter>,
  productIds: string[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  for (const productId of productIds) {
    try {
      const variants = await adapter.getVariantsForProduct(productId);
      result.set(productId, variants.some((variant) => variant.stock > 0));
    } catch {
      result.set(productId, false);
    }
  }
  return result;
}

async function strongVerify(
  adapter: ReturnType<typeof createCjMlChileSupplierAdapter>,
  productIds: string[]
): Promise<Map<string, StrongStatus>> {
  const result = new Map<string, StrongStatus>();
  for (const productId of productIds) {
    try {
      const probe = await probeProductChileLocalStock(adapter, productId, 1);
      result.set(productId, probe.localStockStatus);
    } catch {
      result.set(productId, 'error');
    }
  }
  return result;
}

async function analyzeQuery(
  adapter: ReturnType<typeof createCjMlChileSupplierAdapter>,
  query: string
) {
  const rawItems = await adapter.searchProducts({ keyword: query, page: 1, pageSize: PAGE_SIZE });

  const beforeRanked = rankMlChileSearchResults(query, rawItems).rankedItems;
  const beforeVerifyCandidates = beforeRanked
    .filter((item) => item.operabilityStatus === 'stock_unknown')
    .slice(0, VERIFY_LIMIT)
    .map((item) => item.cjProductId);
  const beforeVerify = await oldFastVerify(adapter, beforeVerifyCandidates);
  const beforeReady = beforeRanked.filter(
    (item) => item.operabilityStatus === 'operable' || beforeVerify.get(item.cjProductId) === true
  );

  const seededItems = rawItems.map(seedMlChileSearchCandidate);
  const afterRanked = rankMlChileSearchResults(query, seededItems).rankedItems;
  const afterVerifyCandidates = afterRanked
    .filter((item) => item.operabilityStatus === 'stock_unknown')
    .slice(0, VERIFY_LIMIT)
    .map((item) => item.cjProductId);
  const afterVerify = await strongVerify(adapter, afterVerifyCandidates);
  const afterReady = afterRanked.filter(
    (item) => item.operabilityStatus === 'operable' || afterVerify.get(item.cjProductId) === 'chile_local'
  );

  const truthProductIds = Array.from(
    new Set([
      ...beforeReady.map((item) => item.cjProductId),
      ...afterReady.map((item) => item.cjProductId),
    ])
  );
  const truthMap = await strongVerify(adapter, truthProductIds);

  const beforeFalsePositives = beforeReady.filter(
    (item) => truthMap.get(item.cjProductId) !== 'chile_local'
  );
  const afterFalsePositives = afterReady.filter(
    (item) => truthMap.get(item.cjProductId) !== 'chile_local'
  );

  const beforeRealReady = beforeReady.filter(
    (item) => truthMap.get(item.cjProductId) === 'chile_local'
  );
  const afterRealReady = afterReady.filter(
    (item) => truthMap.get(item.cjProductId) === 'chile_local'
  );

  return {
    query,
    rawCount: rawItems.length,
    searchTop: rawItems.slice(0, 5).map((item) => ({
      cjProductId: item.cjProductId,
      title: item.title.slice(0, 120),
      inventoryTotal: item.inventoryTotal ?? null,
    })),
    before: {
      operabilitySummary: {
        operable: beforeRanked.filter((item) => item.operabilityStatus === 'operable').length,
        stockUnknown: beforeRanked.filter((item) => item.operabilityStatus === 'stock_unknown').length,
        unavailable: beforeRanked.filter((item) => item.operabilityStatus === 'unavailable').length,
      },
      fastVerify: beforeVerifyCandidates.map((productId) => ({
        cjProductId: productId,
        hasStockByVariantQuery: beforeVerify.get(productId) === true,
      })),
      mainFlowCount: beforeReady.length,
      falsePositives: beforeFalsePositives.length,
      chileUsableReady: beforeRealReady.length,
      mainFlowTop: beforeReady.slice(0, 5).map((item) => ({
        cjProductId: item.cjProductId,
        title: item.title.slice(0, 120),
        localTruth: truthMap.get(item.cjProductId) ?? 'unknown',
      })),
    },
    after: {
      operabilitySummary: {
        operable: afterRanked.filter((item) => item.operabilityStatus === 'operable').length,
        stockUnknown: afterRanked.filter((item) => item.operabilityStatus === 'stock_unknown').length,
        unavailable: afterRanked.filter((item) => item.operabilityStatus === 'unavailable').length,
      },
      fastVerify: afterVerifyCandidates.map((productId) => ({
        cjProductId: productId,
        localStockStatus: afterVerify.get(productId) ?? 'unknown',
      })),
      mainFlowCount: afterReady.length,
      falsePositives: afterFalsePositives.length,
      chileUsableReady: afterRealReady.length,
      mainFlowTop: afterReady.slice(0, 5).map((item) => ({
        cjProductId: item.cjProductId,
        title: item.title.slice(0, 120),
        localTruth: truthMap.get(item.cjProductId) ?? item.localStockStatus ?? 'unknown',
      })),
    },
  };
}

async function main() {
  const adapter = createCjMlChileSupplierAdapter(USER_ID);
  const queries = process.argv.slice(2).filter(Boolean);
  const effectiveQueries = queries.length > 0 ? queries : DEFAULT_QUERIES;
  const rows = [];

  for (const query of effectiveQueries) {
    rows.push(await analyzeQuery(adapter, query));
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        userId: USER_ID,
        pageSize: PAGE_SIZE,
        verifyLimit: VERIFY_LIMIT,
        rows,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('[validate-cj-ml-chile-local-stock-parity] failed', error);
  process.exit(1);
});
