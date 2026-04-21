/**
 * p52 — Diagnose shipping config and find correct mode for international dropshipping
 */
import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

const LISTING_ID = 'MLC1913613623';
const USER_ID = 1;

async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(USER_ID, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token };

  // 1. Current item shipping
  const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('\n=== SHIPPING ACTUAL ===');
  console.log(JSON.stringify(item.shipping, null, 2));
  console.log('seller_id:', item.seller_id);

  // 2. User shipping info (what modes the seller account has enabled)
  try {
    const userId = item.seller_id;
    const userShipping = (await axios.get(`https://api.mercadolibre.com/users/${userId}/shipping_preferences`, { headers: h })).data;
    console.log('\n=== USER SHIPPING PREFERENCES ===');
    console.log(JSON.stringify(userShipping, null, 2));
  } catch(e: any) { console.log('\n=== USER SHIPPING PREFS: ===', e?.response?.data?.message || e?.message); }

  // 3. Available shipping modes for the category
  try {
    const catShip = (await axios.get('https://api.mercadolibre.com/categories/MLC3530/shipping', { headers: h })).data;
    console.log('\n=== CATEGORY MLC3530 SHIPPING ===');
    console.log(JSON.stringify(catShip, null, 2));
  } catch(e: any) { console.log('\n=== CAT SHIPPING: ===', e?.response?.status, e?.response?.data?.message || e?.message); }

  // 4. Try updating shipping with different configs and dry-run validation
  const configs = [
    { label: 'me2_handling25', payload: { shipping: { mode: 'me2', free_shipping: false, handling_time: 25 } } },
    { label: 'not_specified', payload: { shipping: { mode: 'not_specified', free_shipping: false, local_pick_up: false } } },
    { label: 'custom_handling25', payload: { shipping: { mode: 'custom', free_shipping: false, handling_time: 25 } } },
  ];

  console.log('\n=== VALIDATE SHIPPING CONFIGS ===');
  for (const cfg of configs) {
    try {
      const vResp = await axios.post(
        `https://api.mercadolibre.com/items/${LISTING_ID}/validate`,
        cfg.payload,
        { headers: { ...h, 'Content-Type': 'application/json' } }
      );
      console.log(`${cfg.label}: ✅ valid (${JSON.stringify(vResp.data).substring(0, 80)})`);
    } catch(e: any) {
      console.log(`${cfg.label}: ❌ ${e?.response?.data?.message || e?.message}`);
    }
  }
}

go().catch(e => console.error(e.response?.data || e.message));
