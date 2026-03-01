#!/usr/bin/env node
/**
 * Inject API keys from APIS2.txt (or APIS.txt) + rail.txt into backend/.env.local.
 * Extracts: SERP, GROQ, GEMINI, OPENAI | AliExpress Affiliate + Dropshipping + Tracking IDs |
 *           ScraperAPI, ZenRows | eBay Production/Sandbox (App ID, Dev ID, Cert ID, RuName) |
 *           PayPal Sandbox/Live | SENDGRID, STRIPE | INTERNAL_RUN_SECRET, ENCRYPTION_KEY.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cwd = process.cwd();
const projectRoot = path.join(cwd, '..');
const apis2Path = path.join(projectRoot, 'APIS2.txt');
const apisPath = path.join(projectRoot, 'APIS.txt');
const envLocalPath = path.join(cwd, '.env.local');
const examplePath = path.join(cwd, 'env.local.example');

const apisFile = fs.existsSync(apis2Path) ? apis2Path : (fs.existsSync(apisPath) ? apisPath : null);
if (!apisFile) {
  console.error('APIS2.txt or APIS.txt not found in project root.');
  process.exit(1);
}

let content = fs.readFileSync(apisFile, 'utf8');
const railPath = path.join(projectRoot, 'rail.txt');
if (fs.existsSync(railPath)) {
  content += '\n' + fs.readFileSync(railPath, 'utf8');
}

const keys = {
  // AI
  SERP_API_KEY: (content.match(/SerpAPI Key\s+(\S+)/i) || [])[1],
  GROQ_API_KEY: (content.match(/groq\s*:\s*(gsk_[A-Za-z0-9]+)/i) || [])[1],
  GEMINI_API_KEY: (content.match(/GEMINI_API_KEY\s+(AIzaSy[A-Za-z0-9_-]+)/i) || [])[1] || (content.match(/(AIzaSy[A-Za-z0-9_-]+)/) || [])[1],
  OPENAI_API_KEY: (content.match(/sk-proj-[A-Za-z0-9_-]+/) || [])[0],
  // AliExpress Affiliate
  ALIEXPRESS_APP_KEY: null,
  ALIEXPRESS_APP_SECRET: null,
  ALIEXPRESS_TRACKING_ID: (content.match(/ALIEXPRESS_AFFILIATE_TRACKING_ID=(\S+)/i) || [])[1] || 'ivanreseller',
  ALIEXPRESS_AFFILIATE_TRACKING_ID: (content.match(/ALIEXPRESS_AFFILIATE_TRACKING_ID=(\S+)/i) || [])[1],
  // AliExpress Dropshipping
  ALIEXPRESS_DROPSHIPPING_APP_KEY: null,
  ALIEXPRESS_DROPSHIPPING_APP_SECRET: (content.match(/ALIEXPRESS_DROPSHIPPING_APP_SECRET\s*=\s*(\S+)/) || [])[1],
  ALIEXPRESS_DROPSHIPPING_REDIRECT_URI: (content.match(/ALIEXPRESS_DROPSHIPPING_REDIRECT_URI\s*=\s*(\S+)/) || [])[1],
  ALIEXPRESS_DROPSHIPPING_TRACKING_ID: (content.match(/ALIEXPRESS_DROPSHIPPING_TRACKING_ID=(\S+)/i) || [])[1],
  // Scraping
  SCRAPERAPI_KEY: (content.match(/ScraperAPI\s+Key\s*:\s*(\S+)/i) || [])[1],
  SCRAPER_API_KEY: null,
  ZENROWS_API_KEY: (content.match(/ZenRows\s+API:\s*(\S+)/i) || [])[1],
  // eBay Production (default)
  EBAY_APP_ID: (content.match(/IvanMart-IVANRese-PRD-[a-f0-9-]+/) || [])[0],
  EBAY_DEV_ID: null,
  EBAY_CERT_ID: null,
  EBAY_REDIRECT_URI: null,
  EBAY_RUNAME: null,
  EBAY_PRODUCTION_APP_ID: null,
  EBAY_PRODUCTION_DEV_ID: null,
  EBAY_PRODUCTION_CERT_ID: null,
  EBAY_PRODUCTION_REDIRECT_URI: null,
  EBAY_SANDBOX_APP_ID: null,
  EBAY_SANDBOX_DEV_ID: null,
  EBAY_SANDBOX_CERT_ID: null,
  EBAY_SANDBOX_REDIRECT_URI: null,
  // Internal
  INTERNAL_RUN_SECRET: (content.match(/INTERNAL_RUN_SECRET\s*=\s*(\S+)/) || [])[1],
  ENCRYPTION_KEY: (content.match(/ENCRYPTION_KEY\s*=\s*(\S+)/) || [])[1],
  // PayPal
  PAYPAL_CLIENT_ID: null,
  PAYPAL_CLIENT_SECRET: null,
  PAYPAL_PRODUCTION_CLIENT_ID: null,
  PAYPAL_PRODUCTION_CLIENT_SECRET: null,
  // Notifications
  SENDGRID_API_KEY: (content.match(/SENDGRID_API_KEY\s+(\S+)/i) || [])[1],
  // Stripe
  STRIPE_SECRET_KEY: null,
  STRIPE_PUBLISHABLE_KEY: null,
  STRIPE_WEBHOOK_SECRET: null,
};
// PayPal Sandbox (PayPal section -> Sandbox)
const sandboxIdx = content.indexOf('Sandbox:');
if (sandboxIdx >= 0) {
  const sand = content.substring(sandboxIdx, sandboxIdx + 400);
  const cid = sand.match(/Client ID\s+([A-Za-z0-9_-]{30,})/i);
  const sec = sand.match(/Secret\s+([A-Za-z0-9_-]{30,})/i);
  if (cid) keys.PAYPAL_CLIENT_ID = cid[1];
  if (sec) keys.PAYPAL_CLIENT_SECRET = sec[1];
}
// PayPal Live (client ID AYH1..., secret Key EKjZ...)
const liveIdx = content.indexOf('Live:');
if (liveIdx >= 0) {
  const afterLive = content.substring(liveIdx);
  const liveCid = afterLive.match(/client ID\s+([A-Za-z0-9_-]{30,})/i);
  const liveSec = afterLive.match(/secret Key\s+([A-Za-z0-9_-]{30,})/i);
  if (liveCid) keys.PAYPAL_PRODUCTION_CLIENT_ID = liveCid[1];
  if (liveSec) keys.PAYPAL_PRODUCTION_CLIENT_SECRET = liveSec[1];
}
// Si no hay Live, usar Sandbox como fallback para PAYPAL_CLIENT_ID/SECRET
if (!keys.PAYPAL_PRODUCTION_CLIENT_ID) keys.PAYPAL_PRODUCTION_CLIENT_ID = keys.PAYPAL_CLIENT_ID;
if (!keys.PAYPAL_PRODUCTION_CLIENT_SECRET) keys.PAYPAL_PRODUCTION_CLIENT_SECRET = keys.PAYPAL_CLIENT_SECRET;

// AliExpress Dropshipping (Drop Shipping section, antes de Affiliates)
const dsIdx = content.indexOf('Drop Shipping');
if (dsIdx >= 0) {
  const dsBlock = content.substring(dsIdx, dsIdx + 600);
  const dsKey = dsBlock.match(/AppKey\s*\n\s*(\d+)/);
  const dsSecret = dsBlock.match(/App Secret\s*\n\s*([A-Za-z0-9]+)/);
  if (dsKey) keys.ALIEXPRESS_DROPSHIPPING_APP_KEY = dsKey[1];
  // Preferir ALIEXPRESS_DROPSHIPPING_APP_SECRET= explícito (rail.txt) sobre APIS2
  if (dsSecret && !keys.ALIEXPRESS_DROPSHIPPING_APP_SECRET) keys.ALIEXPRESS_DROPSHIPPING_APP_SECRET = dsSecret[1];
}
// AliExpress Affiliate (Affiliates API)
const affIdx = content.indexOf('Affiliates API');
if (affIdx >= 0) {
  const afterAff = content.substring(affIdx);
  const appKeyM = afterAff.match(/AppKey\s*\n\s*(\d+)/);
  const appSecretM = afterAff.match(/App Secret\s*\n\s*([A-Za-z0-9]+)/);
  if (appKeyM) keys.ALIEXPRESS_APP_KEY = appKeyM[1];
  if (appSecretM) keys.ALIEXPRESS_APP_SECRET = appSecretM[1];
}

// eBay Production (eBay producción)
const prodIdx = content.indexOf('eBay producción');
if (prodIdx >= 0) {
  const prodBlock = content.substring(prodIdx, prodIdx + 500);
  const appId = prodBlock.match(/IvanMart-IVANRese-PRD-[a-f0-9-]+/);
  const devId = prodBlock.match(/Dev ID\s+([a-f0-9-]{36})/);
  const certId = prodBlock.match(/Cert ID \(Client Secret\)\s+(PRD-[a-f0-9-]+)/i) || prodBlock.match(/PRD-[a-f0-9-]+/);
  const ruName = prodBlock.match(/Redirect URI \(RuName\)\s+(\S+)/i);
  if (appId) keys.EBAY_PRODUCTION_APP_ID = keys.EBAY_APP_ID = appId[0];
  if (devId) keys.EBAY_PRODUCTION_DEV_ID = keys.EBAY_DEV_ID = devId[1];
  if (certId) keys.EBAY_PRODUCTION_CERT_ID = keys.EBAY_CERT_ID = (certId[1] || certId[0]);
  if (ruName) keys.EBAY_PRODUCTION_REDIRECT_URI = keys.EBAY_REDIRECT_URI = keys.EBAY_RUNAME = ruName[1];
}
// eBay Sandbox
const sbxIdx = content.indexOf('eBay (SandBox)');
if (sbxIdx >= 0) {
  const sbxBlock = content.substring(sbxIdx, sbxIdx + 500);
  const appId = sbxBlock.match(/IvanMart-IVANRese-SBX-[a-f0-9-]+/);
  const devId = sbxBlock.match(/Dev ID\s+([a-f0-9-]{36})/);
  const certId = sbxBlock.match(/Cert ID \(Client Secret\)\s+(SBX-[a-f0-9-]+)/i) || sbxBlock.match(/SBX-[a-f0-9-]+/);
  const ruName = sbxBlock.match(/Redirect URI \(RuName\)\s+(\S+)/i);
  if (appId) keys.EBAY_SANDBOX_APP_ID = appId[0];
  if (devId) keys.EBAY_SANDBOX_DEV_ID = devId[1];
  if (certId) keys.EBAY_SANDBOX_CERT_ID = (certId[1] || certId[0]);
  if (ruName) keys.EBAY_SANDBOX_REDIRECT_URI = ruName[1];
}
// Fallback eBay RuName si no se extrajo por sección
if (!keys.EBAY_RUNAME) {
  keys.EBAY_RUNAME = (content.match(/EBAY_RUNAME\s*=\s*(\S+)/) || [])[1]
    || (content.match(/RuName\s*[:\s]+(\S+)/gi) || [])[0]?.replace(/RuName\s*[:\s]+/i, '')
    || (content.match(/(Ivan_Marty-[A-Za-z0-9-]+)/) || [])[1];
}
if (!keys.EBAY_REDIRECT_URI && keys.EBAY_RUNAME) keys.EBAY_REDIRECT_URI = keys.EBAY_RUNAME;

// Stripe (pk_test = publishable, sk_test = secret)
const pkMatch = content.match(/pk_test_[A-Za-z0-9]+/);
const skMatch = content.match(/sk_test_[A-Za-z0-9]+/);
if (pkMatch) keys.STRIPE_PUBLISHABLE_KEY = pkMatch[0];
if (skMatch) keys.STRIPE_SECRET_KEY = skMatch[0];
keys.STRIPE_WEBHOOK_SECRET = (content.match(/STRIPE_WEBHOOK_SECRET\s+(sk_test_[A-Za-z0-9]+)/i) || [])[1];

if (keys.SCRAPERAPI_KEY) keys.SCRAPER_API_KEY = keys.SCRAPERAPI_KEY;

// AliExpress Dropshipping: Redirect URI debe coincidir EXACTAMENTE con AliExpress Developer Console
// Valor canónico desde consola: https://ivanreseller.com/api/marketplace-oauth/callback
if (!keys.ALIEXPRESS_DROPSHIPPING_REDIRECT_URI) {
  keys.ALIEXPRESS_DROPSHIPPING_REDIRECT_URI = 'https://ivanreseller.com/api/marketplace-oauth/callback';
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return new Map();
  const c = fs.readFileSync(filePath, 'utf8');
  const map = new Map();
  c.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) map.set(m[1], m[2].replace(/^["']|["']$/g, ''));
  });
  return map;
}

if (!fs.existsSync(envLocalPath)) {
  if (fs.existsSync(examplePath)) fs.copyFileSync(examplePath, envLocalPath);
  else { console.error('.env.local and env.local.example not found.'); process.exit(1); }
}

require('dotenv').config({ path: path.join(cwd, '.env') });
if (fs.existsSync(envLocalPath)) require('dotenv').config({ path: envLocalPath, override: true });

const map = parseEnvFile(envLocalPath);
const updates = [];
for (const [k, v] of Object.entries(keys)) {
  if (v && v !== 'REPLACE_ME') {
    if (map.get(k) !== v) { map.set(k, v); updates.push(k); }
  }
}

if (process.env.DATABASE_URL && process.env.DATABASE_URL !== 'REPLACE_ME') {
  if (map.get('DATABASE_URL') === 'REPLACE_ME' || !map.get('DATABASE_URL')) {
    map.set('DATABASE_URL', process.env.DATABASE_URL);
    updates.push('DATABASE_URL');
  }
}

if (keys.INTERNAL_RUN_SECRET && keys.INTERNAL_RUN_SECRET !== 'REPLACE_ME') {
  if (map.get('INTERNAL_RUN_SECRET') !== keys.INTERNAL_RUN_SECRET) {
    map.set('INTERNAL_RUN_SECRET', keys.INTERNAL_RUN_SECRET);
    updates.push('INTERNAL_RUN_SECRET');
  }
} else if (!map.get('INTERNAL_RUN_SECRET') || map.get('INTERNAL_RUN_SECRET') === 'REPLACE_ME') {
  map.set('INTERNAL_RUN_SECRET', crypto.randomBytes(32).toString('hex'));
  updates.push('INTERNAL_RUN_SECRET');
}
if (!map.get('JWT_SECRET') || map.get('JWT_SECRET') === 'REPLACE_ME' || (map.get('JWT_SECRET') || '').length < 32) {
  map.set('JWT_SECRET', crypto.randomBytes(32).toString('hex'));
  updates.push('JWT_SECRET');
}
// ENCRYPTION_KEY: usar la de Railway (APIS2/rail.txt) para desencriptar credenciales OAuth
if (keys.ENCRYPTION_KEY && keys.ENCRYPTION_KEY.length >= 32) {
  if (map.get('ENCRYPTION_KEY') !== keys.ENCRYPTION_KEY) {
    map.set('ENCRYPTION_KEY', keys.ENCRYPTION_KEY);
    updates.push('ENCRYPTION_KEY');
  }
} else if (!map.get('ENCRYPTION_KEY') || map.get('ENCRYPTION_KEY') === 'REPLACE_ME' || (map.get('ENCRYPTION_KEY') || '').length < 32) {
  map.set('ENCRYPTION_KEY', crypto.randomBytes(32).toString('hex'));
  updates.push('ENCRYPTION_KEY');
}

const keyOrder = [
  'INTERNAL_RUN_SECRET', 'ENCRYPTION_KEY', 'JWT_SECRET',
  'SERP_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY',
  'ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'ALIEXPRESS_TRACKING_ID', 'ALIEXPRESS_AFFILIATE_TRACKING_ID',
  'ALIEXPRESS_DROPSHIPPING_APP_KEY', 'ALIEXPRESS_DROPSHIPPING_APP_SECRET', 'ALIEXPRESS_DROPSHIPPING_REDIRECT_URI', 'ALIEXPRESS_DROPSHIPPING_TRACKING_ID',
  'SCRAPERAPI_KEY', 'SCRAPER_API_KEY', 'ZENROWS_API_KEY',
  'EBAY_APP_ID', 'EBAY_DEV_ID', 'EBAY_CERT_ID', 'EBAY_REDIRECT_URI', 'EBAY_RUNAME',
  'EBAY_PRODUCTION_APP_ID', 'EBAY_PRODUCTION_DEV_ID', 'EBAY_PRODUCTION_CERT_ID', 'EBAY_PRODUCTION_REDIRECT_URI',
  'EBAY_SANDBOX_APP_ID', 'EBAY_SANDBOX_DEV_ID', 'EBAY_SANDBOX_CERT_ID', 'EBAY_SANDBOX_REDIRECT_URI',
  'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_PRODUCTION_CLIENT_ID', 'PAYPAL_PRODUCTION_CLIENT_SECRET',
  'SENDGRID_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET',
  'DATABASE_URL', 'PORT'
];
const existingLines = fs.readFileSync(envLocalPath, 'utf8').split(/\r?\n/);
const written = new Set();
const outLines = [];
for (const line of existingLines) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && map.has(m[1])) {
    outLines.push(`${m[1]}=${map.get(m[1])}`);
    written.add(m[1]);
  } else {
    outLines.push(line);
  }
}
for (const k of keyOrder) {
  if (map.has(k) && !written.has(k)) outLines.push(`${k}=${map.get(k)}`);
}
fs.writeFileSync(envLocalPath, outLines.join('\n'), 'utf8');
console.log('Injected from', path.basename(apisFile) + ':', updates.join(', ') || '(none)');
