#!/usr/bin/env tsx
/**
 * P108 — Benchmark advanced automatic recovery for product 32714 (supplier-only, in-memory strip of supplement hero).
 *
 *   npx tsx scripts/p108-automatic-portada-benchmark-32714.ts
 *
 * Output: ../p108-benchmark-32714.json
 */
import 'dotenv/config';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { stripPortadaSupplementHeroFieldsForAutomaticBenchmark } from '../src/services/ml-image-readiness.service';
import { attemptMercadoLibreP103HeroPortadaFromUrls } from '../src/services/ml-portada-hero-reconstruction.service';
import { parseProductImageUrls } from '../src/services/marketplace-image-pipeline/candidate-scoring.service';
import { DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER } from '../src/services/ml-portada-recipes.service';

const PRODUCT_ID = 32714;
const OUT = path.join(process.cwd(), '..', 'p108-benchmark-32714.json');

function dominantSignalsFromTrials(trials: { recipeTrials?: { strictNaturalSignals?: string[] }[] }[]): string[] {
  const counts = new Map<string, number>();
  for (const t of trials) {
    for (const rt of t.recipeTrials ?? []) {
      for (const s of rt.strictNaturalSignals ?? []) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([s, n]) => `${s}(${n})`);
}

async function main(): Promise<void> {
  const row = await prisma.product.findUnique({ where: { id: PRODUCT_ID } });
  if (!row) {
    fs.writeFileSync(OUT, JSON.stringify({ fatalError: 'product_not_found' }, null, 2), 'utf8');
    process.exit(2);
    return;
  }

  const urls = parseProductImageUrls(row.images);
  const productDataAutomaticOnly = stripPortadaSupplementHeroFieldsForAutomaticBenchmark(row.productData);

  const attempt = await attemptMercadoLibreP103HeroPortadaFromUrls(urls, {
    maxTrials: 12,
    productData: productDataAutomaticOnly,
    multiRecipe: true,
    recipeOrder: [...DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER],
    advancedRecovery: true,
  });

  const payload: Record<string, unknown> = {
    productId: PRODUCT_ID,
    executedAt: new Date().toISOString(),
    benchmark: 'P108 supplier-only automatic multi-recipe + advanced recovery waves',
    supplierUrlCount: urls.length,
    advancedRecoveryEnabled: attempt.trace.advancedRecoveryEnabled ?? false,
    recoveryProfilesAttempted: attempt.trace.recoveryProfilesAttempted ?? [],
    rankedSources: attempt.trace.rankedSources,
    portadaSourcePlan: attempt.trace.portadaSourcePlan,
    automaticPortadaClassification: attempt.trace.automaticPortadaClassification ?? null,
    p103Ok: attempt.ok,
    winningUrl: attempt.winningUrl ?? null,
    winningRecipeId: attempt.winningRecipeId ?? null,
    winningRecoveryProfileId: attempt.winningRecoveryProfileId ?? null,
    winningSourceKind: attempt.winningSourceKind ?? null,
    failClosedReason: attempt.trace.failClosedReason ?? null,
    trials: attempt.trace.trials,
    dominantStrictNaturalSignalsAcrossAllVariants: dominantSignalsFromTrials(attempt.trace.trials),
    coverSha256:
      attempt.ok && attempt.pngBuffer
        ? crypto.createHash('sha256').update(attempt.pngBuffer).digest('hex')
        : null,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        written: OUT,
        p103Ok: attempt.ok,
        classification: payload.automaticPortadaClassification,
        recoveryWaves: (payload.recoveryProfilesAttempted as string[]).length,
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  fs.writeFileSync(OUT, JSON.stringify({ fatalError: String(e) }, null, 2), 'utf8');
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
