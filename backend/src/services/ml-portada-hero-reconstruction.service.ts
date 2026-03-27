/**
 * P103 — Mercado Libre portada from best-ranked raw source: border-color isolation + white-canvas hero + multi-gate validation.
 */
import fs from 'fs';
import { processFromUrlSafe } from './image-pipeline.service';
import {
  evaluateMlPortadaStrictAndNaturalGateFromBuffer,
} from './ml-portada-visual-compliance.service';
import {
  buildPortadaRebuildCandidateList,
  isPortadaSupplementHeroConfigured,
  parsePortadaSupplementHeroUrl,
  parsePortadaSupplementHeroWorkspacePath,
  type PortadaRebuildSourceKind,
} from './marketplace-image-pipeline/candidate-scoring.service';
import { rankPortadaSourceBuffersForP103, type P103RankedSourceRow } from './ml-portada-source-ranking.service';
import { evaluateHeroCoverQualityOnBuffer } from './marketplace-image-pipeline/hero-cover-quality-gate.service';
import { evaluateOutputIntegrityOnBuffer } from './marketplace-image-pipeline/output-integrity-gate.service';
import { getMercadoLibreChilePolicyProfile } from './marketplace-image-pipeline/policy-profiles';
import {
  applyPortadaRecoveryProfileToCutout,
  isAdvancedPortadaRecoveryGloballyEnabled,
  resolveRecoveryProfileOrder,
  type PortadaRecoveryProfileId,
} from './ml-portada-advanced-recovery.service';
import {
  isolateProductSubjectToPngWithVariant,
  isP109V2SegmentationGloballyEnabled,
  resolveSegmentationVariantOrder,
  type PortadaSegmentationVariantId,
} from './ml-portada-isolation.service';
import {
  applyP109StudioPrepToCutout,
  resolveP109StudioPrepOrder,
  type P109StudioPrepId,
} from './ml-portada-studio-prep-p109.service';
import {
  composePortadaHeroWithRecipe,
  DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER,
  LEGACY_P103_RECIPE_ID,
  type PortadaRecipeId,
} from './ml-portada-recipes.service';

export { isolateProductSubjectToPng } from './ml-portada-isolation.service';
export type { PortadaSegmentationVariantId } from './ml-portada-isolation.service';

/** P107/P108/P109 — outcome of automatic portada normalization (persisted / analytics). */
export type AutomaticPortadaClassification =
  | 'AUTOMATIC_COMPLIANT_PORTADA_PRODUCED'
  | 'IMAGE_SOURCE_INSUFFICIENT_FOR_MARKETPLACE'
  | 'AUTOMATIC_ADVANCED_RECOVERY_EXHAUSTED'
  | 'AUTONOMOUS_V2_RECOVERY_EXHAUSTED'
  | 'SUPPLEMENT_HERO_CONFIGURED_FAIL_CLOSED';

export interface P103RecipeTrialTrace {
  recipeId: PortadaRecipeId;
  /** P109 — segmentation variant that produced the cutout for this row. */
  segmentationVariantId?: PortadaSegmentationVariantId;
  /** P109 — RGB halo / studio prep before P108 alpha recovery. */
  studioPrepId?: P109StudioPrepId;
  /** P108 — cutout preprocessing wave before compose. */
  recoveryProfileId?: PortadaRecoveryProfileId;
  strictNaturalPass?: boolean;
  strictNaturalSignals?: string[];
  heroPass?: boolean;
  heroFailures?: string[];
  integrityPass?: boolean;
  integrityFailures?: string[];
}

export interface P103HeroTrialTrace {
  url: string;
  objectKey: string | null;
  /** Trial order under P105 priority (1 = first tried). */
  rank: number;
  sourceKind?: PortadaRebuildSourceKind;
  isolationOk: boolean;
  isolationReason?: string;
  strictNaturalPass?: boolean;
  strictNaturalSignals?: string[];
  heroPass?: boolean;
  heroFailures?: string[];
  integrityPass?: boolean;
  integrityFailures?: string[];
  /** P107 — recipes tried on this source after isolation. */
  recipeTrials?: P103RecipeTrialTrace[];
  winningRecipeId?: PortadaRecipeId;
}

