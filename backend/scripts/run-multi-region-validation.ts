import multiRegionValidationService, {
  P6_FIRST_PRODUCT_RECOVERY_QUERIES,
} from '../src/services/multi-region-validation.service';

function parseArg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const exact = process.argv.find((arg) => arg.startsWith(prefix));
  if (exact) return exact.slice(prefix.length);
  return fallback;
}

async function main() {
  const userId = Number(parseArg('userId', process.env.CATALOG_REBUILD_USER_ID || '1'));
  const maxPriceUsd = Number(parseArg('maxPriceUsd', process.env.CATALOG_REBUILD_MAX_PRICE_USD || '20'));
  const maxSearchResults = Number(parseArg('maxSearchResults', process.env.CATALOG_REBUILD_MAX_SEARCH_RESULTS || '20'));
  const minSupplierSearch = Number(parseArg('minSupplierSearch', process.env.CATALOG_REBUILD_MIN_SUPPLIER_SEARCH || '10'));
  const rawQueries =
    parseArg(
      'queries',
      process.env.MULTI_REGION_VALIDATION_QUERIES ||
        P6_FIRST_PRODUCT_RECOVERY_QUERIES.join('|')
    ) || P6_FIRST_PRODUCT_RECOVERY_QUERIES.join('|');
  const rawMarketplaces =
    parseArg('marketplaces', process.env.MULTI_REGION_VALIDATION_MARKETPLACES || 'mercadolibre|ebay') ||
    'mercadolibre|ebay';

  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Invalid userId');
  }

  const queries = rawQueries
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  const marketplaces = rawMarketplaces
    .split('|')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean) as Array<'mercadolibre' | 'ebay' | 'amazon'>;
  const enableAlternativeProductFallback = ['1', 'true', 'yes'].includes(
    String(
      parseArg(
        'enableAlternativeProductFallback',
        process.env.MULTI_REGION_ENABLE_ALIEXPRESS_ALTERNATIVE_PRODUCT || '0'
      ) || '0'
    )
      .trim()
      .toLowerCase()
  );

  if (queries.length === 0) {
    throw new Error('At least one query is required');
  }
  if (marketplaces.length === 0) {
    throw new Error('At least one marketplace is required');
  }

  const result = await multiRegionValidationService.runMultiRegionValidation({
    userId,
    marketplaces,
    queries,
    maxPriceUsd,
    maxSearchResults,
    minSupplierSearch,
    environment: 'production',
    enableAlternativeProductFallback,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
