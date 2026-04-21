/**
 * p52b — Corregir shipping del listing activo a international dropshipping honesto
 *
 * Objetivo: cambiar "Entrega a acordar con el vendedor" por tiempo de entrega real
 * (~25 días hábiles, dropshipping AliExpress → Chile).
 *
 * La cuenta tiene me2 y custom disponibles. Intentamos me2 primero (mandatorio en MLC),
 * si falla por catálogo, usamos custom con handling_time.
 */
import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

const LISTING_ID = 'MLC1913613623';
const USER_ID = 1;
// Días reales de tránsito AliExpress → Chile (estimado conservador honesto)
const HANDLING_DAYS = 25;

async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(USER_ID, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  async function checkShipping() {
    const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
    return item.shipping;
  }

  async function tryUpdate(label: string, payload: any): Promise<boolean> {
    try {
      await axios.put(`https://api.mercadolibre.com/items/${LISTING_ID}`, payload, { headers: h });
      console.log(`  ✅ ${label}: aplicado`);
      return true;
    } catch(e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.cause?.[0]?.message || e?.message;
      console.log(`  ❌ ${label}: ${msg}`);
      return false;
    }
  }

  console.log('\n[P52B] === Fix shipping para international dropshipping ===\n');
  console.log('[P52B] Shipping actual:', JSON.stringify(await checkShipping()));

  // Intento 1: me2 con handling_time (modo mandatorio en MLC)
  console.log(`\n[P52B] Intentando me2 con handling_time=${HANDLING_DAYS}...`);
  let ok = await tryUpdate('me2', {
    shipping: { mode: 'me2', free_shipping: false, handling_time: HANDLING_DAYS, local_pick_up: false }
  });

  // Intento 2: me2 sin handling_time explícito
  if (!ok) {
    console.log('[P52B] Intentando me2 sin handling_time...');
    ok = await tryUpdate('me2_basic', {
      shipping: { mode: 'me2', free_shipping: false }
    });
  }

  // Intento 3: custom con handling_time
  if (!ok) {
    console.log('[P52B] Intentando custom con handling_time...');
    ok = await tryUpdate('custom', {
      shipping: { mode: 'custom', free_shipping: false, handling_time: HANDLING_DAYS, local_pick_up: false }
    });
  }

  // Verificar resultado
  const finalShipping = await checkShipping();
  console.log('\n[P52B] Shipping final:', JSON.stringify(finalShipping, null, 2));

  const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log(`[P52B] Status listing: ${item.status} | sub_status: ${JSON.stringify(item.sub_status)}`);

  if (finalShipping.mode === 'me2') {
    console.log(`\n[P52B] ✅ Shipping actualizado a me2 — ML calculará tiempo de entrega estimado`);
  } else if (finalShipping.mode === 'custom') {
    console.log(`\n[P52B] ✅ Shipping en modo custom con handling_time=${finalShipping.handling_time || HANDLING_DAYS} días`);
  } else {
    console.log(`\n[P52B] ⚠️  Sigue en ${finalShipping.mode} — ver opciones en seller center`);
  }
}

go().catch(e => console.error('[P52B] FATAL:', e?.response?.data || e?.message));