export interface P103HeroAttemptTrace {
  rankedSources: P103RankedSourceRow[];
  trials: P103HeroTrialTrace[];
  /** Full ordered plan before download (supplement hero first when configured). */
  portadaSourcePlan?: Array<{
    url: string;
    objectKey: string | null;
    sourceKind: PortadaRebuildSourceKind;
    workspaceAbsolutePath?: string;
  }>;
  supplementHeroConfigured?: boolean;
  /** Fail-closed when `portadaSupplementHeroUrl` is set but not loadable; no silent supplier fallback. */
  failClosedReason?: string;
  /** When set, supplier `sourceKind` URLs were dropped from the trial queue (P105). */
  supplierTrialsSuppressedForSupplementHero?: boolean;
  automaticPortadaClassification?: AutomaticPortadaClassification;
  /** P108 — whether multi-wave alpha recovery was enabled for this attempt. */
  advancedRecoveryEnabled?: boolean;
  /** P108 — recovery profiles evaluated per source (wave order). */
  recoveryProfilesAttempted?: PortadaRecoveryProfileId[];
  /** P109 — segmentation variants tried this attempt. */
  segmentationVariantsAttempted?: PortadaSegmentationVariantId[];
  /** P109 — studio prep ids in matrix order. */
  studioPrepIdsAttempted?: P109StudioPrepId[];
  /** Engine label for mass-publish analytics. */
  recoveryEngineVersion?: string;
}

export interface P103HeroAttemptResult {
  ok: boolean;
  pngBuffer?: Buffer;
  winningUrl?: string;
  winningObjectKey?: string | null;
  winningSourceKind?: PortadaRebuildSourceKind;
  /** P107 — which reconstruction recipe produced the winning portada. */
  winningRecipeId?: PortadaRecipeId;
  /** P108 — recovery wave that produced the winning cutout preprocessing. */
  winningRecoveryProfileId?: PortadaRecoveryProfileId;
  /** P109 — winning segmentation + studio prep when applicable. */
  winningSegmentationVariantId?: PortadaSegmentationVariantId;
  winningStudioPrepId?: P109StudioPrepId;
  trace: P103HeroAttemptTrace;
}

export async function composeMercadoLibreP103HeroOnWhite(cutoutPng: Buffer): Promise<Buffer | null> {
  return composePortadaHeroWithRecipe(cutoutPng, LEGACY_P103_RECIPE_ID);
}

