/**
 * Phase C — real CJ flow: listV2 + selective freightCalculate (first single-variant product that quotes).
 * Does not print tokens or full API keys.
 *
 * Requires: CJ_API_KEY or CJ_DROPSHIPPING_API_KEY (same as cj-api:smoke).
 * Uses createCjSupplierAdapter(1) — ensure user 1 has CJ credential or env key is picked up by CredentialsManager.
 *
 * Usage: cd backend && npm run cj-api:deep-quote-smoke
 */
import 'dotenv/config';
import { createCjSupplierAdapter } from '../src/modules/cj-ebay/adapters/cj-supplier.adapter';
import { CjSupplierError } from '../src/modules/cj-ebay/adapters/cj-supplier.errors';

const SMOKE_USER_ID = Math.max(1, parseInt(process.env.CJ_SMOKE_USER_ID || '1', 10) || 1);

async function main(): Promise<void> {
  const apiKey = (process.env.CJ_API_KEY || process.env.CJ_DROPSHIPPING_API_KEY || '').trim();
  if (!apiKey) {
    console.error('[cj-deep-quote-smoke] NO-GO: set CJ_API_KEY or CJ_DROPSHIPPING_API_KEY');
    process.exit(2);
  }

  const adapter = createCjSupplierAdapter(SMOKE_USER_ID);
  console.log('[cj-deep-quote-smoke] listV2 search (keyWord=usb)...');
  const list = await adapter.searchProducts({ keyword: 'usb', page: 1, pageSize: 8 });
  console.log('[cj-deep-quote-smoke] list hits:', list.length);

  let listedOnlyOk = list.length > 0;
  let deepOk = false;
  let deepShippingUsd: number | null = null;
  let lastErr = '';

  for (const s of list) {
    const pid = String(s.cjProductId || '').trim();
    if (!pid) continue;
    try {
      const { quote } = await adapter.quoteShippingToUsReal({
        productId: pid,
        quantity: 1,
        destPostalCode: process.env.OPPORTUNITY_CJ_DEEP_QUOTE_DEST_ZIP?.trim(),
      });
      deepOk = true;
      deepShippingUsd = quote.cost;
      console.log('[cj-deep-quote-smoke] freightCalculate OK for pid length', pid.length, 'shippingUsd:', quote.cost);
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = msg;
      if (e instanceof CjSupplierError && e.code === 'CJ_INVALID_SKU' && msg.toLowerCase().includes('variant')) {
        console.log('[cj-deep-quote-smoke] skip multi-variant pid len', pid.length);
        continue;
      }
      if (e instanceof CjSupplierError && e.code === 'CJ_SHIPPING_UNAVAILABLE') {
        console.log('[cj-deep-quote-smoke] skip no shipping options pid len', pid.length);
        continue;
      }
      if (e instanceof CjSupplierError && e.code === 'CJ_AUTH_INVALID') {
        console.error('[cj-deep-quote-smoke] auth/credential issue — stopping');
        break;
      }
      console.warn('[cj-deep-quote-smoke] freight fail:', e instanceof CjSupplierError ? e.code : '', msg.slice(0, 120));
      continue;
    }
  }

  console.log(
    listedOnlyOk && deepOk
      ? `[cj-deep-quote-smoke] GO — list + deep freight (example shippingUsd=${deepShippingUsd})`
      : listedOnlyOk
        ? `[cj-deep-quote-smoke] PARTIAL — list OK, deep freight did not succeed (last: ${lastErr.slice(0, 80)})`
        : '[cj-deep-quote-smoke] NO-GO — empty list'
  );
  process.exit(listedOnlyOk && deepOk ? 0 : listedOnlyOk ? 1 : 1);
}

void main().catch((e) => {
  console.error('[cj-deep-quote-smoke] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
