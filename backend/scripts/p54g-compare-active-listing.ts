/**
 * p54g — Buscar listing activo en MLC439917 y comparar sus atributos
 *         para saber exactamente qué necesita GTIN, PACKAGE_HEIGHT, etc.
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

  // 1. Buscar listings activos en MLC439917
  console.log('[P54G] Buscando listings activos en MLC439917...');
  const search = (await axios.get(
    'https://api.mercadolibre.com/sites/MLC/search?category=MLC439917&status=active&limit=5',
    { headers: h }
  )).data;

  const results = search.results || [];
  console.log(`[P54G] Encontrados ${results.length} listings`);

  // Tomar el primero que no sea nuestro
  const competitor = results.find((r: any) => r.id !== LISTING_ID);
  if (!competitor) { console.log('[P54G] No hay competidor'); return; }

  console.log(`[P54G] Comparando con: ${competitor.id} (${competitor.title?.slice(0, 50)})`);

  // 2. Ver atributos del listing activo
  const compItem = (await axios.get(`https://api.mercadolibre.com/items/${competitor.id}`, { headers: h })).data;
  console.log('\n=== ATRIBUTOS LISTING ACTIVO ===');
  compItem.attributes?.forEach((a: any) => {
    console.log(`  ${a.id}: value_name="${a.value_name}" value_id="${a.value_id}" value_struct=${JSON.stringify(a.value_struct)}`);
  });
  console.log('  tags:', JSON.stringify(compItem.tags));
  console.log('  status:', compItem.status, compItem.sub_status);

  // 3. Obtener FULL definición de PACKAGE_HEIGHT y GTIN
  const catAttrs = (await axios.get('https://api.mercadolibre.com/categories/MLC439917/attributes', { headers: h })).data;
  const pkgH = catAttrs.find((a: any) => a.id === 'PACKAGE_HEIGHT');
  const gtin = catAttrs.find((a: any) => a.id === 'GTIN');

  console.log('\n=== PACKAGE_HEIGHT FULL DEFINITION ===');
  console.log(JSON.stringify(pkgH, null, 2));

  console.log('\n=== GTIN FULL DEFINITION ===');
  console.log(JSON.stringify(gtin, null, 2));

  // 4. Ver nuestro listing
  const ourItem = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('\n=== NUESTRO LISTING ===');
  console.log('status:', ourItem.status, ourItem.sub_status);
  console.log('tags:', JSON.stringify(ourItem.tags));
  ourItem.attributes?.forEach((a: any) => {
    console.log(`  ${a.id}: "${a.value_name || a.value_id || JSON.stringify(a.value_struct)}"`);
  });

  // 5. Cross-reference: qué tiene el competidor que nosotros no
  const compIds = new Set(compItem.attributes?.map((a: any) => a.id));
  const ourIds = new Set(ourItem.attributes?.map((a: any) => a.id));
  console.log('\n=== EN COMPETIDOR PERO NO EN NUESTRO ===');
  compIds.forEach((id: any) => { if (!ourIds.has(id)) console.log('  MISSING:', id); });
  console.log('=== EN NUESTRO PERO NO EN COMPETIDOR ===');
  ourIds.forEach((id: any) => { if (!compIds.has(id)) console.log('  EXTRA:', id); });
}

go().catch(e => console.error('[P54G] FATAL:', e?.response?.data || e?.message));
