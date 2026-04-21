/**
 * p55 — Diagnosticar configuración de envío en MLC1913623551
 *         Problema: ML muestra "llega el miércoles/jueves" cuando debería ser 20-30 días
 */
import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

const LISTING_ID = 'MLC1913623551';

async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;

  console.log('=== SHIPPING FULL ===');
  console.log(JSON.stringify(item.shipping, null, 2));

  console.log('\n=== SALE_TERMS ===');
  console.log(JSON.stringify(item.sale_terms, null, 2));

  console.log('\n=== LISTING TYPE / TAGS ===');
  console.log('listing_type_id:', item.listing_type_id);
  console.log('tags:', JSON.stringify(item.tags));
  console.log('international_delivery_mode:', item.international_delivery_mode);

  // Verificar si handling_time está configurado correctamente
  console.log('\n=== HANDLING TIME ===');
  console.log('shipping.handling_time:', item.shipping?.handling_time);
  console.log('shipping.mode:', item.shipping?.mode);
  console.log('logistic_type:', item.shipping?.logistic_type);

  // Ver qué opciones de envío hay disponibles para este item
  try {
    const shippingOptions = (await axios.get(
      `https://api.mercadolibre.com/items/${LISTING_ID}/shipping_options?zip_code=3460000`,
      { headers: h }
    )).data;
    console.log('\n=== SHIPPING OPTIONS (Talca 3460000) ===');
    console.log(JSON.stringify(shippingOptions, null, 2));
  } catch(e: any) {
    console.log('\nShipping options error:', e?.response?.data?.message || e?.message);
  }

  // Intentar actualizar handling_time a 25 días si no está correcto
  if (item.shipping?.handling_time !== 25) {
    console.log(`\n[P55] handling_time es ${item.shipping?.handling_time}, esperábamos 25. Corrigiendo...`);
    try {
      await axios.put(`https://api.mercadolibre.com/items/${LISTING_ID}`,
        { shipping: { mode: 'me2', handling_time: 25, local_pick_up: false, free_shipping: false } },
        { headers: h }
      );
      console.log('✅ handling_time actualizado a 25');
      await new Promise(r => setTimeout(r, 2000));
      const updated = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
      console.log('nuevo handling_time:', updated.shipping?.handling_time);
    } catch(e: any) {
      console.log('❌ Error actualizando handling_time:', e?.response?.data?.message || e?.message);
      console.log('   Causes:', JSON.stringify(e?.response?.data?.cause));
    }
  } else {
    console.log('\n[P55] handling_time=25 está correcto.');
    console.log('[P55] El problema puede ser que ML ignora handling_time para drop_off me2.');
    console.log('[P55] Posibles soluciones: cambiar a not_specified o agregar dimensiones al envío.');
  }
}

go().catch(e => console.error('[P55] FATAL:', e?.response?.data || e?.message));
