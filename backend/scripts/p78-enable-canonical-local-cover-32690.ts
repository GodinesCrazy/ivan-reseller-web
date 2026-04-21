#!/usr/bin/env tsx
/**
 * P78 — SKU 32690: allow canonical pipeline to score the on-disk approved `cover_main` as a candidate.
 * Does not weaken gates; only exposes the same dual-gate model to the local pack file.
 *
 * Usage: npx tsx scripts/p78-enable-canonical-local-cover-32690.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PRODUCT_ID = 32690;

async function main(): Promise<void> {
  const row = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, productData: true },
  });
  if (!row) {
    throw new Error(`product_${PRODUCT_ID}_not_found`);
  }
  let meta: Record<string, unknown> = {};
  if (typeof row.productData === 'string' && row.productData.trim()) {
    try {
      meta = JSON.parse(row.productData) as Record<string, unknown>;
    } catch {
      meta = {};
    }
  } else if (row.productData && typeof row.productData === 'object') {
    meta = { ...(row.productData as Record<string, unknown>) };
  }
  const prev = (meta.mlImagePipeline as Record<string, unknown> | undefined) ?? {};
  /** Matches remediation `DEFAULT_INSET` so `inset_white_catalog_png` is not skipped after square JPEG. */
  const insetCrop = { left: 0.38, top: 0.14, bottom: 0.26, right: 0.05 };
  meta.mlImagePipeline = {
    ...prev,
    canonicalEvaluateLocalApprovedCover: true,
    insetCrop,
    p78EnabledAt: new Date().toISOString(),
  };
  await prisma.product.update({
    where: { id: PRODUCT_ID },
    data: { productData: JSON.stringify(meta) },
  });
  console.log(JSON.stringify({ ok: true, productId: PRODUCT_ID, mlImagePipeline: meta.mlImagePipeline }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
