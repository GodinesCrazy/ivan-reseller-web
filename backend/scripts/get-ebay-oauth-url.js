#!/usr/bin/env node
/**
 * Obtiene la URL OAuth eBay desde Railway (firmada con claves del servidor).
 * Abre la URL en el navegador. Después de autorizar, los tokens se guardan automáticamente.
 * Uso: node scripts/get-ebay-oauth-url.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local'), override: true });

const { execSync } = require('child_process');

const base = (process.env.VERIFIER_TARGET_URL || process.env.API_URL || 'https://ivan-reseller-backend-production.up.railway.app').replace(/\/$/, '');
const url = `${base}/api/internal/ebay-oauth-url`;
const secret = process.env.INTERNAL_RUN_SECRET;

if (!secret) {
  console.error('INTERNAL_RUN_SECRET no configurado en .env.local');
  process.exit(1);
}

fetch(url, {
  headers: { 'x-internal-secret': secret },
})
  .then((r) => r.json())
  .then((data) => {
    if (!data.success || !data.url) {
      console.error('Error:', data.error || 'No URL returned');
      process.exit(1);
    }
    console.log('=== eBay OAuth ===');
    console.log('Abre esta URL para autorizar. Después, los tokens se guardan en Railway.');
    console.log(data.url, '\n');
    try {
      execSync(`start "" "${data.url}"`, { shell: true });
      console.log('Navegador abierto.');
    } catch {
      console.log('Copia la URL y ábrela en tu navegador.');
    }
    console.log('\nCuando termines de autorizar, ejecuta: npm run run:remote-cycle (con DRY_RUN=0)');
  })
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  });
