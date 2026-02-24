/**
 * Check real status of all required environment variables.
 * Run: node scripts/check-env-status.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local'), override: true });

const env = process.env;

function status(val, minLen = 0) {
  if (!val || (typeof val === 'string' && !val.trim())) return { ok: false, val: '(vacío)' };
  const v = String(val).trim();
  if (minLen > 0 && v.length < minLen) return { ok: false, val: `(${v.length} chars, mínimo ${minLen})` };
  return { ok: true, val: v.length > 20 ? v.substring(0, 12) + '...' + v.substring(v.length - 4) : '***' };
}

const checks = [
  // CRÍTICAS
  { name: 'DATABASE_URL', val: env.DATABASE_URL, minLen: 20 },
  { name: 'JWT_SECRET', val: env.JWT_SECRET, minLen: 32 },
  { name: 'ENCRYPTION_KEY', val: env.ENCRYPTION_KEY, minLen: 32 },
  // CORE
  { name: 'NODE_ENV', val: env.NODE_ENV },
  { name: 'PORT', val: env.PORT || '4000' },
  { name: 'CORS_ORIGIN', val: env.CORS_ORIGIN },
  { name: 'REDIS_URL', val: env.REDIS_URL },
  // SCRAPING (al menos una)
  { name: 'SCRAPER_API_KEY', val: env.SCRAPER_API_KEY },
  { name: 'SCRAPERAPI_KEY', val: env.SCRAPERAPI_KEY },
  { name: 'ZENROWS_API_KEY', val: env.ZENROWS_API_KEY },
  // EBAY
  { name: 'EBAY_APP_ID', val: env.EBAY_APP_ID || env.EBAY_CLIENT_ID },
  { name: 'EBAY_CLIENT_ID', val: env.EBAY_CLIENT_ID || env.EBAY_APP_ID },
  { name: 'EBAY_CERT_ID', val: env.EBAY_CERT_ID || env.EBAY_CLIENT_SECRET },
  { name: 'EBAY_CLIENT_SECRET', val: env.EBAY_CLIENT_SECRET || env.EBAY_CERT_ID },
  { name: 'EBAY_RUNAME', val: env.EBAY_RUNAME || env.EBAY_REDIRECT_URI },
  // ALIEXPRESS
  { name: 'ALIEXPRESS_APP_KEY', val: env.ALIEXPRESS_APP_KEY },
  { name: 'ALIEXPRESS_APP_SECRET', val: env.ALIEXPRESS_APP_SECRET },
  { name: 'ALIEXPRESS_REDIRECT_URI', val: env.ALIEXPRESS_REDIRECT_URI },
  { name: 'ALIEXPRESS_TRACKING_ID', val: env.ALIEXPRESS_TRACKING_ID },
  // PAYPAL
  { name: 'PAYPAL_CLIENT_ID', val: env.PAYPAL_CLIENT_ID },
  { name: 'PAYPAL_CLIENT_SECRET', val: env.PAYPAL_CLIENT_SECRET },
  { name: 'PAYPAL_ENVIRONMENT', val: env.PAYPAL_ENVIRONMENT || env.PAYPAL_ENV },
  // OPCIONALES
  { name: 'WEB_BASE_URL', val: env.WEB_BASE_URL },
  { name: 'FRONTEND_URL', val: env.FRONTEND_URL },
  { name: 'API_URL', val: env.API_URL },
  { name: 'MERCADOLIBRE_CLIENT_ID', val: env.MERCADOLIBRE_CLIENT_ID },
  { name: 'MERCADOLIBRE_CLIENT_SECRET', val: env.MERCADOLIBRE_CLIENT_SECRET },
  { name: 'INTERNAL_RUN_SECRET', val: env.INTERNAL_RUN_SECRET },
  { name: 'AUTOPILOT_MODE', val: env.AUTOPILOT_MODE },
];

const results = {};
for (const c of checks) {
  const s = status(c.val, c.minLen);
  results[c.name] = s.ok ? 'OK' : 'FALTA';
}

// Deduplicate (EBAY_APP_ID and EBAY_CLIENT_ID share value)
const unique = [];
const seen = new Set();
for (const c of checks) {
  if (seen.has(c.name)) continue;
  seen.add(c.name);
  const s = status(c.val, c.minLen);
  unique.push({ name: c.name, status: s.ok ? 'OK' : 'FALTA', detail: s.val });
}

console.log(JSON.stringify({ timestamp: new Date().toISOString(), variables: results }, null, 2));
