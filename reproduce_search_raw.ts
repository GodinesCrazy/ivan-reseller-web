import { createCjSupplierAdapter } from './backend/src/modules/cj-ebay/adapters/cj-supplier.adapter';

async function main() {
  const userId = 1;
  const adapter = createCjSupplierAdapter(userId);
  
  console.log('Searching for "pet supplies"...');
  try {
    // @ts-ignore - access private client for raw data
    const token = await adapter.ensureAccessToken();
    // @ts-ignore
    const data = await adapter.client.getWithAccessToken(token, 'product/listV2?page=1&size=5&keyWord=pet+supplies');
    console.log('RAW DATA:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('FAILED with error:', e);
  }
}

main();
