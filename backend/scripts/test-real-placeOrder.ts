/**
 * FASE 3 ? Test real placeOrder (no mock)
 * Run from backend: npx ts-node -r tsconfig-paths/register scripts/test-real-placeOrder.ts
 * Set REAL_PLACEORDER=1 to execute a real purchase (otherwise exits without calling API).
 */

import path from 'path';
import fs from 'fs';

const REPORT_PATH = path.resolve(process.cwd(), '..', 'PLACEORDER_REAL_EXECUTION_REPORT.md');

function writeReport(fields: Record<string, string>): void {
  const lines = [
    '# PLACEORDER REAL EXECUTION REPORT',
    '',
    'PLACEORDER_EXECUTION_STATUS: ' + (fields.PLACEORDER_EXECUTION_STATUS || 'NOT_RUN'),
    'ALIEXPRESS_ORDER_ID: ' + (fields.ALIEXPRESS_ORDER_ID || 'N/A'),
    'DB_UPDATE_STATUS: ' + (fields.DB_UPDATE_STATUS || 'N/A'),
    '',
    'Details: ' + (fields.details || 'Run script with REAL_PLACEORDER=1 and valid OAuth.'),
  ];
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log('[test-real-placeOrder] Report written to', REPORT_PATH);
}

async function main(): Promise<void> {
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
    const AliExpressAutoPurchaseService = (await import('../src/services/aliexpress-auto-purchase.service')).default;
    const { prisma } = await import('../src/config/database');

    const userId = parseInt(process.env.TEST_USER_ID || '1', 10);
    const credsProd = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production');
    const credsSandbox = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'sandbox');
    const creds = (credsProd?.accessToken ? credsProd : credsSandbox?.accessToken ? credsSandbox : null) as any;
    if (!creds?.accessToken) {
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

    const success = !!(result?.success && result?.orderId);
    const orderId = result?.orderId ?? null;

    let dbStatus = 'N/A';
    if (orderId && orderId !== 'SIMULATED_ORDER_ID') {
      try {
        const log = await prisma.purchaseLog.findFirst({
          where: { orderId, userId },
          orderBy: { createdAt: 'desc' },
        });
        dbStatus = log ? 'PurchaseLog record found' : 'PurchaseLog not found';
      } catch (e: any) {
        dbStatus = 'Error: ' + (e?.message || String(e));
      }
    }

    writeReport({
      PLACEORDER_EXECUTION_STATUS: success ? 'SUCCESS' : 'FAILED',
      ALIEXPRESS_ORDER_ID: orderId || 'N/A',
      DB_UPDATE_STATUS: dbStatus,
      details: success ? `orderId=${orderId}` : (result?.error) || 'Unknown error',
    });

    if (!success) process.exit(1);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
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
