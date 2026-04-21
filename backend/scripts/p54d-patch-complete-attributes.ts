/**
 * p54d — Patch completo de atributos requeridos para MLC1913623551
 * Incluye PACKAGE_* (no SELLER_PACKAGE_*), GTIN, EMPTY_GTIN_REASON, MPN, SELLER_SKU
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

  // Ver atributos actuales
  const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('[P54D] Status actual:', item.status, item.sub_status);
  console.log('[P54D] Atributos actuales:', item.attributes?.map((a: any) => `${a.id}=${a.value_name || a.value_id}`).join(', '));

  // Obtener value_id correcto para EMPTY_GTIN_REASON
  const catAttrs = (await axios.get('https://api.mercadolibre.com/categories/MLC439917/attributes', { headers: h })).data;
  const emptyGtinAttr = catAttrs.find((a: any) => a.id === 'EMPTY_GTIN_REASON');
  const noCodeOption = emptyGtinAttr?.values?.find((v: any) => v.name?.toLowerCase().includes('no tiene') || v.name?.toLowerCase().includes('no registr'));
  console.log('[P54D] EMPTY_GTIN_REASON values:', emptyGtinAttr?.values?.map((v: any) => `${v.id}:${v.name}`));
  console.log('[P54D] Usando EMPTY_GTIN_REASON value_id:', noCodeOption?.id, '-', noCodeOption?.name);

  const patch = {
    attributes: [
      { id: 'BRAND', value_name: 'Genérico' },
      { id: 'MODEL', value_name: 'Soporte Gatito' },
      { id: 'COLOR', value_name: 'Blanco' },
      { id: 'MATERIAL', value_name: 'Plástico' },
      { id: 'LINE', value_name: 'Universal' },
      { id: 'COMPATIBLE_DEVICES', value_name: 'Universal' },
      // Package dimensions (required) — distinto de SELLER_PACKAGE_*
      { id: 'PACKAGE_HEIGHT', value_struct: { number: 11, unit: 'cm' } },
      { id: 'PACKAGE_WIDTH', value_struct: { number: 9, unit: 'cm' } },
      { id: 'PACKAGE_LENGTH', value_struct: { number: 7, unit: 'cm' } },
      { id: 'PACKAGE_WEIGHT', value_struct: { number: 90, unit: 'g' } },
      // GTIN — producto importado sin código registrado
      { id: 'GTIN', value_name: '' },
      { id: 'EMPTY_GTIN_REASON', value_id: noCodeOption?.id || '6050316' }, // "El producto no tiene código registrado"
      // MPN y SKU
      { id: 'MPN', value_name: 'N/A' },
      { id: 'SELLER_SKU', value_name: 'GATITO-STAND-001' },
    ],
  };

  console.log('\n[P54D] Aplicando patch completo...');
  try {
    const res = await axios.put(`https://api.mercadolibre.com/items/${LISTING_ID}`, patch, { headers: h });
    console.log('✅ Patch aplicado, status HTTP:', res.status);
  } catch(e: any) {
    const causes = e?.response?.data?.cause?.map((c: any) => `${c.code}: ${c.message}`).join('\n  ');
    console.log('❌ Error:', e?.response?.data?.message || e?.message);
    if (causes) console.log('  Causes:\n  ' + causes);
    if (e?.response?.data) console.log('  Full response:', JSON.stringify(e.response.data, null, 2));
    return;
  }

  // Estado final tras 3 segundos
  await new Promise(r => setTimeout(r, 3000));
  const final = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('\n[P54D] Estado final:');
  console.log(JSON.stringify({
    status: final.status,
    sub_status: final.sub_status,
    shipping_mode: final.shipping?.mode,
    handling_time: final.shipping?.handling_time,
    logistic_type: final.shipping?.logistic_type,
    permalink: final.permalink,
  }, null, 2));

  if (final.status === 'active' && final.sub_status?.length === 0) {
    console.log('\n🎉 LISTING COMPLETAMENTE ACTIVO — listo para primera compra controlada');
  } else if (final.sub_status?.includes('waiting_for_patch')) {
    console.log('\n[P54D] Atributos restantes en el listing:');
    final.attributes?.forEach((a: any) => console.log(` ${a.id}: ${a.value_name || a.value_id}`));
  }
}

go().catch(e => console.error('[P54D] FATAL:', e?.response?.data || e?.message));
