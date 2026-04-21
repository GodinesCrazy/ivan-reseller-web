/**
 * p50 — Diagnose ML rejection: full item inspection + health endpoint + pictures quality
 */
import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

const LISTING_ID = 'MLC3838127822';

async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token };

  // 1. Full item
  const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('\n=== ITEM STATUS ===');
  console.log(JSON.stringify({
    status: item.status,
    sub_status: item.sub_status,
    health: item.health,
    catalog_listing: item.catalog_listing,
    catalog_product_id: item.catalog_product_id,
    listing_type_id: item.listing_type_id,
    category_id: item.category_id,
  }, null, 2));

  // 2. Pictures quality
  console.log('\n=== PICTURES ===');
  console.log(JSON.stringify(item.pictures?.map((p: any) => ({
    id: p.id, max_size: p.max_size, quality: p.quality, url: p.url
  })), null, 2));

  // 3. Try health endpoint
  try {
    const health = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}/health`, { headers: h })).data;
    console.log('\n=== HEALTH ===');
    console.log(JSON.stringify(health, null, 2));
  } catch(e: any) { console.log('\n=== HEALTH: not available ===', e?.response?.status); }

  // 4. Try catalog listing details
  try {
    const desc = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}/description`, { headers: h })).data;
    console.log('\n=== DESCRIPTION (ok if empty) ===', desc?.plain_text?.substring(0, 80));
  } catch(e: any) {}

  // 5. Try moderations endpoint
  try {
    const mod = (await axios.get(`https://api.mercadolibre.com/moderations/items/${LISTING_ID}`, { headers: h })).data;
    console.log('\n=== MODERATIONS ===');
    console.log(JSON.stringify(mod, null, 2));
  } catch(e: any) { console.log('\n=== MODERATIONS: not accessible ===', e?.response?.data?.message || e?.response?.status); }

  // 6. Try forbidden endpoint to understand what "forbidden" sub_status means
  try {
    const r = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}/forbidden`, { headers: h })).data;
    console.log('\n=== FORBIDDEN INFO ===');
    console.log(JSON.stringify(r, null, 2));
  } catch(e: any) { console.log('\n=== FORBIDDEN: not accessible ===', e?.response?.data?.message || e?.response?.status); }

  // 7. Check user restrictions
  try {
    const mlUser = (item as any).seller_id;
    if (mlUser) {
      const userInfo = (await axios.get(`https://api.mercadolibre.com/users/${mlUser}/items/restrictions`, { headers: h })).data;
      console.log('\n=== USER RESTRICTIONS ===');
      console.log(JSON.stringify(userInfo, null, 2));
    }
  } catch(e: any) { console.log('\n=== USER RESTRICTIONS: not accessible ===', e?.response?.data?.message || e?.response?.status); }
}

go().catch(e => console.error(e.response?.data || e.message));
