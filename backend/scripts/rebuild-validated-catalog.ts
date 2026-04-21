import catalogRebuildService from '../src/services/catalog-rebuild.service';

function parseArg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const exact = process.argv.find((arg) => arg.startsWith(prefix));
  if (exact) return exact.slice(prefix.length);
  return fallback;
}

async function main() {
  const userId = Number(parseArg('userId', process.env.CATALOG_REBUILD_USER_ID || '1'));
  const query = parseArg('query', process.env.CATALOG_REBUILD_QUERY || 'smart watch') || 'smart watch';
  const country = parseArg('country', process.env.CATALOG_REBUILD_COUNTRY || 'CL') || 'CL';
  const marketplace = (parseArg('marketplace', process.env.CATALOG_REBUILD_MARKETPLACE || 'mercadolibre') || 'mercadolibre') as
    | 'mercadolibre'
    | 'ebay'
    | 'amazon';
  const maxPriceUsd = Number(parseArg('maxPriceUsd', process.env.CATALOG_REBUILD_MAX_PRICE_USD || '20'));
  const maxSearchResults = Number(parseArg('maxSearchResults', process.env.CATALOG_REBUILD_MAX_SEARCH_RESULTS || '20'));
  const maxValidatedProducts = Number(parseArg('maxValidatedProducts', process.env.CATALOG_REBUILD_MAX_VALIDATED_PRODUCTS || '3'));
  const minSupplierSearch = Number(parseArg('minSupplierSearch', process.env.CATALOG_REBUILD_MIN_SUPPLIER_SEARCH || '10'));

  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Invalid userId');
  }

  const result = await catalogRebuildService.searchProductsStrict({
    userId,
    query,
    country,
    marketplace,
    category: 'smartwatch',
    maxPriceUsd,
    maxSearchResults,
    maxValidatedProducts,
    minSupplierSearch,
    environment: 'production',
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
