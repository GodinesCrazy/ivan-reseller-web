/**
 * FASE 3 ? Test real placeOrder (no mock)
 * Requires: DATABASE_URL, ENCRYPTION_KEY (or JWT_SECRET), valid aliexpress-dropshipping OAuth in api_credentials.
 * Run from backend: node scripts/test-real-placeOrder.js
 * Uses compiled services; run "npm run build" first, then node dist/scripts/test-real-placeOrder.js
 * Or run via ts-node from backend: npx ts-node -r tsconfig-paths/register scripts/test-real-placeOrder.ts
 *
 * This script:
 * 1) Finds a user with valid OAuth (aliexpress-dropshipping, accessToken present)
 * 2) Builds a real request (productUrl, quantity, shippingAddress)
 * 3) Calls executePurchase(request, userId)
 * 4) Verifies response has orderId and success
 * 5) Optionally verifies DB: Order or PurchaseLog with that orderId
 *
 * WARNING: This can create a REAL order on AliExpress if the product URL and payment are valid.
 * Use a low-cost test product and ensure you accept the financial responsibility.
 */

const path = require('path');
const fs = require('fs');

const REPORT_PATH = path.resolve(__dirname, '..', '..', 'PLACEORDER_REAL_EXECUTION_REPORT.md');

function writeReport(fields) {
  const lines = [
    '# PLACEORDER REAL EXECUTION REPORT',
    '',
    'PLACEORDER_EXECUTION_STATUS: ' + (fields.PLACEORDER_EXECUTION_STATUS || 'NOT_RUN'),
    'ALIEXPRESS_ORDER_ID: ' + (fields.ALIEXPRESS_ORDER_ID || 'N/A'),
    'DB_UPDATE_STATUS: ' + (fields.DB_UPDATE_STATUS || 'N/A'),
    '',
    'Details: ' + (fields.details || 'Run script from backend with valid OAuth and optional REAL_PLACEORDER=1.'),
  ];
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log('[test-real-placeOrder] Report written to', REPORT_PATH);
}

async function main() {
  const realRun = process.env.REAL_PLACEORDER === '1';
  if (!realRun) {
    console.log('[test-real-placeOrder] Set REAL_PLACEORDER=1 to execute a real purchase. Exiting without calling API.');
    writeReport({
      PLACEORDER_EXECUTION_STATUS: 'SKIPPED',
      ALIEXPRESS_ORDER_ID: 'N/A',
      DB_UPDATE_STATUS: 'N/A',
      details: 'REAL_PLACEORDER not set. Set REAL_PLACEORDER=1 to run real executePurchase.',
    });
    return;
  }

  try {
    const { CredentialsManager } = await import('../src/services/credentials-manager.service');
    const { default: AliExpressAutoPurchaseService } = await import('../src/services/aliexpress-auto-purchase.service');
    const { prisma } = await import('../src/config/database');

    let userId = parseInt(process.env.TEST_USER_ID || '1', 10);
    const credsProd = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production');
    const credsSandbox = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'sandbox');
    const creds = credsProd && credsProd.accessToken ? credsProd : credsSandbox && credsSandbox.accessToken ? credsSandbox : null;
    if (!creds || !creds.accessToken) {
      const msg = 'No valid aliexpress-dropshipping OAuth for userId ' + userId;
      console.error('[test-real-placeOrder]', msg);
      writeReport({
        PLACEORDER_EXECUTION_STATUS: 'FAILED',
        ALIEXPRESS_ORDER_ID: 'N/A',
        DB_UPDATE_STATUS: 'N/A',
        details: msg,
      });
      process.exit(1);
    }

    const productUrl = process.env.TEST_PRODUCT_URL || 'https://www.aliexpress.com/item/1005001234567890.html';
    const request = {
      productUrl,
      quantity: 1,
      maxPrice: 999,
      shippingAddress: {
        fullName: process.env.TEST_FULL_NAME || 'Test User',
        addressLine1: process.env.TEST_ADDRESS || 'Test address',
        addressLine2: '',
        city: process.env.TEST_CITY || 'Test city',
        state: process.env.TEST_STATE || '',
        zipCode: process.env.TEST_ZIP || '10001',
        country: process.env.TEST_COUNTRY || 'US',
        phoneNumber: process.env.TEST_PHONE || '1234567890',
      },
    };

    const result = await AliExpressAutoPurchaseService.executePurchase(request, userId);

    const success = result && result.success && result.orderId;
    const orderId = result && result.orderId ? result.orderId : null;

    let dbStatus = 'N/A';
    if (orderId && orderId !== 'SIMULATED_ORDER_ID') {
      try {
        const log = await prisma.purchaseLog.findFirst({
          where: { orderId, userId },
          orderBy: { createdAt: 'desc' },
        });
        dbStatus = log ? 'PurchaseLog record found' : 'PurchaseLog not found (order may be from API only)';
      } catch (e) {
        dbStatus = 'Error checking DB: ' + (e && e.message);
      }
    }

    writeReport({
      PLACEORDER_EXECUTION_STATUS: success ? 'SUCCESS' : 'FAILED',
      ALIEXPRESS_ORDER_ID: orderId || 'N/A',
      DB_UPDATE_STATUS: dbStatus,
      details: success ? `orderId=${orderId}` : (result && result.error) || 'Unknown error',
    });

    if (!success) process.exit(1);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.error('[test-real-placeOrder]', msg);
    writeReport({
      PLACEORDER_EXECUTION_STATUS: 'FAILED',
      ALIEXPRESS_ORDER_ID: 'N/A',
      DB_UPDATE_STATUS: 'N/A',
      details: msg,
    });
    process.exit(1);
  }
}

main();