export async function attemptMercadoLibreP103HeroPortadaFromUrls(
  imageUrls: string[],
  options?: {
    maxTrials?: number;
    productData?: unknown;
    workspaceRoot?: string;
    /** When true (default), try {@link DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER} per isolated source (P107). */
    multiRecipe?: boolean;
    recipeOrder?: PortadaRecipeId[];
    /**
     * P108 — alpha feather / morphology waves before each recipe. Default follows `ML_P108_ADVANCED_RECOVERY`
     * env (on unless `0`/`false`). Set `false` to only use raw cutout (`p108_none`).
     */
    advancedRecovery?: boolean;
    recoveryProfileOrder?: PortadaRecoveryProfileId[];
    /**
     * P109 — extra segmentation variants + RGB halo studio prep. Default follows `ML_P109_V2` env
     * (on unless `0`/`false`).
     */
    p109V2?: boolean;
    segmentationVariantOrder?: PortadaSegmentationVariantId[];
    studioPrepOrder?: P109StudioPrepId[];
  }
): Promise<P103HeroAttemptResult> {
  const maxTrials = options?.maxTrials ?? 8;
  const useMultiRecipe = options?.multiRecipe !== false;
  const recipeOrder: PortadaRecipeId[] =
    options?.recipeOrder?.length ? options.recipeOrder : DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER;
  const recipesForSource = useMultiRecipe ? recipeOrder : [LEGACY_P103_RECIPE_ID];
  const advancedRecovery =
    options?.advancedRecovery !== undefined
      ? options.advancedRecovery
      : isAdvancedPortadaRecoveryGloballyEnabled();
  const recoveryProfiles: PortadaRecoveryProfileId[] =
    options?.recoveryProfileOrder?.length && options.recoveryProfileOrder.length > 0
      ? options.recoveryProfileOrder
      : resolveRecoveryProfileOrder(advancedRecovery);
  const p109Enabled = options?.p109V2 !== undefined ? options.p109V2 : isP109V2SegmentationGloballyEnabled();
  const segmentationOrder: PortadaSegmentationVariantId[] =
    options?.segmentationVariantOrder?.length && options.segmentationVariantOrder.length > 0
      ? options.segmentationVariantOrder
      : resolveSegmentationVariantOrder(p109Enabled);
  const studioPrepOrder: P109StudioPrepId[] =
    options?.studioPrepOrder?.length && options.studioPrepOrder.length > 0
      ? options.studioPrepOrder
      : resolveP109StudioPrepOrder(p109Enabled);
  const recoveryEngineVersion = p109Enabled
    ? 'p109_autonomous_v2'
    : advancedRecovery
      ? 'p108_alpha_waves'
      : 'p107_compose_only';
  const plan = buildPortadaRebuildCandidateList(imageUrls, options?.productData, options?.workspaceRoot);
  const portadaSourcePlan = plan.map((c) => ({
    url: c.url,
    objectKey: c.objectKey,
    sourceKind: c.sourceKind,
    ...(c.workspaceAbsolutePath ? { workspaceAbsolutePath: c.workspaceAbsolutePath } : {}),
  }));

  const supplementHeroConfigured = isPortadaSupplementHeroConfigured(options?.productData);
  const baseTrace = (): P103HeroAttemptTrace => ({
    rankedSources: [],
    trials: [],
    portadaSourcePlan,
    supplementHeroConfigured,
  });

  const hu = parsePortadaSupplementHeroUrl(options?.productData);
  const ws = parsePortadaSupplementHeroWorkspacePath(options?.productData, options?.workspaceRoot);

  if (hu) {
    const heroProbe = await processFromUrlSafe(hu);
    if (!heroProbe?.buffer || heroProbe.buffer.length <= 64) {
      return {
        ok: false,
        trace: {
          ...baseTrace(),
          failClosedReason: 'portada_supplement_hero_unfetchable_or_empty_buffer',
          automaticPortadaClassification: 'SUPPLEMENT_HERO_CONFIGURED_FAIL_CLOSED',
        },
      };
    }
  } else if (ws) {
    if (!fs.existsSync(ws.absolute)) {
      return {
        ok: false,
        trace: {
          ...baseTrace(),
          failClosedReason: 'portada_supplement_hero_workspace_file_missing',
          automaticPortadaClassification: 'SUPPLEMENT_HERO_CONFIGURED_FAIL_CLOSED',
        },
      };
    }
    try {
      const wb = await fs.promises.readFile(ws.absolute);
      if (!wb || wb.length <= 64) {
        return {
          ok: false,
          trace: {
            ...baseTrace(),
            failClosedReason: 'portada_supplement_hero_workspace_file_empty_or_unreadable',
            automaticPortadaClassification: 'SUPPLEMENT_HERO_CONFIGURED_FAIL_CLOSED',
          },
        };
      }
    } catch {
      return {
        ok: false,
        trace: {
          ...baseTrace(),
          failClosedReason: 'portada_supplement_hero_workspace_file_empty_or_unreadable',
          automaticPortadaClassification: 'SUPPLEMENT_HERO_CONFIGURED_FAIL_CLOSED',
        },
      };
    }
  }

  const loaded: Array<{
    buffer: Buffer;
    url: string;
    objectKey: string | null;
    sourceKind: PortadaRebuildSourceKind;
  }> = [];

  for (const c of plan) {
    if (c.workspaceAbsolutePath) {
      try {
        const buf = await fs.promises.readFile(c.workspaceAbsolutePath);
        if (buf.length > 64) {
          loaded.push({
            buffer: buf,
            url: c.url,
            objectKey: c.objectKey,
            sourceKind: c.sourceKind,
          });
        }
      } catch {
        /* skip unloadable */
      }
      continue;
    }
    const proc = await processFromUrlSafe(c.url);
    if (proc?.buffer && proc.buffer.length > 64) {
      loaded.push({
        buffer: proc.buffer,
        url: c.url,
        objectKey: c.objectKey,
        sourceKind: c.sourceKind,
      });
    }
  }

  if (supplementHeroConfigured && loaded.length === 0) {
    return {
      ok: false,
      trace: {
        ...baseTrace(),
        failClosedReason: hu
          ? 'portada_supplement_hero_configured_but_no_loadable_buffers'
          : 'portada_supplement_hero_workspace_not_loaded',
        automaticPortadaClassification: 'SUPPLEMENT_HERO_CONFIGURED_FAIL_CLOSED',
      },
    };
  }

  const hadSupplierLoaded = loaded.some((e) => e.sourceKind === 'supplier');
  const trialEntries =
    supplementHeroConfigured && hadSupplierLoaded
      ? loaded.filter((e) => e.sourceKind !== 'supplier')
      : loaded;
  const supplierTrialsSuppressedForSupplementHero =
    supplementHeroConfigured && hadSupplierLoaded && trialEntries.length < loaded.length;

  const rankedSources = await rankPortadaSourceBuffersForP103(
    trialEntries.map(({ buffer, url, objectKey }) => ({ buffer, url, objectKey }))
  );

  const trials: P103HeroTrialTrace[] = [];
  const profile = getMercadoLibreChilePolicyProfile();

  let priorityIndex = 0;
  for (const entry of trialEntries) {
    if (priorityIndex >= maxTrials) break;
    priorityIndex += 1;

    const trial: P103HeroTrialTrace = {
      url: entry.url,
      objectKey: entry.objectKey,
      rank: priorityIndex,
      sourceKind: entry.sourceKind,
      isolationOk: false,
    };

    const recipeTrials: P103RecipeTrialTrace[] = [];
    let anySegOk = false;
    let winningHero: Buffer | null = null;
    let winningRecipeId: PortadaRecipeId | undefined;
    let winningRecoveryProfileId: PortadaRecoveryProfileId | undefined;
    let winningSegmentationVariantId: PortadaSegmentationVariantId | undefined;
    let winningStudioPrepId: P109StudioPrepId | undefined;

    variantSearch: for (const segVar of segmentationOrder) {
      const iso = await isolateProductSubjectToPngWithVariant(entry.buffer, segVar);
      if (!iso) {
        continue;
      }
      anySegOk = true;

      for (const studioPrep of studioPrepOrder) {
        const afterStudio = await applyP109StudioPrepToCutout(iso.png, studioPrep);
        if (!afterStudio) {
          continue;
        }

        for (const recoveryProfileId of recoveryProfiles) {
          const cutoutForRecipes = await applyPortadaRecoveryProfileToCutout(afterStudio, recoveryProfileId);
          if (!cutoutForRecipes) {
            continue;
          }

          for (const recipeId of recipesForSource) {
            const hero = await composePortadaHeroWithRecipe(cutoutForRecipes, recipeId);
            if (!hero) {
              recipeTrials.push({
                recipeId,
                segmentationVariantId: segVar,
                studioPrepId: studioPrep,
                recoveryProfileId,
                strictNaturalPass: false,
                strictNaturalSignals: ['p107_recipe_compose_failed'],
              });
              continue;
            }

            const sn = await evaluateMlPortadaStrictAndNaturalGateFromBuffer(hero);
            const rt: P103RecipeTrialTrace = {
              recipeId,
              segmentationVariantId: segVar,
              studioPrepId: studioPrep,
              recoveryProfileId,
              strictNaturalPass: sn.pass,
              strictNaturalSignals: sn.signals,
            };
            if (!sn.pass) {
              recipeTrials.push(rt);
              continue;
            }

            const heroQ = await evaluateHeroCoverQualityOnBuffer(hero, profile);
            rt.heroPass = heroQ.pass;
            rt.heroFailures = heroQ.hero.failures;
            if (!heroQ.pass) {
              recipeTrials.push(rt);
              continue;
            }

            const integ = await evaluateOutputIntegrityOnBuffer(hero, profile, { heroMetrics: heroQ.metrics });
            rt.integrityPass = integ.pass;
            rt.integrityFailures = integ.integrity.failures;
            recipeTrials.push(rt);
            if (!integ.pass) {
              continue;
            }

            winningHero = hero;
            winningRecipeId = recipeId;
            winningRecoveryProfileId = recoveryProfileId;
            winningSegmentationVariantId = segVar;
            winningStudioPrepId = studioPrep;
            break variantSearch;
          }
        }
      }
    }

    if (!anySegOk) {
      trial.isolationReason = 'p103_isolation_border_segmentation_failed_or_invalid_blob';
      trials.push(trial);
      continue;
    }

    trial.isolationOk = true;
    trial.recipeTrials = recipeTrials;
    if (winningHero && winningRecipeId) {
      trial.winningRecipeId = winningRecipeId;
      trial.strictNaturalPass = true;
      trial.heroPass = true;
      trial.integrityPass = true;
      trials.push(trial);
      return {
        ok: true,
        pngBuffer: winningHero,
        winningUrl: entry.url,
        winningObjectKey: entry.objectKey,
        winningSourceKind: entry.sourceKind,
        winningRecipeId,
        winningRecoveryProfileId,
        winningSegmentationVariantId,
        winningStudioPrepId,
        trace: {
          rankedSources,
          trials,
          portadaSourcePlan,
          supplementHeroConfigured,
          supplierTrialsSuppressedForSupplementHero,
          automaticPortadaClassification: 'AUTOMATIC_COMPLIANT_PORTADA_PRODUCED',
          advancedRecoveryEnabled: advancedRecovery,
          recoveryProfilesAttempted: recoveryProfiles,
          segmentationVariantsAttempted: segmentationOrder,
          studioPrepIdsAttempted: studioPrepOrder,
          recoveryEngineVersion,
        },
      };
    }

    const lastRt = recipeTrials[recipeTrials.length - 1];
    trial.strictNaturalPass = lastRt?.strictNaturalPass ?? false;
    trial.strictNaturalSignals = lastRt?.strictNaturalSignals ?? ['p107_all_recipes_failed_on_source'];
    trial.heroPass = lastRt?.heroPass ?? false;
    trial.heroFailures = lastRt?.heroFailures;
    trial.integrityPass = lastRt?.integrityPass ?? false;
    trial.integrityFailures = lastRt?.integrityFailures;
    trials.push(trial);
  }

  const failClosedReason =
    supplementHeroConfigured && supplierTrialsSuppressedForSupplementHero
      ? 'portada_supplement_hero_exhausted_no_supplier_fallback'
      : undefined;

  const automaticPortadaClassification: AutomaticPortadaClassification = supplementHeroConfigured
    ? 'SUPPLEMENT_HERO_CONFIGURED_FAIL_CLOSED'
    : p109Enabled && segmentationOrder.length > 1
      ? 'AUTONOMOUS_V2_RECOVERY_EXHAUSTED'
      : advancedRecovery && recoveryProfiles.length > 1
        ? 'AUTOMATIC_ADVANCED_RECOVERY_EXHAUSTED'
        : 'IMAGE_SOURCE_INSUFFICIENT_FOR_MARKETPLACE';

  return {
    ok: false,
    trace: {
      rankedSources,
      trials,
      portadaSourcePlan,
      supplementHeroConfigured,
      supplierTrialsSuppressedForSupplementHero,
      automaticPortadaClassification,
      advancedRecoveryEnabled: advancedRecovery,
      recoveryProfilesAttempted: recoveryProfiles,
      segmentationVariantsAttempted: segmentationOrder,
      studioPrepIdsAttempted: studioPrepOrder,
      recoveryEngineVersion,
      ...(failClosedReason ? { failClosedReason } : {}),
    },
  };
}
