#!/usr/bin/env node
/**
 * Abre la URL de OAuth de eBay y te indica cómo publicar después.
 * No se puede completar OAuth por ti: debes autorizar una vez en el navegador.
 *
 * Uso:
 *   npm run ebay:oauth-then-publish
 *   node scripts/ebay-oauth-then-publish.js
 *
 * Requiere en .env.local (o Railway):
 *   EBAY_APP_ID, EBAY_CERT_ID, EBAY_DEV_ID, EBAY_RUNAME (o EBAY_REDIRECT_URI)
 *
 * En developer.ebay.com: la URL de redirect del RuName debe ser tu callback, ej.:
 *   https://ivan-reseller-backend-production.up.railway.app/api/marketplace-oauth/callback
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local'), override: true });

const crypto = require('crypto');
const { execSync } = require('child_process');

const clientId = (process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || '').trim();
const certId = (process.env.EBAY_CERT_ID || process.env.EBAY_CLIENT_SECRET || '').trim();
const devId = (process.env.EBAY_DEV_ID || '').trim();
const redirectUri = (process.env.EBAY_RUNAME || process.env.EBAY_REDIRECT_URI || '').trim();

console.log('');
console.log('=== eBay OAuth ? Publicar ===');
console.log('');

const missing = [];
if (!clientId) missing.push('EBAY_APP_ID');
if (!certId) missing.push('EBAY_CERT_ID');
if (!devId) missing.push('EBAY_DEV_ID');
if (!redirectUri) missing.push('EBAY_RUNAME o EBAY_REDIRECT_URI');

if (missing.length > 0) {
  console.error('Faltan variables en .env.local (o Railway):', missing.join(', '));
  console.error('');
  console.error('Pasos:');
  console.error('  1. developer.ebay.com ? My Account ? Application Keys');
  console.error('  2. Crea una app (o usa la existente). Obtén App ID, Cert ID, Dev ID.');
  console.error('  3. User Tokens ? RuName: crea un RuName con Redirect URL =');
  console.error('     https://ivan-reseller-backend-production.up.railway.app/api/marketplace-oauth/callback');
  console.error('  4. A?ade a backend/.env.local: EBAY_APP_ID, EBAY_CERT_ID, EBAY_DEV_ID, EBAY_RUNAME');
  console.error('  5. En la web: Configuración ? API Settings ? eBay: guarda App ID, Cert ID, Dev ID, RuName.');
  console.error('     Luego usa el botón "Autorizar OAuth" en esa misma página.');
  console.error('');
  process.exit(1);
}

const scope = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.marketing',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
].join(' ');

const secret = (process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key').trim();
const redirB64 = Buffer.from(redirectUri).toString('base64url');
const ts = Date.now().toString();
const nonce = crypto.randomBytes(8).toString('hex');
const expirationTime = Date.now() + 10 * 60 * 1000;
const payload = ['1', 'ebay', ts, nonce, redirB64, 'production', expirationTime.toString()].join('|');
const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
const state = Buffer.from([payload, sig].join('|')).toString('base64url');

const authUrl =
  'https://auth.ebay.com/oauth2/authorize' +
  `?client_id=${encodeURIComponent(clientId)}` +
  '&response_type=code' +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&scope=${encodeURIComponent(scope)}` +
  `&state=${encodeURIComponent(state)}`;

console.log('Se abrirá el navegador para que autorices con tu cuenta eBay.');
console.log('Redirect (RuName):', redirectUri);
console.log('');
console.log('URL (por si no se abre):');
console.log(authUrl);
console.log('');

try {
  execSync(`start "" "${authUrl}"`, { shell: true });
  console.log('Navegador abierto.');
} catch {
  console.log('Copia la URL de arriba y ábrela en el navegador.');
}

console.log('');
console.log('--- Después de autorizar ---');
console.log('  El backend guardará el token automáticamente.');
console.log('  Luego ejecuta el ciclo hasta publicar:');
console.log('');
console.log('    cd backend');
console.log('    npm run test:search-to-publish');
console.log('');
console.log('  O con keyword:  keyword=phone case npm run test:search-to-publish');
console.log('');
