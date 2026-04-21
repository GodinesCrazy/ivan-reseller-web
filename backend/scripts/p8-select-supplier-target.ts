import '../src/config/env';
import { getSupplierTargetSelection } from '../src/services/supplier-target-selection.service';

async function main() {
  const userId = Number(process.argv[2] || process.env.CATALOG_REBUILD_USER_ID || '1');
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Invalid userId');
  }

  const selection = await getSupplierTargetSelection(userId);
  console.log(JSON.stringify(selection, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
