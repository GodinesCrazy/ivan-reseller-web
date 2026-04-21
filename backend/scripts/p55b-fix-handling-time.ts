/**
 * p55b — Fix handling_time en MLC1913623551
 * Estrategia: pausar → actualizar handling_time → reactivar
 * Si falla paused update → recrear listing
 */
import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

const LISTING_ID = 'MLC1913623551';
const TARGET_HANDLING_TIME = 25;

async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Estado actual
  const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('[P55B] Estado actual:', item.status, item.sub_status, '| handling_time:', item.shipping?.handling_time ?? 'undefined');

  // Paso 1: Pausar
  console.log('\n[P55B] Paso 1: Pausando listing...');
  try {
    await axios.put(`https://api.mercadolibre.com/items/${LISTING_ID}`,
      { status: 'paused' },
      { headers: h }
    );
    await new Promise(r => setTimeout(r, 2000));
    const paused = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
    console.log('[P55B] Status tras pausa:', paused.status);
  } catch(e: any) {
    console.log('[P55B] ❌ No se pudo pausar:', e?.response?.data?.message);
    return;
  }

  // Paso 2: Actualizar handling_time mientras está pausado
  console.log('\n[P55B] Paso 2: Actualizando handling_time a', TARGET_HANDLING_TIME, '...');
  let handlingTimeUpdated = false;
  try {
    await axios.put(`https://api.mercadolibre.com/items/${LISTING_ID}`,
      { shipping: { mode: 'me2', handling_time: TARGET_HANDLING_TIME, free_shipping: false, local_pick_up: false } },
      { headers: h }
    );
    console.log('✅ handling_time actualizado a', TARGET_HANDLING_TIME);
    handlingTimeUpdated = true;
  } catch(e: any) {
    const d = e?.response?.data;
    console.log('[P55B] ❌ Error actualizando handling_time:', d?.message || e?.message);
    console.log('  Causes:', JSON.stringify(d?.cause?.map((c: any) => `${c.code}: ${c.message}`)));
    handlingTimeUpdated = false;
  }

  // Paso 3: Reactivar
  console.log('\n[P55B] Paso 3: Reactivando listing...');
  try {
    await axios.put(`https://api.mercadolibre.com/items/${LISTING_ID}`,
      { status: 'active' },
      { headers: h }
    );
    await new Promise(r => setTimeout(r, 2000));
  } catch(e: any) {
    console.log('[P55B] ❌ Reactivar falló:', e?.response?.data?.message);
  }

  // Verificar estado final
  const final = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('\n[P55B] Estado final:');
  console.log(JSON.stringify({
    status: final.status,
    sub_status: final.sub_status,
    shipping_mode: final.shipping?.mode,
    handling_time: final.shipping?.handling_time,
    logistic_type: final.shipping?.logistic_type,
  }, null, 2));

  if (!handlingTimeUpdated) {
    console.log('\n⚠️  handling_time NO se pudo actualizar. El listing está activo pero sigue sin handling_time.');
    console.log('→ Necesitamos cerrar y recrear el listing con handling_time=25 en el POST inicial.');
    console.log('→ Script a ejecutar: p56-recreate-with-handling-time.ts');
  } else if (final.shipping?.handling_time === TARGET_HANDLING_TIME) {
    console.log('\n🎉 handling_time=' + TARGET_HANDLING_TIME + ' confirmado. ML debería mostrar ~27-30 días de entrega.');
  }
}

go().catch(e => console.error('[P55B] FATAL:', e?.response?.data || e?.message));
