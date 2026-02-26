/**
 * Full Real Cycle Test ? Validación del ciclo real de dropshipping
 *
 * Requisitos: BACKEND_URL, INTERNAL_RUN_SECRET, y opcionalmente userId/productId/productUrl/price.
 * - Sin mocks: usa fulfillment real (executePurchase ? AliExpress Dropshipping API si userId + OAuth).
 * - Para ciclo completo con PayPal: el checkout debe hacerse manualmente; tras capture-order
 *   el backend ya ejecuta fulfillOrder automáticamente.
 *
 * Uso:
 *   BACKEND_URL=https://your-backend.up.railway.app INTERNAL_RUN_SECRET=xxx \
 *   node --loader ts-node/esm scripts/full-real-cycle-test.ts
 *   # Con userId/productId para Sale y Dropshipping API real:
 *   FULL_CYCLE_USER_ID=1 FULL_CYCLE_PRODUCT_ID=1 PRODUCT_URL="https://www.aliexpress.com/item/123.html" PRICE=25.99 ...
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const SECRET = process.env.INTERNAL_RUN_SECRET || '';
const USER_ID = process.env.FULL_CYCLE_USER_ID != null ? Number(process.env.FULL_CYCLE_USER_ID) : undefined;
const PRODUCT_ID = process.env.FULL_CYCLE_PRODUCT_ID != null ? Number(process.env.FULL_CYCLE_PRODUCT_ID) : undefined;
const PRODUCT_URL = process.env.PRODUCT_URL || 'https://www.aliexpress.com/item/4001234567890.html';
const PRICE = parseFloat(process.env.PRICE || '19.99') || 19.99;

async function main() {
  console.log('[FULL-REAL-CYCLE] Backend URL:', BACKEND_URL);
  if (!SECRET) {
    console.error('[FULL-REAL-CYCLE] INTERNAL_RUN_SECRET is required');
    process.exit(1);
  }

  const body: Record<string, unknown> = {
    productUrl: PRODUCT_URL,
    price: PRICE,
  };
  if (USER_ID != null && !Number.isNaN(USER_ID)) body.userId = USER_ID;
  if (PRODUCT_ID != null && !Number.isNaN(PRODUCT_ID)) body.productId = PRODUCT_ID;

  try {
    const res = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/api/internal/test-fulfillment-only`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': SECRET,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('[FULL-REAL-CYCLE] Response not JSON:', text.slice(0, 200));
      process.exit(1);
    }

    if (!res.ok) {
      console.error('[FULL-REAL-CYCLE] Request failed:', res.status, data);
      process.exit(1);
    }

    console.log('[FULL-REAL-CYCLE] Result:', JSON.stringify(data, null, 2));
    const success = data.success === true && (data.finalStatus === 'PURCHASED' || data.aliexpressOrderId);
    if (success) {
      console.log('[FULL-REAL-CYCLE] OK ? Fulfillment completed. OrderId:', data.orderId, 'AliExpressOrderId:', data.aliexpressOrderId);
    } else {
      console.log('[FULL-REAL-CYCLE] Fulfillment did not reach PURCHASED:', data.finalStatus, data.error || '');
    }
    process.exit(success ? 0 : 1);
  } catch (e: any) {
    console.error('[FULL-REAL-CYCLE] Error:', e?.message || e);
    process.exit(1);
  }
}

main();
