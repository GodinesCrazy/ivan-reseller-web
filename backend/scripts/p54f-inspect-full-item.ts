/**
 * p54f — Ver JSON completo del item y usar endpoint de calidad/review para
 *         diagnosticar exactamente qué causa waiting_for_patch
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

  // 1. Full item JSON — buscar campos review/required_attributes/tags
  const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('=== TOP LEVEL FIELDS ===');
  Object.keys(item).forEach(k => {
    const v = item[k];
    if (typeof v === 'object' && v !== null) {
      const str = JSON.stringify(v);
      if (str.length < 300) console.log(`  ${k}: ${str}`);
      else console.log(`  ${k}: [object, keys: ${Object.keys(v).join(', ')}]`);
    } else {
      console.log(`  ${k}: ${v}`);
    }
  });

  // 2. Intentar endpoint de reviews
  const endpoints = [
    `/items/${LISTING_ID}/quality`,
    `/items/${LISTING_ID}/catalog_quality`,
    `/items/${LISTING_ID}/attributes_quality`,
    `/items/${LISTING_ID}/description_quality`,
  ];
  for (const ep of endpoints) {
    try {
      const r = await axios.get('https://api.mercadolibre.com' + ep, { headers: h });
      console.log(`\n=== ${ep} ===`);
      console.log(JSON.stringify(r.data, null, 2).slice(0, 800));
    } catch(e: any) {
      console.log(`\n${ep}: ${e?.response?.status} - ${e?.response?.data?.message || e?.message}`);
    }
  }

  // 3. Ver full attributes con tags
  console.log('\n=== CATEGORY ATTRS FULL (catalog_required) ===');
  const catAttrs = (await axios.get('https://api.mercadolibre.com/categories/MLC439917/attributes', { headers: h })).data;
  const catalogRequired = catAttrs.filter((a: any) => a.tags?.catalog_required);
  catalogRequired.forEach((a: any) => {
    const curAttr = item.attributes?.find((ia: any) => ia.id === a.id);
    const status = curAttr
      ? `✓ ${curAttr.value_name || curAttr.value_id || JSON.stringify(curAttr.value_struct)}`
      : '✗ MISSING';
    console.log(`  ${a.id} (${a.name}): ${status}`);
    if (!curAttr) {
      console.log(`    -> required type: ${a.value_type}`);
      if (a.units) console.log(`    -> units: ${JSON.stringify(a.units?.slice(0,4))}`);
      if (a.values) console.log(`    -> values: ${JSON.stringify(a.values?.slice(0,4))}`);
    }
  });

  // 4. Check variation_attribute attrs too
  const varAttrs = catAttrs.filter((a: any) => a.tags?.variation_attribute && !a.tags?.catalog_required);
  if (varAttrs.length > 0) {
    console.log('\n=== VARIATION ATTRS (not catalog_required) ===');
    varAttrs.forEach((a: any) => {
      const cur = item.attributes?.find((ia: any) => ia.id === a.id);
      console.log(`  ${a.id}: ${cur ? '✓ ' + (cur.value_name || cur.value_id) : '✗ MISSING'}`);
    });
  }

  // 5. Ver si hay un catalog_product_id asignado
  console.log('\n=== CATALOG FIELDS ===');
  console.log('catalog_product_id:', item.catalog_product_id);
  console.log('catalog_listing:', item.catalog_listing);
}

go().catch(e => console.error('[P54F] FATAL:', e?.response?.data || e?.message));
