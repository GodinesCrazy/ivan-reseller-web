#!/usr/bin/env tsx
/**
 * P109 — Benchmark autonomous v2 (segmentation variants + studio prep + P108 + P107) for product 32714.
 *
 *   npx tsx scripts/p109-automatic-portada-benchmark-32714.ts
 *
 * Set P109_BENCHMARK_FAST=1 for a reduced matrix (faster CI / smoke).
 *
 * Output: ../p109-benchmark-32714.json
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
const OUT = path.join(process.cwd(), '..', 'p109-benchmark-32714.json');

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
    .slice(0, 18)
    .map(([s, n]) => `${s}(${n})`);
}

async function main(): Promise<void> {
  const fast = process.env.P109_BENCHMARK_FAST === '1' || process.env.P109_BENCHMARK_FAST === 'true';

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
    p109V2: true,
    ...(fast
      ? {
          segmentationVariantOrder: ['p103_v1_default', 'p109_border_relaxed'],
          studioPrepOrder: ['p109_none', 'p109_halo_light'],
          recoveryProfileOrder: ['p108_none', 'p108_feather_alpha_light', 'p108_feather_alpha_medium'],
        }
      : {}),
  });

  const payload: Record<string, unknown> = {
    productId: PRODUCT_ID,
    executedAt: new Date().toISOString(),
    benchmark: 'P109 supplier-only autonomous v2 (seg × studio × P108 × P107)',
    benchmarkFastMode: fast,
    supplierUrlCount: urls.length,
    recoveryEngineVersion: attempt.trace.recoveryEngineVersion ?? null,
    segmentationVariantsAttempted: attempt.trace.segmentationVariantsAttempted ?? [],
    studioPrepIdsAttempted: attempt.trace.studioPrepIdsAttempted ?? [],
    advancedRecoveryEnabled: attempt.trace.advancedRecoveryEnabled ?? false,
    recoveryProfilesAttempted: attempt.trace.recoveryProfilesAttempted ?? [],
    rankedSources: attempt.trace.rankedSources,
    automaticPortadaClassification: attempt.trace.automaticPortadaClassification ?? null,
    p103Ok: attempt.ok,
    winningUrl: attempt.winningUrl ?? null,
    winningRecipeId: attempt.winningRecipeId ?? null,
    winningRecoveryProfileId: attempt.winningRecoveryProfileId ?? null,
    winningSegmentationVariantId: attempt.winningSegmentationVariantId ?? null,
    winningStudioPrepId: attempt.winningStudioPrepId ?? null,
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
        recoveryEngineVersion: payload.recoveryEngineVersion,
        benchmarkFastMode: fast,
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
