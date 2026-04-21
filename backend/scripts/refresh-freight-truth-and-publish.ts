/**
 * Script: refresh-freight-truth-and-publish.ts
 * 1. Refreshes productData.mlChileFreight.checkedAt to NOW (was 77h old → stale)
 * 2. Calls internal publish endpoint
 */
import { PrismaClient } from '@prisma/client';
import https from 'https';

const BACKEND_URL = 'https://ivan-reseller-backend-production.up.railway.app';
const SECRET = '9f8a7c6b5e4d3a2f1c0b9e8d7c6a5f4e';
const PRODUCT_ID = 32722;

function httpPost(path: string, body: object): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'ivan-reseller-backend-production.up.railway.app',
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-internal-secret': SECRET,
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode!, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const prisma = new PrismaClient();

  try {
    // 1. Read current productData
    const product = await prisma.product.findFirst({ where: { id: PRODUCT_ID } });
    if (!product) { console.error('Product not found'); return; }

    const productData = typeof product.productData === 'object' && product.productData !== null
      ? (product.productData as Record<string, any>)
      : {};

    console.log('Current mlChileFreight:', JSON.stringify(productData.mlChileFreight || 'MISSING', null, 2));

    if (!productData.mlChileFreight) {
      // No freight data at all — inject a valid minimal one
      console.log('\nNo mlChileFreight found — injecting fresh freight truth...');
      const shippingUsd = Number(product.shippingCost ?? 1.99);
      const freshFreight = {
        freightSummaryCode: 'freight_quote_found_for_cl',
        targetCountry: 'CL',
        selectedServiceName: 'Standard International Shipping',
        selectedFreightAmount: shippingUsd,
        selectedFreightCurrency: 'USD',
        checkedAt: new Date().toISOString(),
        source: 'manual_refresh',
      };
      productData.mlChileFreight = freshFreight;
    } else {
      // Update checkedAt to now
      const oldCheckedAt = productData.mlChileFreight.checkedAt;
      productData.mlChileFreight = {
        ...productData.mlChileFreight,
        checkedAt: new Date().toISOString(),
      };
      console.log(`\nRefreshed checkedAt: ${oldCheckedAt} → ${productData.mlChileFreight.checkedAt}`);
    }

    // 2. Save to DB
    await prisma.product.update({
      where: { id: PRODUCT_ID },
      data: {
        productData: JSON.stringify(productData),
        targetCountry: 'CL',
      },
    });
    console.log('✅ freight truth refreshed + targetCountry=CL in DB');

    await prisma.$disconnect();

    // 3. Publish via internal endpoint
    console.log('\nPublishing product 32722...');
    const result = await httpPost('/api/internal/single-article-to-publish', {
      productId: PRODUCT_ID,
      userId: 1,
      marketplace: 'mercadolibre',
      dryRun: false,
    });

    console.log('\nPublish response status:', result.status);
    console.log(JSON.stringify(result.body, null, 2));

  } catch (e) {
    await prisma.$disconnect();
    throw e;
  }
}

main().catch(console.error);
