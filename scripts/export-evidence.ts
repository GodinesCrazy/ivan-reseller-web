#!/usr/bin/env npx tsx
/**
 * Descarga GET /api/cj-ebay/orders/:orderId/evidence-summary y escribe JSON formateado a stdout
 * (o a archivo con --out) para pegar en documentación / plantilla 3E.4.
 *
 * NO llama a CJ ni eBay; solo tu API backend.
 *
 * Variables de entorno:
 *   CJ_EBAY_API_BASE   — ej. http://localhost:3000  (sin barra final)
 *   CJ_EBAY_JWT        — Bearer token del operador
 *   CJ_EBAY_ORDER_ID   — id interno cj_ebay_orders (cuid)
 *
 * Uso (desde raíz del monorepo, con backend levantado):
 *   set CJ_EBAY_API_BASE=http://localhost:3000
 *   set CJ_EBAY_JWT=...
 *   set CJ_EBAY_ORDER_ID=...
 *   npx tsx scripts/export-evidence.ts
 *
 *   npx tsx scripts/export-evidence.ts --out evidence-order.json
 */
import * as fs from 'node:fs';

function parseArgs(): { out?: string } {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  if (outIdx >= 0 && args[outIdx + 1]) {
    return { out: args[outIdx + 1] };
  }
  return {};
}

async function main(): Promise<void> {
  const base = (process.env.CJ_EBAY_API_BASE || '').replace(/\/$/, '');
  const token = (process.env.CJ_EBAY_JWT || '').trim();
  const orderId = (process.env.CJ_EBAY_ORDER_ID || '').trim();

  if (!base || !token || !orderId) {
    console.error(
      '[export-evidence] Set CJ_EBAY_API_BASE, CJ_EBAY_JWT, and CJ_EBAY_ORDER_ID (see script header).'
    );
    process.exit(1);
  }

  const url = `${base}/api/cj-ebay/orders/${encodeURIComponent(orderId)}/evidence-summary`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    console.error('[export-evidence] Non-JSON response', res.status, text.slice(0, 500));
    process.exit(1);
  }

  const pretty = `${JSON.stringify(body, null, 2)}\n`;
  const { out } = parseArgs();
  if (out) {
    fs.writeFileSync(out, pretty, 'utf8');
    console.error(`[export-evidence] Wrote ${out}`);
  } else {
    process.stdout.write(pretty);
  }
}

main().catch((e) => {
  console.error('[export-evidence]', e);
  process.exit(1);
});
