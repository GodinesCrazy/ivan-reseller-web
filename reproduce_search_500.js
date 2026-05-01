const { PrismaClient } = require('@prisma/client');
const { createCjSupplierAdapter } = require('./backend/dist/modules/cj-ebay/adapters/cj-supplier.adapter');

async function main() {
  const userId = 1;
  const adapter = createCjSupplierAdapter(userId);
  
  console.log('Searching for "pet supplies"...');
  try {
    const results = await adapter.searchProducts({
      keyword: 'pet supplies',
      page: 1,
      pageSize: 20
    });
    console.log(`Success! Found ${results.length} results.`);
  } catch (e) {
    console.error('FAILED with error:', e);
  }
}

main();
