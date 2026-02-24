#!/usr/bin/env node
/**
 * Verificación completa: tendencias -> publicación eBay
 * 1. Test conexión eBay
 * 2. Ciclo completo (DRY_RUN=0)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local'), override: true });

const base = (process.env.VERIFIER_TARGET_URL || process.env.API_URL || 'https://ivan-reseller-backend-production.up.railway.app').replace(/\/$/, '');
const secret = process.env.INTERNAL_RUN_SECRET;

if (!secret) {
  console.error('INTERNAL_RUN_SECRET no configurado en .env.local');
  process.exit(1);
}

const headers = { 'Content-Type': 'application/json', 'x-internal-secret': secret };

async function run() {
  console.log('=== 1. Test conexión eBay ===');
  try {
    const r1 = await fetch(`${base}/api/internal/ebay-connection-test`, { method: 'GET', headers });
    const d1 = await r1.json().catch(() => ({}));
    console.log('ebay-connection-test:', r1.status, JSON.stringify(d1, null, 2));
    if (!d1.success) {
      console.log('\n?? eBay sin token válido. Publicación puede fallar. Continuando...');
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\n=== 2. Ciclo completo (tendencias -> publicación) DRY_RUN=0 ===');
  try {
    const r2 = await fetch(`${base}/api/internal/test-full-cycle-search-to-publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dryRun: false }),
    });
    const d2 = await r2.json().catch(() => ({}));
    console.log('test-full-cycle:', r2.status);
    console.log(JSON.stringify(d2, null, 2));
    if (d2.success) {
      if (d2.listingId) console.log('\n? Publicado en eBay:', d2.listingId, d2.listingUrl || '');
      else if (d2.ebayPendingOAuth) console.log('\n?? Producto OK, eBay pendiente OAuth (token no guardado)');
      else console.log('\n? Ciclo completado');
    } else {
      console.log('\n? Error:', d2.error || d2.message);
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

run();
