import { createCjSupplierAdapter } from './backend/src/modules/cj-ebay/adapters/cj-supplier.adapter';

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
    console.log(JSON.stringify(results.slice(0, 2), null, 2));
  } catch (e) {
    console.error('FAILED with error:', e);
  }
}

main();
