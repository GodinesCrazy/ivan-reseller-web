/**
 * p56e — Último intento de encontrar API para dispatch time
 *         + verificar que el listing activo esté correcto
 */
import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const me = (await axios.get('https://api.mercadolibre.com/users/me', { headers: h })).data;
  const uid = me.id;

  // Intentar endpoint de despacho/manejo del Seller Center
  const endpoints: any[] = [
    { label: 'GET selling_settings', url: `https://api.mercadolibre.com/users/${uid}/selling_settings` },
    { label: 'GET shipping_options', url: `https://api.mercadolibre.com/users/${uid}/shipping_options` },
    { label: 'GET me2_options', url: `https://api.mercadolibre.com/users/${uid}/mercadoenvios/options` },
    { label: 'GET seller_settings', url: `https://api.mercadolibre.com/users/${uid}/seller_settings` },
  ];

  for (const ep of endpoints) {
    try {
      const r = await axios.get(ep.url, { headers: h });
      const data = JSON.stringify(r.data);
      if (data.toLowerCase().includes('handling') || data.toLowerCase().includes('dispatch') || data.toLowerCase().includes('despacho') || data.toLowerCase().includes('plazo')) {
        console.log(`\n✅ ${ep.label} → TIENE handling info:`);
        console.log(data.slice(0, 600));
      } else {
        console.log(`${ep.label} → 200 OK, no contiene handling`);
      }
    } catch(e: any) {
      console.log(`${ep.label} → ${e?.response?.status || 'err'}: ${e?.response?.data?.message?.slice(0, 80) || e?.message?.slice(0, 80)}`);
    }
  }

  // Estado final del listing activo
  const item = (await axios.get('https://api.mercadolibre.com/items/MLC1913646427', { headers: h })).data;
  console.log('\n=== LISTING ACTIVO MLC1913646427 ===');
  console.log('status:', item.status, item.sub_status);
  console.log('mode:', item.shipping?.mode);
  console.log('handling_time:', item.shipping?.handling_time ?? 'NONE');
  console.log('permalink:', item.permalink);

  // Intentar GET del ETA mostrado al comprador via el catalog endpoint
  try {
    const r = await axios.get(`https://api.mercadolibre.com/items/MLC1913646427/shipping_options?zip_code=7500000`, { headers: h });
    console.log('\nShipping options (zip 7500000 - Santiago):', JSON.stringify(r.data, null, 2).slice(0, 800));
  } catch(e: any) {
    console.log('\nShipping options:', e?.response?.data?.message || e?.message);
    // Try without zip
    try {
      const r2 = await axios.get('https://api.mercadolibre.com/items/MLC1913646427/shipping_options', { headers: h });
      console.log('Shipping options (no zip):', JSON.stringify(r2.data, null, 2).slice(0, 400));
    } catch(e2: any) {
      console.log('Shipping options (no zip):', e2?.response?.data?.message || e2?.message);
    }
  }
}

go().catch(e => console.error('FATAL:', e?.response?.data || e?.message));
