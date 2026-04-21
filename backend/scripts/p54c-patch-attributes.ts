/**
 * p54c — Parchar atributos faltantes de MLC1913623551 para salir de waiting_for_patch
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

  // Ver atributos requeridos de la categoría MLC439917
  const catAttrs = (await axios.get('https://api.mercadolibre.com/categories/MLC439917/attributes', { headers: h })).data;
  const required = catAttrs.filter((a: any) => a.tags?.required || a.tags?.catalog_required || a.tags?.variation_attribute);
  console.log('[P54C] Atributos requeridos categoría MLC439917:');
  required.forEach((a: any) => {
    const vals = a.values?.slice(0, 4).map((v: any) => v.name).join(' / ') || a.value_type;
    console.log(` ${a.id} — ${a.name} [${vals}]`);
  });

  // Ver atributos actuales del listing
  const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('\n[P54C] Atributos actuales del listing:');
  item.attributes?.forEach((a: any) => console.log(` ${a.id}: ${a.value_name || a.value_id}`));

  // Parchar con atributos típicos de Apoya Celulares
  const patch = {
    attributes: [
      { id: 'BRAND', value_name: 'Genérico' },
      { id: 'MODEL', value_name: 'Soporte Gatito' },
      { id: 'LINE', value_name: 'Universal' },
      { id: 'COMPATIBLE_DEVICES', value_name: 'Universal' },
      { id: 'COLOR', value_name: 'Blanco' },
      { id: 'MATERIAL', value_name: 'Plástico' },
      { id: 'MAIN_FEATURE', value_name: 'Antideslizante' },
      { id: 'WITH_SUCTION_CUP', value_id: '242085' }, // No
    ],
  };

  console.log('\n[P54C] Aplicando patch de atributos...');
  try {
    await axios.put(`https://api.mercadolibre.com/items/${LISTING_ID}`, patch, { headers: h });
    console.log('✅ Atributos actualizados');
  } catch(e: any) {
    const causes = e?.response?.data?.cause?.map((c: any) => `${c.code}: ${c.message}`).join('\n  ');
    console.log('❌ Error:', e?.response?.data?.message || e?.message);
    if (causes) console.log('  Causes:\n  ' + causes);
  }

  // Estado final
  await new Promise(r => setTimeout(r, 2000));
  const final = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('\n[P54C] Estado final:');
  console.log(JSON.stringify({
    status: final.status,
    sub_status: final.sub_status,
    shipping_mode: final.shipping?.mode,
    handling_time: final.shipping?.handling_time,
    logistic_type: final.shipping?.logistic_type,
  }, null, 2));
}

go().catch(e => console.error('[P54C] FATAL:', e?.response?.data || e?.message));
