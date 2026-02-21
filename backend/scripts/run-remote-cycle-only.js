#!/usr/bin/env node
/**
 * Solo llama al endpoint remoto - sin cargar backend local (evita OOM)
 * Uso: node scripts/run-remote-cycle-only.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local'), override: true });

const url = (process.env.VERIFIER_TARGET_URL || process.env.API_URL || 'https://ivan-reseller-backend-production.up.railway.app').replace(/\/$/, '')
  .replace(/\/$/, '') + '/api/internal/test-full-cycle-search-to-publish';
const secret = process.env.INTERNAL_RUN_SECRET;
const keyword = process.env.keyword;
// DRY_RUN=true por defecto: evita fallo por token eBay expirado; usar DRY_RUN=0 para ciclo completo
const dryRun = process.env.DRY_RUN === '0' ? false : (process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true' || !process.env.DRY_RUN);

if (!secret) {
  console.error('INTERNAL_RUN_SECRET no configurado en .env.local');
  process.exit(1);
}

console.log('=== Test remoto Railway ===');
console.log('URL:', url);
console.log('Keyword:', keyword || '(auto)');
console.log('DRY_RUN:', dryRun, '\n');

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
  body: JSON.stringify({ keyword: keyword || undefined, dryRun }),
})
  .then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('HTTP', res.status, data?.error || data?.message || JSON.stringify(data));
      process.exit(1);
    }
    if (!data.success) {
      console.error('ERROR:', data.error || 'Unknown');
      process.exit(1);
    }
    console.log('[DONE] Ciclo completo OK');
    if (data.listingId) console.log('  listingId:', data.listingId);
    if (data.listingUrl) console.log('  URL:', data.listingUrl);
    if (data.ebayPendingOAuth) {
      console.log('  (eBay pendiente OAuth - tokens aun no guardados o no detectados)');
      if (data.message) console.log('  message:', data.message);
    }
    console.log('  productId:', data.productId);
    console.log('  durationMs:', data.durationMs);
    if (process.env.VERBOSE) console.log('  raw:', JSON.stringify(data, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error('Request failed:', e.message);
    process.exit(1);
  });
