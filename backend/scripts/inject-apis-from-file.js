#!/usr/bin/env node
/**
 * Inject API keys from APIS2.txt (or APIS.txt) into backend/.env.local.
 * Extracts: SERP_API_KEY, ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, SCRAPERAPI_KEY, ZENROWS_API_KEY,
 *           EBAY_*, GROQ_API_KEY, GEMINI_API_KEY, PAYPAL_*, ALIEXPRESS_TRACKING_ID.
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

const content = fs.readFileSync(apisFile, 'utf8');

const keys = {
  SERP_API_KEY: (content.match(/SerpAPI Key\s+(\S+)/i) || [])[1],
  ALIEXPRESS_APP_KEY: null,
  ALIEXPRESS_APP_SECRET: null,
  ALIEXPRESS_TRACKING_ID: (content.match(/ALIEXPRESS_AFFILIATE_TRACKING_ID=(\S+)/i) || [])[1] || 'ivanreseller',
  SCRAPERAPI_KEY: (content.match(/ScraperAPI\s+Key\s*:\s*(\S+)/i) || [])[1],
  SCRAPER_API_KEY: null,
  ZENROWS_API_KEY: (content.match(/ZenRows\s+API:\s*(\S+)/i) || [])[1],
  EBAY_APP_ID: (content.match(/IvanMart-IVANRese-PRD-[a-f0-9-]+/) || [])[0],
  EBAY_DEV_ID: (content.match(/Dev\s+ID\s+([a-f0-9-]{36})/) || [])[1],
  EBAY_CERT_ID: null,
  EBAY_REDIRECT_URI: (content.match(/EBAY_RUNAME\s*=\s*(\S+)/) || [])[1] || (content.match(/RuName\s*[:\s]+(\S+)/i) || [])[1] || (content.match(/([A-Za-z]+_[A-Za-z]+-[A-Za-z]+-[A-Za-z0-9-]+)/) || [])[1],
  EBAY_RUNAME: (content.match(/EBAY_RUNAME\s*=\s*(\S+)/) || [])[1] || (content.match(/RuName\s*[:\s]+(\S+)/i) || [])[1] || (content.match(/([A-Za-z]+_[A-Za-z]+-[A-Za-z]+-[A-Za-z0-9-]+)/) || [])[1],
  INTERNAL_RUN_SECRET: (content.match(/INTERNAL_RUN_SECRET\s*=\s*(\S+)/) || [])[1],
  GROQ_API_KEY: (content.match(/groq\s*:\s*(gsk_[A-Za-z0-9]+)/i) || [])[1],
  GEMINI_API_KEY: (content.match(/GEMINI_API_KEY\s+(AIzaSy[A-Za-z0-9_-]+)/i) || [])[1] || (content.match(/(AIzaSy[A-Za-z0-9_-]+)/) || [])[1],
  PAYPAL_CLIENT_ID: null,
  PAYPAL_CLIENT_SECRET: null,
};
const sandboxIdx = content.indexOf('Sandbox:');
if (sandboxIdx >= 0) {
  const sand = content.substring(sandboxIdx, sandboxIdx + 400);
  const cid = sand.match(/Client ID\s+([A-Za-z0-9_-]{30,})/i);
  const sec = sand.match(/Secret\s+([A-Za-z0-9_-]{30,})/i);
  if (cid) keys.PAYPAL_CLIENT_ID = cid[1];
  if (sec) keys.PAYPAL_CLIENT_SECRET = sec[1];
}

const affIdx = content.indexOf('Affiliates API');
if (affIdx >= 0) {
  const afterAff = content.substring(affIdx);
  const appKeyM = afterAff.match(/AppKey\s*\n\s*(\d+)/);
  const appSecretM = afterAff.match(/App Secret\s*\n\s*([A-Za-z0-9]+)/);
  if (appKeyM) keys.ALIEXPRESS_APP_KEY = appKeyM[1];
  if (appSecretM) keys.ALIEXPRESS_APP_SECRET = appSecretM[1];
}
const certM = content.match(/PRD-[a-f0-9-]+/g);
if (certM && certM.length >= 2) keys.EBAY_CERT_ID = certM[1];
else if (certM) keys.EBAY_CERT_ID = certM[0];
if (keys.SCRAPERAPI_KEY) keys.SCRAPER_API_KEY = keys.SCRAPERAPI_KEY;

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
if (!map.get('ENCRYPTION_KEY') || map.get('ENCRYPTION_KEY') === 'REPLACE_ME' || (map.get('ENCRYPTION_KEY') || '').length < 32) {
  map.set('ENCRYPTION_KEY', crypto.randomBytes(32).toString('hex'));
  updates.push('ENCRYPTION_KEY');
}

const keyOrder = ['INTERNAL_RUN_SECRET', 'SERP_API_KEY', 'ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'ALIEXPRESS_TRACKING_ID', 'SCRAPERAPI_KEY', 'SCRAPER_API_KEY', 'ZENROWS_API_KEY', 'EBAY_APP_ID', 'EBAY_DEV_ID', 'EBAY_CERT_ID', 'EBAY_REDIRECT_URI', 'EBAY_RUNAME', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY', 'PORT'];
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
