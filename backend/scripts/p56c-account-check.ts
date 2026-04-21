import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

(async () => {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token };

  // Listings activos
  for (const id of ['MLC1913646427', 'MLC1913646221', 'MLC1913623551']) {
    try {
      const item = (await axios.get(`https://api.mercadolibre.com/items/${id}`, { headers: h })).data;
      console.log(`${id}: ${item.status} ${JSON.stringify(item.sub_status)} mode=${item.shipping?.mode} ht=${item.shipping?.handling_time || 'none'}`);
    } catch(e: any) { console.log(`${id}: ERROR ${e?.response?.status}`); }
  }

  // Account info
  const me = (await axios.get('https://api.mercadolibre.com/users/me', { headers: h })).data;
  console.log('\nACCOUNT:', me.id, me.nickname, '| status:', me.status);
  console.log('seller_reputation:', JSON.stringify(me.seller_reputation?.level_id));

  // Shipping settings del vendedor
  try {
    const settings = (await axios.get(`https://api.mercadolibre.com/users/${me.id}/shipping_modes?site_id=MLC`, { headers: h })).data;
    console.log('\nshipping_modes:', JSON.stringify(settings, null, 2));
  } catch(e: any) {
    console.log('shipping_modes error:', e?.response?.data?.message || e?.message);
  }

  // Mandatory settings
  try {
    const ms = (await axios.get(`https://api.mercadolibre.com/users/${me.id}/mandatory_shipping_setting`, { headers: h })).data;
    console.log('\nmandatory_shipping_setting:', JSON.stringify(ms, null, 2));
  } catch(e: any) {
    console.log('mandatory_shipping_setting:', e?.response?.data?.message || e?.message);
  }

  // Ver si hay configuración de handling time a nivel cuenta
  try {
    const htime = (await axios.get(`https://api.mercadolibre.com/users/${me.id}/shipping_preferences`, { headers: h })).data;
    console.log('\nshipping_preferences:', JSON.stringify(htime, null, 2));
  } catch(e: any) {
    console.log('shipping_preferences:', e?.response?.data?.message || e?.message);
  }
})().catch(e => { console.error('FATAL:', e?.response?.data || e?.message); process.exit(1); });
