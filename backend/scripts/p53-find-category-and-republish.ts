/**
 * p53 — Encontrar categoría sin lost_me2_by_catalog y republicar
 */
import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  const title = 'Soporte Escritorio Teléfono Gatito Decorativo Minimalista';

  // 1. Predecir categorías
  console.log('[P53] Prediciendo categorías para:', title);
  const pred = (await axios.get(
    'https://api.mercadolibre.com/sites/MLC/domain_discovery/search?q=' + encodeURIComponent(title) + '&limit=8',
    { headers: h }
  )).data;

  console.log('\n[P53] === CATEGORÍAS SUGERIDAS ===');
  pred.forEach((p: any) => {
    console.log(' ', p.category_id, '-', p.category_name, '|', p.domain_name);
  });

  // 2. Para cada categoría, verificar si permite me2 sin revertirlo
  // Creamos un listing de prueba mínimo para verificar
  console.log('\n[P53] === VERIFICANDO SHIPPING POR CATEGORÍA ===');

  const catIds: string[] = pred.map((p: any) => p.category_id);
  // Añadir algunas categorías conocidas de accesorios
  catIds.push('MLC5726', 'MLC1648', 'MLC3530'); // explícitas para comparar
  const uniqueCats = [...new Set(catIds)];

  for (const cat of uniqueCats.slice(0, 8)) {
    try {
      // Verificar qué dice ML sobre shipping para esta categoría + cuenta
      const shippingUrl = `https://api.mercadolibre.com/users/me/shipping_options/free?category_id=${cat}&site_id=MLC`;
      const shippingInfo = (await axios.get(shippingUrl, { headers: h })).data;
      console.log(`  ${cat}: shipping_options=${JSON.stringify(shippingInfo)?.slice(0, 120)}`);
    } catch(e: any) {
      // Intentar endpoint alternativo
      try {
        const val = (await axios.post(`https://api.mercadolibre.com/items/validate`,
          { category_id: cat, shipping: { mode: 'me2' }, title: title.slice(0, 60), price: 11305, currency_id: 'CLP', available_quantity: 10, listing_type_id: 'gold_special', condition: 'new' },
          { headers: h }
        )).data;
        console.log(`  ${cat}: validate_me2=${JSON.stringify(val)?.slice(0, 100)}`);
      } catch(e2: any) {
        const causes = (e2?.response?.data?.cause || []).map((c: any) => c.code).join(',');
        const msg = e2?.response?.data?.message || e2?.message;
        const hasShippingError = causes.includes('shipping') || msg?.includes('shipping');
        console.log(`  ${cat}: ${hasShippingError ? '⚠️ shipping issue' : '✅ no shipping error'} | ${causes || msg?.slice(0, 80)}`);
      }
    }
  }
}

go().catch(e => console.error('[P53] FATAL:', e?.response?.data || e?.message));
