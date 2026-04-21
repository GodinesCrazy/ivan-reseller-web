import '../src/config/env';
import { getAlibabaSupplierCapability } from '../src/services/alibaba-supplier-capability.service';

async function main() {
  const userId = Number(process.argv[2] || process.env.CATALOG_REBUILD_USER_ID || '1');
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Invalid userId');
  }

  const capability = await getAlibabaSupplierCapability(userId);
  console.log(JSON.stringify(capability, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
