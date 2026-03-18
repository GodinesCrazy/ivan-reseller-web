/**
 * Verify GET /api/orders real-orders-only filter logic (Phase 44).
 * Run: npx tsx scripts/verify-orders-real-filter.ts
 */

import { isRealMarketplaceOrderPaypalId, buildRealOrdersWhere } from '../src/utils/orders-real-filter';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log('Verifying orders-real-filter...\n');

// Included
assert(isRealMarketplaceOrderPaypalId('ebay:17-14370-63716') === true, 'ebay order should be included');
assert(isRealMarketplaceOrderPaypalId('mercadolibre:123') === true, 'mercadolibre order should be included');
assert(isRealMarketplaceOrderPaypalId('amazon:AMZ-1') === true, 'amazon order should be included');

// Excluded
assert(isRealMarketplaceOrderPaypalId('checkout:abc') === false, 'checkout should be excluded');
assert(isRealMarketplaceOrderPaypalId('TEST-1') === false, 'TEST prefix should be excluded');
assert(isRealMarketplaceOrderPaypalId(null) === false, 'null should be excluded');
assert(isRealMarketplaceOrderPaypalId('') === false, 'empty should be excluded');

// Prisma where shape
const where = buildRealOrdersWhere({ userId: 1 });
assert(Array.isArray(where.OR) && where.OR.length === 3, 'OR should have 3 marketplace prefixes');
assert(Array.isArray(where.AND) && where.AND.length > 0, 'AND should have exclude prefixes');

console.log('All checks passed.');
process.exit(0);
