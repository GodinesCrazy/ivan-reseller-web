#!/usr/bin/env node
/**
 * Genera y abre la URL de autorización eBay OAuth.
 * Requiere: EBAY_APP_ID, EBAY_RUNAME (o EBAY_REDIRECT_URI) en .env.local
 * Después de autorizar, los tokens se guardan en api_credentials (Railway).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local'), override: true });

const crypto = require('crypto');
const { execSync } = require('child_process');

const clientId = (process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || '').trim();
let redirectUri = (process.env.EBAY_RUNAME || process.env.EBAY_REDIRECT_URI || '').trim();
// eBay requiere RuName, NO URL. Fallback conocido.
if (!redirectUri || redirectUri.startsWith('http') || redirectUri.includes('/')) {
  redirectUri = (process.env.EBAY_RUNAME || '').trim() || 'Ivan_Marty-IvanMart-IVANRe-cgcqu';
}

if (!clientId || !redirectUri) {
  console.error('ERROR: Configura EBAY_APP_ID y EBAY_RUNAME (o EBAY_REDIRECT_URI) en .env.local');
  console.error('Ejecuta: npm run inject-apis');
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

const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key';
const redirB64 = Buffer.from(redirectUri).toString('base64url');
const ts = Date.now().toString();
const nonce = crypto.randomBytes(8).toString('hex');
const expirationTime = Date.now() + 10 * 60 * 1000;
const payload = ['1', 'ebay', ts, nonce, redirB64, 'production', expirationTime.toString()].join('|');
const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
const state = Buffer.from([payload, sig].join('|')).toString('base64url');

const authUrl =
  `https://auth.ebay.com/oauth2/authorize` +
  `?client_id=${encodeURIComponent(clientId)}` +
  `&response_type=code` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&scope=${encodeURIComponent(scope)}` +
  `&state=${encodeURIComponent(state)}`;

console.log('=== eBay OAuth ===');
console.log('redirect_uri (RuName):', redirectUri);
console.log('\nAbre esta URL para autorizar. Después, el callback guardará los tokens en Railway.');
console.log(authUrl, '\n');

try {
  execSync(`start "" "${authUrl}"`, { shell: true });
  console.log('Navegador abierto.');
} catch {
  console.log('Copia la URL y ábrela en tu navegador.');
}
