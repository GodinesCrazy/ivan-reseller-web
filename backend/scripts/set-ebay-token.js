#!/usr/bin/env node
/**
 * Guarda el refresh token de eBay en Railway.
 * Uso: node scripts/set-ebay-token.js <REFRESH_TOKEN>
 * O: REFRESH_TOKEN=xxx node scripts/set-ebay-token.js
 * Obtener token: eBay Developer Portal > My Account > Application Keys > User Tokens > Get a Token
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local'), override: true });

const refreshToken = process.argv[2] || process.env.REFRESH_TOKEN || process.env.EBAY_REFRESH_TOKEN;
const base = (process.env.VERIFIER_TARGET_URL || process.env.API_URL || 'https://ivan-reseller-backend-production.up.railway.app').replace(/\/$/, '');
const secret = process.env.INTERNAL_RUN_SECRET;

if (!refreshToken) {
  console.error('Uso: node scripts/set-ebay-token.js <REFRESH_TOKEN>');
  console.error('O: REFRESH_TOKEN=xxx node scripts/set-ebay-token.js');
  console.error('Obtener: eBay Developer Portal > Application Keys > User Tokens > Get a Token');
  process.exit(1);
}
if (!secret) {
  console.error('INTERNAL_RUN_SECRET no configurado');
  process.exit(1);
}

fetch(`${base}/api/internal/set-ebay-token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
  body: JSON.stringify({ refreshToken }),
})
  .then((r) => r.json())
  .then((data) => {
    if (data.success) {
      console.log('OK:', data.message);
      console.log('Ejecuta: $env:DRY_RUN="0"; npm run run:remote-cycle');
    } else {
      console.error('Error:', data.error || data);
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  });
