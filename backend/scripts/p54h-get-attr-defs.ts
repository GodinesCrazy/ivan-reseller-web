/**
 * p54h — Obtener definición completa de PACKAGE_HEIGHT, GTIN, y buscar competitor
 */
import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

(async () => {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token };

  // Full defs
  const catAttrs = (await axios.get('https://api.mercadolibre.com/categories/MLC439917/attributes', { headers: h })).data;

  const ids = ['PACKAGE_HEIGHT', 'PACKAGE_WIDTH', 'PACKAGE_LENGTH', 'PACKAGE_WEIGHT', 'GTIN', 'SELLER_PACKAGE_HEIGHT'];
  for (const id of ids) {
    const a = catAttrs.find((x: any) => x.id === id);
    if (a) {
      console.log(`\n--- ${id} ---`);
      console.log('  type:', a.value_type);
      console.log('  tags:', JSON.stringify(a.tags));
      if (a.units) console.log('  units:', JSON.stringify(a.units));
      if (a.values) console.log('  values:', JSON.stringify(a.values?.slice(0, 8)));
    } else {
      console.log(`\n--- ${id} --- NOT IN CATEGORY`);
    }
  }

  // Try competitor search with different endpoint
  try {
    const r = await axios.get('https://api.mercadolibre.com/sites/MLC/search?q=soporte+celular+escritorio&category=MLC439917&limit=3', { headers: h });
    console.log('\n=== SEARCH RESULTS ===');
    r.data.results?.slice(0, 3).forEach((x: any) => console.log(' ', x.id, '-', x.title?.slice(0, 50)));

    if (r.data.results?.[0]) {
      const compId = r.data.results[0].id;
      const comp = (await axios.get(`https://api.mercadolibre.com/items/${compId}`, { headers: h })).data;
      console.log('\n=== COMPETITOR ATTRS (' + compId + ') ===');
      comp.attributes?.forEach((a: any) => console.log('  ' + a.id + ':', a.value_name || a.value_id || JSON.stringify(a.value_struct)));
    }
  } catch(e: any) {
    console.log('\nSearch failed:', e?.response?.status, e?.response?.data?.message);
    // Try without category filter
    try {
      const r2 = await axios.get('https://api.mercadolibre.com/sites/MLC/search?q=soporte+celular+gatito&limit=3', { headers: h });
      console.log('Alt search results:');
      r2.data.results?.slice(0, 3).forEach((x: any) => console.log(' ', x.id, x.category_id, '-', x.title?.slice(0, 50)));
    } catch(e2: any) {
      console.log('Alt search also failed:', e2?.response?.status);
    }
  }

  // Directly GET our listing to see the validate response
  try {
    await axios.put(`https://api.mercadolibre.com/items/MLC1913623551/validate`,
      { attributes: [{ id: 'GTIN', value_name: 'Sin GTIN' }] },
      { headers: { ...h, 'Content-Type': 'application/json' } }
    );
    console.log('\nValidate: OK');
  } catch(e: any) {
    const d = e?.response?.data;
    console.log('\nValidate causes:');
    d?.cause?.forEach((c: any) => console.log('  ', c.code, ':', c.message));
    console.log('  msg:', d?.message);
  }
})().catch(e => { console.error('FATAL:', e?.response?.data || e?.message); process.exit(1); });
