/**
 * Validación operativa CJ→eBay sin exponer secretos.
 * - Flags de entorno relevantes (solo presencia / valores no sensibles)
 * - Prueba pura de forma de supplierMetadata (bridge Order legacy)
 * - Conteos DB opcionales si hay DATABASE_URL
 *
 * Uso: cd backend && npm run cj-ebay:operational-validation
 */
import 'dotenv/config';
import { buildCjEbayBridgeSupplierMetadata } from '../src/services/marketplace-order-sync-cj-metadata';

function envPresent(key: string): boolean {
  const v = process.env[key];
  return typeof v === 'string' && v.trim().length > 0;
}

function envBool(key: string, defaultFalse = true): string {
  const v = (process.env[key] || '').trim().toLowerCase();
  if (!v) return defaultFalse ? 'false (default)' : '(unset)';
  return v === 'true' ? 'true' : 'false';
}

async function dbProbe(): Promise<void> {
  if (!envPresent('DATABASE_URL') && !envPresent('POSTGRES_URL')) {
    console.log('[db] DATABASE_URL/POSTGRES_URL: absent — skipping counts');
    return;
  }
  try {
    const { prisma } = await import('../src/config/database');
    const [listings, orders, ordersLegacyCj] = await Promise.all([
      prisma.cjEbayListing.count().catch(() => -1),
      prisma.cjEbayOrder.count().catch(() => -1),
      prisma.order.count({ where: { supplier: 'cj' } }).catch(() => -1),
    ]);
    console.log('[db] cj_ebay_listings (rows):', listings);
    console.log('[db] cj_ebay_orders (rows):', orders);
    console.log('[db] orders where supplier=cj (rows):', ordersLegacyCj);
    await prisma.$disconnect().catch(() => undefined);
  } catch (e) {
    console.log('[db] probe failed (non-fatal):', e instanceof Error ? e.message : String(e));
  }
}

function main(): void {
  console.log('=== CJ eBay — operational validation (no secrets logged) ===\n');

  console.log('[env] ENABLE_CJ_EBAY_MODULE:', envBool('ENABLE_CJ_EBAY_MODULE'));
  console.log('[env] BLOCK_NEW_PUBLICATIONS:', envBool('BLOCK_NEW_PUBLICATIONS'));
  console.log('[env] CJ_PHASE_D_ALLOW_PAY:', envBool('CJ_PHASE_D_ALLOW_PAY', false));
  console.log('[env] DATABASE_URL:', envPresent('DATABASE_URL') ? 'present' : 'absent');
  console.log('[env] REDIS_URL / REDIS_HOST:', envPresent('REDIS_URL') || envPresent('REDIS_HOST') ? 'present' : 'absent');
  console.log('[env] CJ_API_KEY / CJ_DROPSHIPPING_API_KEY:', envPresent('CJ_API_KEY') || envPresent('CJ_DROPSHIPPING_API_KEY') ? 'present' : 'absent');
  console.log('');

  const meta = buildCjEbayBridgeSupplierMetadata({
    id: 999,
    ebaySku: 'CJE_TEST_SKU',
    evaluationId: 1,
    shippingQuoteId: 2,
    product: { cjProductId: 'TEST_PID', title: 'Test' },
    variant: { cjVid: 'VID1', cjSku: 'SKU1' },
  });
  const required = [
    'mappingSource',
    'mappingConfidence',
    'supplier',
    'cjProductId',
    'cjVid',
    'cjSku',
    'ebaySku',
    'cjEbayListingId',
  ];
  const missing = required.filter((k) => !(k in meta));
  if (missing.length > 0) {
    console.error('[metadata] FAIL: missing keys', missing);
    process.exit(1);
  }
  console.log('[metadata] bridge shape OK; mappingSource=', meta.mappingSource, 'confidence=', meta.mappingConfidence);
  console.log('');
}

main();

void dbProbe().then(() => {
  console.log('\n[cj-ebay:operational-validation] done.');
  process.exit(0);
});
