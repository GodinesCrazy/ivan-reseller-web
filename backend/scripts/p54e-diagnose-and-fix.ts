/**
 * p54e — Diagnóstico profundo + fix iterativo de waiting_for_patch
 */
import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

const LISTING_ID = 'MLC1913623551';
const CAT = 'MLC439917';

async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // 1. Full required attr definitions
  const catAttrs = (await axios.get(`https://api.mercadolibre.com/categories/${CAT}/attributes`, { headers: h })).data;
  const required = catAttrs.filter((a: any) => a.tags?.required);

  console.log('=== DEFINICIÓN COMPLETA ATRIBUTOS REQUERIDOS ===');
  for (const a of required) {
    console.log(`\n[${a.id}] ${a.name} (${a.value_type})`);
    if (a.value_type === 'number_unit' && a.units) {
      console.log('  Units allowed:', a.units.map((u: any) => `${u.id}=${u.name}`).join(', '));
    }
    if (a.values?.length) {
      console.log('  Values:', a.values.map((v: any) => `${v.id}=${v.name}`).join(', '));
    }
    console.log('  Tags:', JSON.stringify(a.tags));
  }

  // 2. Current listing
  const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('\n=== LISTING STATUS ===');
  console.log('status:', item.status, '| sub_status:', JSON.stringify(item.sub_status));

  console.log('\n=== CURRENT ATTRS IN LISTING ===');
  item.attributes?.forEach((a: any) => {
    console.log(`  ${a.id}: value_name="${a.value_name}" value_id="${a.value_id}" value_struct=${JSON.stringify(a.value_struct)}`);
  });

  // 3. Identify missing
  const currentIds = new Set(item.attributes?.map((a: any) => a.id));
  console.log('\n=== MISSING REQUIRED ATTRS ===');
  const missing = required.filter((a: any) => !currentIds.has(a.id));
  missing.forEach((a: any) => console.log(`  MISSING: ${a.id} (${a.name})`));

  if (missing.length === 0) {
    console.log('  Ninguno falta... el problema es otro.');
    // Intentar ver el review
    try {
      const rev = await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}/validate`, { headers: h });
      console.log('Validate response:', JSON.stringify(rev.data, null, 2));
    } catch (e: any) {
      const d = e?.response?.data;
      console.log('Validate causes:', JSON.stringify(d?.cause?.map((c: any) => `${c.code}:${c.message}`)));
    }
  }

  // 4. Build targeted patch
  // PACKAGE_* con units correctas
  const pkgH = required.find((a: any) => a.id === 'PACKAGE_HEIGHT');
  const pkgW = required.find((a: any) => a.id === 'PACKAGE_WIDTH');
  const pkgL = required.find((a: any) => a.id === 'PACKAGE_LENGTH');
  const pkgWt = required.find((a: any) => a.id === 'PACKAGE_WEIGHT');
  const gtinAttr = required.find((a: any) => a.id === 'GTIN');

  const cmUnit = pkgH?.units?.find((u: any) => u.id === 'cm' || u.name?.toLowerCase() === 'cm');
  const gUnit = pkgWt?.units?.find((u: any) => u.id === 'g' || u.name?.toLowerCase() === 'g');

  console.log('\n=== UNITS FOUND ===');
  console.log('cm unit:', JSON.stringify(cmUnit));
  console.log('g unit:', JSON.stringify(gUnit));
  console.log('GTIN attr type:', gtinAttr?.value_type, 'tags:', JSON.stringify(gtinAttr?.tags));

  const patchAttrs: any[] = [
    { id: 'BRAND', value_name: 'Genérico' },
    { id: 'MODEL', value_name: 'Soporte Gatito' },
    { id: 'COLOR', value_name: 'Blanco' },
    { id: 'MATERIAL', value_name: 'Plástico' },
    { id: 'MPN', value_name: 'N/A' },
    { id: 'SELLER_SKU', value_name: 'GATITO-STAND-001' },
    { id: 'EMPTY_GTIN_REASON', value_id: '17055160' },
  ];

  // PACKAGE dimensions — probar con value_struct exacto que ML acepta
  if (pkgH) patchAttrs.push({ id: 'PACKAGE_HEIGHT', value_struct: { number: 11, unit: cmUnit?.id || 'cm' } });
  if (pkgW) patchAttrs.push({ id: 'PACKAGE_WIDTH', value_struct: { number: 9, unit: cmUnit?.id || 'cm' } });
  if (pkgL) patchAttrs.push({ id: 'PACKAGE_LENGTH', value_struct: { number: 7, unit: cmUnit?.id || 'cm' } });
  if (pkgWt) patchAttrs.push({ id: 'PACKAGE_WEIGHT', value_struct: { number: 90, unit: gUnit?.id || 'g' } });

  // GTIN — si es string, enviar un placeholder aceptado o vacío
  if (gtinAttr) {
    // No enviar GTIN si no tenemos código real; EMPTY_GTIN_REASON debería suficiar
    // Pero si ML lo requiere igual, probar con string vacío
    patchAttrs.push({ id: 'GTIN', value_name: '' });
  }

  console.log('\n=== PATCH A ENVIAR ===');
  patchAttrs.forEach(a => console.log(' ', JSON.stringify(a)));

  console.log('\n[P54E] Aplicando patch...');
  try {
    const res = await axios.put(`https://api.mercadolibre.com/items/${LISTING_ID}`, { attributes: patchAttrs }, { headers: h });
    console.log('✅ HTTP', res.status);
  } catch(e: any) {
    const d = e?.response?.data;
    console.log('❌ Error:', d?.message || e?.message);
    console.log('  Causes:', JSON.stringify(d?.cause?.map((c: any) => `${c.code}:${c.message}`)));
    if (d) console.log('  Full:', JSON.stringify(d, null, 2));
    return;
  }

  // 5. Poll hasta active o hasta 3 intentos
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const check = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
    console.log(`\n[Poll ${i+1}] status=${check.status} sub=${JSON.stringify(check.sub_status)}`);
    if (check.status === 'active' && check.sub_status?.length === 0) {
      console.log('🎉 ACTIVE — DONE');
      console.log('URL:', check.permalink);
      return;
    }
    if (check.sub_status?.includes('waiting_for_patch')) {
      console.log('  Sigue waiting_for_patch. Atributos actuales:');
      check.attributes?.forEach((a: any) => console.log(`    ${a.id}: ${a.value_name || a.value_id || JSON.stringify(a.value_struct)}`));
    }
  }
}

go().catch(e => console.error('[P54E] FATAL:', e?.response?.data || e?.message));
