/**
 * p56d — Configurar handling_time a nivel de cuenta (no de item individual)
 *         En Chile me2, el plazo de despacho se configura en el perfil del vendedor
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
  const userId = me.id;
  console.log('[P56D] User:', userId);

  // Intentar distintos endpoints para configurar handling_time a nivel cuenta
  const attempts = [
    {
      label: 'PUT shipping_preferences handling_time',
      method: 'PUT',
      url: `https://api.mercadolibre.com/users/${userId}/shipping_preferences`,
      body: { handling_time: 25 },
    },
    {
      label: 'PUT shipping_options/me2 handling_time',
      method: 'PUT',
      url: `https://api.mercadolibre.com/users/${userId}/shipping_options/me2`,
      body: { handling_time: 25 },
    },
    {
      label: 'PUT me2 settings via dispatch',
      method: 'PUT',
      url: `https://api.mercadolibre.com/users/${userId}/shipping_modes/me2`,
      body: { handling_time: 25 },
    },
    {
      label: 'PUT shipping_options dispatch_time',
      method: 'PUT',
      url: `https://api.mercadolibre.com/users/${userId}/shipping_preferences`,
      body: { dispatch_time: 25 },
    },
  ];

  for (const attempt of attempts) {
    console.log(`\n[P56D] Intentando: ${attempt.label}`);
    try {
      const r = await axios[attempt.method.toLowerCase() as 'put'](attempt.url, attempt.body, { headers: h });
      console.log(`  ✅ HTTP ${r.status}: ${JSON.stringify(r.data)?.slice(0, 200)}`);
    } catch(e: any) {
      console.log(`  ❌ ${e?.response?.status}: ${e?.response?.data?.message || e?.message}`);
    }
  }

  // Verificar si los listings ahora muestran handling_time actualizado
  await new Promise(r => setTimeout(r, 2000));
  const activeId = 'MLC1913646427';
  const item = (await axios.get(`https://api.mercadolibre.com/items/${activeId}`, { headers: h })).data;
  console.log('\n[P56D] Item check:');
  console.log('  handling_time:', item.shipping?.handling_time ?? 'NONE');
  console.log('  mode:', item.shipping?.mode);
  console.log('  status:', item.status, item.sub_status);

  // Obtener shipping options del item para ver el ETA actual
  console.log('\n[P56D] Checking shipping_options endpoint...');
  try {
    // zip de Santiago
    const r = await axios.get(`https://api.mercadolibre.com/items/${activeId}/shipping_options?zip_code=8320000`, { headers: h });
    console.log('  shipping_options (Santiago):', JSON.stringify(r.data, null, 2).slice(0, 500));
  } catch(e: any) {
    console.log('  shipping_options error:', e?.response?.data?.message || e?.message);
  }

  // Ver shipping_options del seller
  try {
    const r = await axios.get(`https://api.mercadolibre.com/users/${userId}/shipping_preferences`, { headers: h });
    console.log('\n  Account shipping_preferences after update:');
    const prefs = r.data;
    console.log('  handling_time:', (prefs as any).handling_time);
    console.log('  dispatch_time:', (prefs as any).dispatch_time);
  } catch(e: any) {
    console.log('  prefs error:', e?.response?.data?.message || e?.message);
  }
}

go().catch(e => console.error('[P56D] FATAL:', e?.response?.data || e?.message));
