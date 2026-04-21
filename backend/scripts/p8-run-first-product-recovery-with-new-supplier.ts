import '../src/config/env';
import { runFirstProductRecoveryWithSupplierStrategy } from '../src/services/first-product-supplier-recovery.service';

async function main() {
  const userId = Number(process.argv[2] || process.env.CATALOG_REBUILD_USER_ID || '1');
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Invalid userId');
  }

  const result = await runFirstProductRecoveryWithSupplierStrategy({
    userId,
    maxPriceUsd: 20,
    maxSearchResults: 5,
    minSupplierSearch: 5,
    environment: 'production',
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
