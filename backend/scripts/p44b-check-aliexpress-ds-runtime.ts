#!/usr/bin/env tsx
/**
 * p44b — Verifica si AliExpress Dropshipping API puede hacer una llamada real de getProductInfo
 * para confirmar que las credenciales están operativas (runtime ready).
 */
import '../src/config/env';
import { PrismaClient } from '@prisma/client';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import { aliexpressDropshippingAPIService } from '../src/services/aliexpress-dropshipping-api.service';

const prisma = new PrismaClient();
const USER_ID = 1;
// Producto del listing activo
const TEST_PRODUCT_ID = '3256810079300907';
const SHIP_TO = 'CL';

async function main() {
  console.log('\n[P44B] === AliExpress DS API runtime check ===\n');

  const creds = await CredentialsManager.getCredentials(USER_ID, 'aliexpress-dropshipping', 'production');
  if (!creds) {
    console.log('[P44B] ❌ No aliexpress-dropshipping credentials found for userId=1');
    return;
  }
  const c = (creds as any).credentials || creds;
  console.log('[P44B] Credentials found:');
  console.log(`  appKey:       ${String(c.appKey || '').substring(0, 10)}...`);
  console.log(`  appSecret:    ${c.appSecret ? '✓ present' : '❌ missing'}`);
  console.log(`  accessToken:  ${c.accessToken ? '✓ present' : '❌ missing'}`);
  console.log(`  refreshToken: ${c.refreshToken ? '✓ present' : '❌ missing'}`);

  aliexpressDropshippingAPIService.setCredentials(c);
  const svc = aliexpressDropshippingAPIService;

  console.log(`\n[P44B] Calling getProductInfo(${TEST_PRODUCT_ID}, CL)…`);
  try {
    const product = await svc.getProductInfo(TEST_PRODUCT_ID, { localCountry: SHIP_TO });
    if (product?.productTitle || product?.productId) {
      console.log('[P44B] ✅ getProductInfo SUCCESS');
      console.log(`  title: ${(product?.productTitle || 'N/A').substring(0, 60)}`);
      console.log(`  productId: ${product?.productId || TEST_PRODUCT_ID}`);
    } else {
      console.log('[P44B] ⚠️  getProductInfo returned empty product — token may be expired');
      console.log('  Raw keys:', product ? Object.keys(product) : 'null');
    }
  } catch (e: any) {
    console.log('[P44B] ❌ getProductInfo FAILED:', e?.message);
    if (e?.message?.includes('access_denied') || e?.message?.includes('invalid_token') || e?.message?.includes('401')) {
      console.log('[P44B] → Token may be expired. Need to re-authorize AliExpress Dropshipping OAuth.');
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[P44B] ❌ FATAL:', e?.message);
  prisma.$disconnect();
  process.exit(1);
});
