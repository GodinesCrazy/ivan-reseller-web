import '../src/config/env';
import {
  getSupplierCapabilityInventory,
  selectSupplierStrategyForFirstValidatedProduct,
} from '../src/services/supplier-capability-inventory.service';

async function main() {
  const userId = Number(process.argv[2] || process.env.CATALOG_REBUILD_USER_ID || '1');
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Invalid userId');
  }

  const inventory = await getSupplierCapabilityInventory(userId);
  const decision = selectSupplierStrategyForFirstValidatedProduct(inventory, {
    scanned: 65,
    validated: 0,
    rejectionSummaryByCode: {
      no_stock_for_destination: 40,
      margin_invalid: 20,
      supplier_unavailable: 5,
    },
  });

  console.log(
    JSON.stringify(
      {
        userId,
        inventory,
        decision,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
