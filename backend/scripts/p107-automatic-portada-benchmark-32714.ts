#!/usr/bin/env tsx
/**
 * P107 — Benchmark automatic portada normalization for product 32714 using supplier images only
 * (strips supplement-hero metadata in-memory; does not persist that strip).
 *
 * From backend/:
 *   npx tsx scripts/p107-automatic-portada-benchmark-32714.ts
 *
 * Output: ../p107-benchmark-32714.json
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
const OUT = path.join(process.cwd(), '..', 'p107-benchmark-32714.json');

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
  });

  const lastTrial = attempt.trace.trials[attempt.trace.trials.length - 1];
  const payload: Record<string, unknown> = {
    productId: PRODUCT_ID,
    executedAt: new Date().toISOString(),
    benchmark: 'P107 supplier-only automatic multi-recipe portada',
    supplierUrlCount: urls.length,
    rankedSources: attempt.trace.rankedSources,
    portadaSourcePlan: attempt.trace.portadaSourcePlan,
    automaticPortadaClassification: attempt.trace.automaticPortadaClassification ?? null,
    p103Ok: attempt.ok,
    winningUrl: attempt.winningUrl ?? null,
    winningRecipeId: attempt.winningRecipeId ?? null,
    winningSourceKind: attempt.winningSourceKind ?? null,
    failClosedReason: attempt.trace.failClosedReason ?? null,
    trials: attempt.trace.trials,
    coverSha256:
      attempt.ok && attempt.pngBuffer
        ? crypto.createHash('sha256').update(attempt.pngBuffer).digest('hex')
        : null,
    lastTrialRecipeSummary:
      lastTrial?.recipeTrials?.map((r) => ({
        recipeId: r.recipeId,
        strictNaturalPass: r.strictNaturalPass,
        strictNaturalSignals: r.strictNaturalSignals?.slice(0, 8),
        heroPass: r.heroPass,
        integrityPass: r.integrityPass,
      })) ?? null,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log(JSON.stringify({ written: OUT, p103Ok: attempt.ok, classification: payload.automaticPortadaClassification }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  fs.writeFileSync(OUT, JSON.stringify({ fatalError: String(e) }, null, 2), 'utf8');
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
