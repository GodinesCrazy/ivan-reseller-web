/**
 * Log raw API response for affiliate search (debug)
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  const { aliexpressAffiliateAPIService } = await import('../src/services/aliexpress-affiliate-api.service');
  const data = await aliexpressAffiliateAPIService.debugSearchRaw({
    keywords: 'phone case',
    page_no: '1',
    page_size: '5',
    target_currency: 'USD',
    target_language: 'EN',
    ship_to_country: 'US',
    fields: 'product_id,product_title,sale_price,product_detail_url,promotion_link',
  });
  console.log('RAW RESPONSE:', JSON.stringify(data, null, 2));
}

run().catch(console.error);
