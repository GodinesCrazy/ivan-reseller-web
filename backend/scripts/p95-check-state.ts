/**
 * P95 — Simple state check for product 32714. No mutations, just reads.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

import { prisma } from '../src/config/database';
import {
  resolveCanonicalMlChileFreightTruth,
} from '../src/services/pre-publish-validator.service';

const PRODUCT_ID = 32714;
const OUTPUT_FILE = path.join(__dirname, '..', '..', 'p95-state.json');

function parseMeta(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return {};
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
  } catch { return {}; }
}

async function main() {
  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
  });
  if (!product) throw new Error(`Product ${PRODUCT_ID} not found`);

  const meta = parseMeta(product.productData);

  const freightTruth = resolveCanonicalMlChileFreightTruth(
    {
      id: product.id,
      aliexpressUrl: product.aliexpressUrl || '',
      aliexpressSku: product.aliexpressSku,
      aliexpressPrice: product.aliexpressPrice,
      importTax: product.importTax,
      currency: product.currency,
      targetCountry: product.targetCountry,
      originCountry: product.originCountry,
      shippingCost: product.shippingCost,
      productData: product.productData,
    },
    'CL'
  );

  const result = {
    productId: PRODUCT_ID,
    checkedAt: new Date().toISOString(),
    dbColumns: {
      status: product.status,
      isPublished: product.isPublished,
      shippingCost: product.shippingCost,
      importTax: product.importTax,
      totalCost: product.totalCost,
      aliexpressPrice: product.aliexpressPrice,
      suggestedPrice: product.suggestedPrice,
      finalPrice: product.finalPrice,
      targetCountry: product.targetCountry,
      originCountry: product.originCountry,
      currency: product.currency,
      updatedAt: product.updatedAt,
    },
    metadataKeys: Object.keys(meta),
    mlChileFreight: meta.mlChileFreight || null,
    mlChileLandedCost: meta.mlChileLandedCost || null,
    mlChileFreightCompatibility: meta.mlChileFreightCompatibility || null,
    preventivePublish: meta.preventivePublish ? {
      auditedAt: (meta.preventivePublish as any).auditedAt,
      marketplace: (meta.preventivePublish as any).marketplace,
      shipCountry: (meta.preventivePublish as any).shipCountry,
      listingSalePriceUsd: (meta.preventivePublish as any).listingSalePriceUsd,
      policyComplianceReady: (meta.preventivePublish as any).policyComplianceReady,
      profitability: (meta.preventivePublish as any).profitability,
    } : null,
    canonicalFreightTruth: {
      status: freightTruth.status,
      ok: freightTruth.ok,
      reason: freightTruth.reason || null,
      truth: freightTruth.truth || null,
    },
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log('State written to ' + OUTPUT_FILE);
}

main()
  .catch((e) => {
    console.error('FAILED:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
