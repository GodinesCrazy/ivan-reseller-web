import { cjShopifyUsaDiscoverService } from './backend/src/modules/cj-shopify-usa/services/cj-shopify-usa-discover.service';

async function main() {
  const userId = 1;
  const keyword = 'pet supplies';
  const page = 1;
  const pageSize = 20;
  
  console.log(`Searching for "${keyword}"...`);
  try {
    const results = await cjShopifyUsaDiscoverService.search(userId, keyword, page, pageSize);
    console.log(`Success! Found ${results.length} results.`);
  } catch (e) {
    console.error('FAILED with error:', e);
    if (e instanceof Error) {
      console.error('Stack:', e.stack);
    }
  }
}

main();
