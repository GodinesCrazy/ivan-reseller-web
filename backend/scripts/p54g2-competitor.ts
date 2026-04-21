import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

(async () => {
  // Búsqueda pública (sin auth)
  const r = await axios.get('https://api.mercadolibre.com/sites/MLC/search?category=MLC439917&limit=3');
  const ids: string[] = r.data.results?.slice(0, 3).map((x: any) => x.id) || [];
  console.log('FOUND IDS:', ids.join(', '));

  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token };

  // Ver atributos del primer listing activo
  for (const id of ids) {
    const item = (await axios.get(`https://api.mercadolibre.com/items/${id}`, { headers: h })).data;
    if (item.status === 'active') {
      console.log(`\n=== ${id} (${item.title?.slice(0, 40)}) ===`);
      console.log('status:', item.status, item.sub_status);
      console.log('tags:', JSON.stringify(item.tags));
      item.attributes?.forEach((a: any) => {
        console.log(`  ${a.id}: "${a.value_name || a.value_id || JSON.stringify(a.value_struct)}"`);
      });
      break;
    }
  }

  // Full definition of PACKAGE_HEIGHT and GTIN
  const catAttrs = (await axios.get('https://api.mercadolibre.com/categories/MLC439917/attributes', { headers: h })).data;
  const pkgH = catAttrs.find((a: any) => a.id === 'PACKAGE_HEIGHT');
  const gtin = catAttrs.find((a: any) => a.id === 'GTIN');
  console.log('\nPACKAGE_HEIGHT def:', JSON.stringify(pkgH?.units?.slice(0, 5)));
  console.log('GTIN def type:', gtin?.value_type, 'tags:', JSON.stringify(gtin?.tags));
  if (gtin?.values?.length) console.log('GTIN values:', JSON.stringify(gtin.values?.slice(0, 5)));
})().catch(e => { console.error('FATAL:', e?.response?.data || e?.message); process.exit(1); });
