#!/usr/bin/env node
/**
 * POST /api/internal/single-article-to-publish — un solo artículo, sin tendencias ni búsqueda.
 *
 * Env:
 *   INTERNAL_RUN_SECRET (required)
 *   BASE_URL (optional)
 *   MLC_USER_ID / USER_ID (optional)
 *   SINGLE_ARTICLE_URL — URL AliExpress del producto (required unless PRODUCT_ID set)
 *   PRODUCT_ID — publicar producto ya existente del usuario (optional)
 *   MLC_KEYWORD no aplica; opcional: TITLE, COST_USD, SUGGESTED_PRICE_USD, MAX_PRICE_USD
 *   MLC_CREDENTIAL_ENV=production|sandbox (default production)
 *
 * Args: --dry-run
 *
 * Example:
 *   INTERNAL_RUN_SECRET=xxx SINGLE_ARTICLE_URL="https://www.aliexpress.com/item/100500....html" node scripts/run-single-article-internal-publish.mjs --dry-run
 */

const BASE = (process.env.BASE_URL || 'https://ivan-reseller-backend-production.up.railway.app').replace(
  /\/+$/,
  ''
);
const SECRET = process.env.INTERNAL_RUN_SECRET || '';
const dryRun = process.argv.includes('--dry-run');

if (!SECRET) {
  console.error('Set INTERNAL_RUN_SECRET');
  process.exit(1);
}

const userId = parseInt(process.env.MLC_USER_ID || process.env.USER_ID || '', 10);
const productId = parseInt(process.env.PRODUCT_ID || '', 10);
const aliexpressUrl = (process.env.SINGLE_ARTICLE_URL || process.argv[2] || '').trim();
const credEnv = String(process.env.MLC_CREDENTIAL_ENV || 'production').toLowerCase();

if (!(Number.isFinite(productId) && productId > 0) && !aliexpressUrl) {
  console.error('Set SINGLE_ARTICLE_URL (env or first arg) or PRODUCT_ID');
  process.exit(1);
}

const marketplace =
  String(process.env.MARKETPLACE || 'mercadolibre').toLowerCase() === 'ebay' ? 'ebay' : 'mercadolibre';

const body = {
  marketplace,
  maxPriceUsd: parseFloat(process.env.MAX_PRICE_USD || '10') || 10,
  dryRun,
  ...(credEnv === 'production' || credEnv === 'sandbox' ? { credentialEnvironment: credEnv } : {}),
  ...(Number.isFinite(userId) && userId > 0 ? { userId } : {}),
  ...(Number.isFinite(productId) && productId > 0
    ? { productId }
    : {
        aliexpressUrl,
        ...(process.env.TITLE ? { title: process.env.TITLE } : {}),
        ...(process.env.COST_USD ? { costUsd: parseFloat(process.env.COST_USD) } : {}),
        ...(process.env.SUGGESTED_PRICE_USD
          ? { suggestedPriceUsd: parseFloat(process.env.SUGGESTED_PRICE_USD) }
          : {}),
        ...(process.env.DESCRIPTION ? { description: process.env.DESCRIPTION } : {}),
        ...(process.env.CATEGORY ? { category: process.env.CATEGORY } : {}),
      }),
};

async function main() {
  const url = `${BASE}/api/internal/single-article-to-publish`;
  console.log('POST', url, JSON.stringify({ ...body, dryRun: body.dryRun }));
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': SECRET,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log('HTTP', r.status);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text.slice(0, 4000));
  }
  if (!r.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
