import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import axios from 'axios';
import type { CanonicalPipelineOutcome, CanonicalPipelineTrace, InsetCropFractions } from './types';
import {
  getFinalCoverPreferenceMaxFinalists,
  getMercadoLibreChilePolicyProfile,
  getRemediationSimulationHifiMaxInput,
  getRemediationSimulationHifiTopCandidates,
  getRemediationSimulationMaxCandidates,
  getRemediationSimulationPreviewMaxInput,
  isFinalCoverPreferenceEnabled,
  isMlCanonicalPipelineEnabled,
  isRemediationSimulationEnabled,
  isRemediationSimulationHifiEnabled,
} from './policy-profiles';
import {
  enumerateMainCandidates,
  mergePortadaPriorityImageUrls,
  parseProductImageUrls,
  scoreImageCandidate,
  scoreImageCandidateFromBuffer,
} from './candidate-scoring.service';
import type { ScoredImageCandidate } from './types';
import { evaluateDualGatesOnCandidate, evaluateDualGatesOnOutputBuffer } from './dual-gate.service';
import { runRemediationSimulationRanking } from './remediation-simulation.service';
import {
  evaluateHeroCoverQualityOnBuffer,
  type HeroCoverQualityMetrics,
} from './hero-cover-quality-gate.service';
import {
  evaluateOutputIntegrityOnBuffer,
  type OutputIntegrityMetrics,
} from './output-integrity-gate.service';
import type {
  CanonicalHeroMetricsSnapshot,
  CanonicalOutputIntegrityMetricsSnapshot,
  CanonicalSimulationQualityMetrics,
} from './types';
import {
  applyRecipe,
  applySquareWhiteCatalogJpeg,
} from './remediation-recipes.service';
import {
  buildFinalCoverFinalistPlanFromSimulation,
  buildOrderedRemediationAttempts,
  evaluateFinalCoverPreferenceOnBuffer,
  selectFinalCoverPreferenceWinner,
} from './final-cover-preference.service';
import {
  evaluateCommercialFinalistFloor,
  getCommercialFinalistFloorThresholds,
  isCommercialFinalistFloorEnabled,
} from './commercial-finalist-floor.service';
import { evaluateMlPortadaStrictAndNaturalGateFromBuffer } from '../ml-portada-visual-compliance.service';

function parseProductMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' ? p : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
}

function readInsetOverride(productData: unknown): InsetCropFractions | null {
  const m = parseProductMetadata(productData);
  const p = m.mlImagePipeline?.insetCrop ?? m.mlImagePipeline?.inset_crop;
  if (!p || typeof p !== 'object') return null;
  const L = Number((p as any).left);
  const T = Number((p as any).top);
  const B = Number((p as any).bottom);
  const R = Number((p as any).right);
  if ([L, T, B, R].every((n) => Number.isFinite(n) && n >= 0 && n < 0.55)) {
    return { left: L, top: T, bottom: B, right: R };
  }
  return null;
}

function readCanonicalEvaluateLocalApprovedCover(productData: unknown): boolean {
  const m = parseProductMetadata(productData);
  return m.mlImagePipeline?.canonicalEvaluateLocalApprovedCover === true;
}

function resolveWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'backend')) && fs.existsSync(path.join(cwd, 'docs'))) {
    return cwd;
  }
  if (fs.existsSync(path.join(cwd, 'src')) && fs.existsSync(path.join(cwd, 'package.json'))) {
    return path.resolve(cwd, '..');
  }
  return path.resolve(cwd, '..');
}

function localPackCoverAbsolutePath(productId: number): string | null {
  const dir = path.join(resolveWorkspaceRoot(), 'artifacts', 'ml-image-packs', `product-${productId}`);
  for (const name of ['cover_main.png', 'cover_main.jpg', 'cover_main.jpeg']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Synthetic URL for trace + scoring; resolved to disk for this productId only. */
function makeLocalPackCoverSyntheticUrl(productId: number): string {
  return `local:pack:product-${productId}:cover_main`;
}

function parseLocalPackProductIdFromSyntheticUrl(u: string): number | null {
  const m = u.trim().match(/^local:pack:product-(\d+):cover_main$/);
  return m ? Number(m[1]) : null;
}

async function download(url: string): Promise<Buffer> {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 22000,
    maxContentLength: 12 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-P76-canonical/1.0)',
      Accept: 'image/*',
    },
  });
  return Buffer.from(r.data);
}

async function loadBufferForScoredCandidate(s: ScoredImageCandidate, expectedProductId: number): Promise<Buffer | null> {
  const pid = parseLocalPackProductIdFromSyntheticUrl(s.url);
  if (pid != null) {
    if (pid !== expectedProductId) return null;
    const cover = localPackCoverAbsolutePath(pid);
    if (!cover) return null;
    return fsp.readFile(cover);
  }
  return download(s.url).catch(() => null);
}

function heroMetricsSnapshot(m: HeroCoverQualityMetrics): CanonicalHeroMetricsSnapshot {
  return {
    subjectAreaRatio: m.subjectAreaRatio,
    subjectWidthRatio: m.subjectWidthRatio,
    subjectHeightRatio: m.subjectHeightRatio,
    extentBalance: m.extentBalance,
    trimThreshold: m.trimThreshold,
  };
}

function integrityMetricsSnapshot(m: OutputIntegrityMetrics): CanonicalOutputIntegrityMetricsSnapshot {
  return {
    meanLuminance: m.meanLuminance,
    luminanceStdev: m.luminanceStdev,
    signalPixelRatio: m.signalPixelRatio,
    nearWhitePixelRatio: m.nearWhitePixelRatio,
    luminanceRange: m.luminanceRange,
    sampleWidth: m.sampleWidth,
    sampleHeight: m.sampleHeight,
  };
}

async function loadDetailBufferForRemediation(
  primary: ScoredImageCandidate,
  scored: ScoredImageCandidate[],
  productId: number
): Promise<Buffer> {
  const alt = scored.find((x) => x.url !== primary.url);
  if (alt) {
    const b = await loadBufferForScoredCandidate(alt, productId);
    if (b) return b;
  }
  const fb = await loadBufferForScoredCandidate(primary, productId);
  if (fb) return fb;
  throw new Error('remediation_detail_buffer_unresolved');
}

export interface CanonicalPackBuffers {
  coverBuffer: Buffer;
  coverFilename: 'cover_main.jpg' | 'cover_main.png';
  detailBuffer: Buffer;
  detailFilename: 'detail_mount_interface.jpg';
}

export type MlChileCanonicalRunResult =
  | (Extract<CanonicalPipelineOutcome, { kind: 'raw_ordered' }> & { pack?: undefined })
  | (Extract<CanonicalPipelineOutcome, { kind: 'human_review_required' }> & { pack?: undefined })
  | (Extract<CanonicalPipelineOutcome, { kind: 'legacy_delegate' }> & { pack?: undefined })
  | {
      kind: 'pack_buffers';
      pack: CanonicalPackBuffers;
      trace: CanonicalPipelineTrace;
    };

function emptyTrace(profileId: string): CanonicalPipelineTrace {
  return {
    version: 1,
    profileId,
    steps: ['canonical_v1_start'],
    rankedCandidates: [],
    rankedCandidateDetails: [],
    candidateInventory: [],
    directPathGateEvaluations: [],
    chosenDirectUrl: null,
    remediationAttempts: [],
    finalOutcome: null,
    winningRecipeId: null,
    winningRemediationCandidateUrl: null,
    remediationSimulation: [],
    remediationSimulationWinner: null,
    remediationSimulationAllWeak: false,
    remediationSimulationHiFiInvoked: false,
    remediationSimulationHiFiRowCount: 0,
    finalCoverPreferenceEnabled: false,
    finalCoverPreferenceMaxFinalists: 0,
    finalCoverPreferencePlanSlots: 0,
    finalCoverPreferenceFinalists: [],
    finalCoverPreferenceWinner: null,
    finalCoverPreferenceBeatReasons: [],
    finalCoverProvisionalWinner: null,
    commercialFinalistFloorEnabled: false,
    commercialFinalistFloorPass: null,
    commercialFinalistFloorFailureReasons: [],
  };
}

/**
 * P76/P77/P78 canonical path: enumerate → score → dual gate direct → try next → remediate → fail closed.
 * P78: optional `mlImagePipeline.canonicalEvaluateLocalApprovedCover` scores on-disk approved cover as a first-class candidate.
 */
export async function runMlChileCanonicalPipeline(params: {
  productId: number;
  images: unknown;
  productData?: unknown;
}): Promise<MlChileCanonicalRunResult | null> {
  if (!isMlCanonicalPipelineEnabled()) {
    return null;
  }

  const profile = getMercadoLibreChilePolicyProfile();
  const allUrls = mergePortadaPriorityImageUrls(parseProductImageUrls(params.images), params.productData);
  const candidates = enumerateMainCandidates(allUrls);
  const trace = emptyTrace(profile.id);

  const localCoverPath =
    readCanonicalEvaluateLocalApprovedCover(params.productData) && localPackCoverAbsolutePath(params.productId);

  trace.candidateInventory = [
    ...(localCoverPath
      ? [{ url: makeLocalPackCoverSyntheticUrl(params.productId), objectKey: 'local_approved_cover_main' as string | null }]
      : []),
    ...candidates.map((c) => ({ url: c.url, objectKey: c.objectKey })),
  ];

  if (candidates.length === 0 && !localCoverPath) {
    trace.steps.push('no_main_candidates_after_detail_filter');
    trace.finalOutcome = 'human_review_required';
    return {
      kind: 'human_review_required',
      reasons: ['ml_canonical_no_candidates_after_enumeration'],
      trace,
    };
  }

  const scored: ScoredImageCandidate[] = [];

  if (localCoverPath) {
    try {
      const buf = await fsp.readFile(localCoverPath);
      scored.push(
        await scoreImageCandidateFromBuffer(
          buf,
          'local_approved_cover_main',
          makeLocalPackCoverSyntheticUrl(params.productId)
        )
      );
      trace.steps.push('scored_local_approved_cover_main_p78');
    } catch {
      trace.steps.push('local_approved_cover_score_failed_p78');
    }
  }

  for (const c of candidates) {
    try {
      scored.push(await scoreImageCandidate(c.url, c.objectKey));
    } catch {
      trace.steps.push(`score_failed:${c.objectKey || 'unknown'}`);
    }
  }

  if (scored.length === 0) {
    trace.steps.push('all_candidate_downloads_failed');
    trace.finalOutcome = 'human_review_required';
    return {
      kind: 'human_review_required',
      reasons: ['ml_canonical_all_candidate_downloads_failed'],
      trace,
    };
  }

  scored.sort((a, b) => b.combinedScore - a.combinedScore);
  for (const s of scored) {
    trace.rankedCandidates.push({
      url: s.url,
      objectKey: s.objectKey,
      policyFitness: s.policyFitness,
      conversionFitness: s.conversionFitness,
    });
    trace.rankedCandidateDetails.push({
      url: s.url,
      objectKey: s.objectKey,
      policyFitness: s.policyFitness,
      conversionFitness: s.conversionFitness,
      combinedScore: s.combinedScore,
      scores: { ...s.scores },
      remediationFitnessReasons: s.remediationFitnessReasons,
    });
  }
  trace.steps.push(`ranked_${scored.length}_candidates`);

  for (const s of scored) {
    const gates = evaluateDualGatesOnCandidate(s, profile);
    const cbuf = await loadBufferForScoredCandidate(s, params.productId);
    const heroResolved = cbuf
      ? await evaluateHeroCoverQualityOnBuffer(cbuf, profile)
      : {
          hero: { pass: false, failures: ['hero_source_buffer_unavailable'] },
          pass: false,
          metrics: {
            canvasWidth: 0,
            canvasHeight: 0,
            trimWidth: 0,
            trimHeight: 0,
            subjectWidthRatio: 0,
            subjectHeightRatio: 0,
            subjectAreaRatio: 0,
            extentBalance: 0,
            trimThreshold: profile.heroCoverGate.trimThreshold,
          },
        };

    const integrityResolved = cbuf
      ? await evaluateOutputIntegrityOnBuffer(cbuf, profile, { heroMetrics: heroResolved.metrics })
      : {
          integrity: { pass: false, failures: ['integrity_source_buffer_unavailable'] },
          pass: false,
          metrics: {
            sampleWidth: 0,
            sampleHeight: 0,
            meanLuminance: 0,
            luminanceStdev: 0,
            signalPixelRatio: 0,
            nearWhitePixelRatio: 0,
            luminanceRange: 0,
          },
        };

    trace.directPathGateEvaluations.push({
      url: s.url,
      objectKey: s.objectKey,
      policyPass: gates.policy.pass,
      conversionPass: gates.conversion.pass,
      policyFailures: [...gates.policy.failures],
      conversionFailures: [...gates.conversion.failures],
      heroPass: heroResolved.pass,
      heroFailures: [...heroResolved.hero.failures],
      heroMetrics: heroMetricsSnapshot(heroResolved.metrics),
      integrityPass: integrityResolved.pass,
      integrityFailures: [...integrityResolved.integrity.failures],
      integrityMetrics: integrityMetricsSnapshot(integrityResolved.metrics),
    });
    trace.steps.push(
      `dual_gate_direct:${s.objectKey || 'x'}:policy=${gates.policy.pass}:conv=${gates.conversion.pass}:hero=${heroResolved.pass}:integrity=${integrityResolved.pass}`
    );
    if (gates.bothPass && heroResolved.pass && integrityResolved.pass) {
      if (!cbuf) {
        trace.steps.push(`portada_strict_gate_direct_skip_no_buffer:${s.objectKey || 'x'}`);
        continue;
      }
      const portadaDirect = await evaluateMlPortadaStrictAndNaturalGateFromBuffer(cbuf);
      trace.steps.push(
        `portada_strict_natural_gate_direct:${s.objectKey || 'x'}:pass=${portadaDirect.pass}:${portadaDirect.signals.join(';')}`
      );
      if (!portadaDirect.pass) {
        continue;
      }
      const dedupAll = allUrls.filter((u, i, arr) => arr.indexOf(u) === i);
      const localPid = parseLocalPackProductIdFromSyntheticUrl(s.url);
      const coverAbs = localPid != null ? localPackCoverAbsolutePath(localPid) : null;
      const orderedUrls =
        localPid != null && coverAbs
          ? [coverAbs, ...dedupAll]
          : [s.url, ...allUrls.filter((u) => u !== s.url).filter((u, i, arr) => arr.indexOf(u) === i)];
      trace.chosenDirectUrl = s.url;
      trace.finalOutcome = 'direct_pass';
      return {
        kind: 'raw_ordered',
        orderedUrls,
        trace,
      };
    }
  }

  trace.steps.push('direct_pass_exhausted_try_remediation');
  const insetOverride = readInsetOverride(params.productData);
  // P81 — prefer easiest-to-fix candidates, not just least-bad.
  const byRemediation = [...scored].sort(
    (a, b) => b.scores.remediationFitness - a.scores.remediationFitness
  );

  let remediationOrder = byRemediation;
  if (isRemediationSimulationEnabled() && byRemediation.length > 0) {
    const maxN = getRemediationSimulationMaxCandidates();
    const shortlist = byRemediation.slice(0, maxN);
    const sim = await runRemediationSimulationRanking({
      profile,
      shortlist,
      insetOverride,
      previewMaxInput: getRemediationSimulationPreviewMaxInput(),
      loadBuffer: (s) => loadBufferForScoredCandidate(s, params.productId),
      hiFiEnabled: isRemediationSimulationHifiEnabled(),
      hiFiTopCandidates: getRemediationSimulationHifiTopCandidates(),
      hiFiMaxInput: getRemediationSimulationHifiMaxInput(),
    });
    trace.remediationSimulation = sim.rows;
    trace.remediationSimulationAllWeak = sim.allWeak;
    trace.remediationSimulationHiFiInvoked = sim.hiFiInvoked;
    trace.remediationSimulationHiFiRowCount = sim.hiFiRowCount;
    if (sim.winner) {
      trace.remediationSimulationWinner = {
        candidateUrl: sim.winner.candidateUrl,
        objectKey: sim.winner.objectKey,
        recipeId: sim.winner.recipeId,
        simScore: sim.winner.simScore,
        simAllCorePass: sim.winner.simAllCorePass,
      };
    }
    const shortUrlSet = new Set(shortlist.map((x) => x.url));
    const tail = byRemediation.filter((s) => !shortUrlSet.has(s.url));
    remediationOrder = [...sim.orderedCandidates, ...tail];
    trace.steps.push(
      `remediation_simulation:shortlist=${shortlist.length}:rows=${sim.rows.length}:allWeak=${sim.allWeak}:hifi=${sim.hiFiInvoked}:hifiRows=${sim.hiFiRowCount}`
    );
    trace.steps.push(
      `remediation_simulation_rank:${sim.orderedCandidates.map((c) => c.objectKey || 'x').join('>')}`
    );
  }

  const preferenceOn = isFinalCoverPreferenceEnabled();
  const maxFinalists = getFinalCoverPreferenceMaxFinalists();
  trace.finalCoverPreferenceEnabled = preferenceOn;
  trace.finalCoverPreferenceMaxFinalists = preferenceOn ? maxFinalists : 0;

  const insetPresent = insetOverride != null;
  const simPlan =
    preferenceOn && trace.remediationSimulation.length > 0
      ? buildFinalCoverFinalistPlanFromSimulation({
          rows: trace.remediationSimulation,
          maxPlanSlots: maxFinalists,
          recipeChain: profile.defaultRemediationRecipeChain,
          insetOverridePresent: insetPresent,
        })
      : null;
  trace.finalCoverPreferencePlanSlots = simPlan?.length ?? 0;

  type PassingRemediation = {
    s: ScoredImageCandidate;
    recipeId: string;
    out: Buffer;
    coverFilename: 'cover_main.jpg' | 'cover_main.png';
    heroMetrics: HeroCoverQualityMetrics;
    integrityMetrics: OutputIntegrityMetrics;
  };

  async function loadRemediationCandidateBuffer(s: ScoredImageCandidate): Promise<Buffer | null> {
    let buf: Buffer | null;
    try {
      buf = await loadBufferForScoredCandidate(s, params.productId);
    } catch {
      buf = null;
    }
    if (!buf) {
      trace.steps.push(
        `skip_remediation_candidate_no_buffer:${s.objectKey || 'x'}:remFit=${s.scores.remediationFitness.toFixed(2)}`
      );
    }
    return buf;
  }

  async function tryPassingRemediationWithBuffer(
    s: ScoredImageCandidate,
    recipeId: string,
    buf: Buffer
  ): Promise<PassingRemediation | null> {
    if (recipeId === 'inset_white_catalog_png' && !insetOverride) {
      trace.steps.push(`skip_recipe_${recipeId}_no_inset_override`);
      return null;
    }
    try {
      const out = await applyRecipe(
        recipeId,
        profile,
        buf,
        recipeId === 'inset_white_catalog_png' ? insetOverride : null
      );
      const og = await evaluateDualGatesOnOutputBuffer(out, profile);
      const heroOut = await evaluateHeroCoverQualityOnBuffer(out, profile);
      const integrityOut = await evaluateOutputIntegrityOnBuffer(out, profile, {
        heroMetrics: heroOut.metrics,
      });
      trace.remediationAttempts.push({
        recipeId,
        candidateUrl: s.url,
        policyPass: og.policy.pass,
        conversionPass: og.conversion.pass,
        policyFailures: [...og.policy.failures],
        conversionFailures: [...og.conversion.failures],
        heroPass: heroOut.pass,
        heroFailures: [...heroOut.hero.failures],
        heroMetrics: heroMetricsSnapshot(heroOut.metrics),
        integrityPass: integrityOut.pass,
        integrityFailures: [...integrityOut.integrity.failures],
        integrityMetrics: integrityMetricsSnapshot(integrityOut.metrics),
      });
      trace.steps.push(
        `remediation:${recipeId}:${s.objectKey || 'x'}:policy=${og.policy.pass}:conv=${og.conversion.pass}:hero=${heroOut.pass}:integrity=${integrityOut.pass}`
      );
      if (og.bothPass && heroOut.pass && integrityOut.pass) {
        const portadaOut = await evaluateMlPortadaStrictAndNaturalGateFromBuffer(out);
        trace.steps.push(
          `portada_strict_natural_gate_remediation:${recipeId}:${s.objectKey || 'x'}:pass=${portadaOut.pass}:${portadaOut.signals.join(';')}`
        );
        if (!portadaOut.pass) {
          return null;
        }
        const coverFilename = recipeId === 'square_white_catalog_jpeg' ? 'cover_main.jpg' : 'cover_main.png';
        return {
          s,
          recipeId,
          out,
          coverFilename,
          heroMetrics: heroOut.metrics,
          integrityMetrics: integrityOut.metrics,
        };
      }
    } catch (e) {
      trace.steps.push(`recipe_error:${recipeId}:${String((e as Error).message).slice(0, 80)}`);
    }
    return null;
  }

  if (preferenceOn) {
    const attempts = buildOrderedRemediationAttempts({
      remediationOrder,
      recipeChain: profile.defaultRemediationRecipeChain,
      insetOverridePresent: insetPresent,
      plan: simPlan,
    });
    const passing: PassingRemediation[] = [];
    for (const { candidate: s, recipeId } of attempts) {
      if (passing.length >= maxFinalists) break;
      const buf = await loadRemediationCandidateBuffer(s);
      if (!buf) continue;
      trace.steps.push(
        `remediation_attempt:${s.objectKey || 'x'}:${recipeId}:remFit=${s.scores.remediationFitness.toFixed(2)}`
      );
      const pr = await tryPassingRemediationWithBuffer(s, recipeId, buf);
      if (pr) passing.push(pr);
    }

    trace.steps.push(
      `final_cover_preference:attempts=${attempts.length}:passing=${passing.length}:plan=${simPlan?.length ?? 0}`
    );

    if (passing.length > 0) {
      const finalistRows: Array<{
        acc: PassingRemediation;
        preferenceScore: number;
        preferenceReasons: string[];
        finalCoverQuality: CanonicalSimulationQualityMetrics;
      }> = [];
      for (const p of passing) {
        const ev = await evaluateFinalCoverPreferenceOnBuffer(p.out, p.heroMetrics, p.integrityMetrics);
        finalistRows.push({ acc: p, ...ev });
      }

      trace.finalCoverPreferenceFinalists = finalistRows.map((r) => ({
        candidateUrl: r.acc.s.url,
        objectKey: r.acc.s.objectKey,
        recipeId: r.acc.recipeId,
        preferenceScore: r.preferenceScore,
        finalCoverQuality: r.finalCoverQuality,
        preferenceReasons: r.preferenceReasons,
        heroMetrics: heroMetricsSnapshot(r.acc.heroMetrics),
      }));

      let chosen: PassingRemediation;
      if (finalistRows.length >= 2) {
        const { winner, beatReasons } = selectFinalCoverPreferenceWinner(trace.finalCoverPreferenceFinalists);
        trace.finalCoverPreferenceWinner = winner;
        trace.finalCoverPreferenceBeatReasons = beatReasons;
        const hit = finalistRows.find(
          (r) => r.acc.s.url === winner.candidateUrl && r.acc.recipeId === winner.recipeId
        );
        chosen = hit!.acc;
      } else {
        const sole = finalistRows[0]!;
        trace.finalCoverPreferenceWinner = {
          candidateUrl: sole.acc.s.url,
          objectKey: sole.acc.s.objectKey,
          recipeId: sole.acc.recipeId,
          preferenceScore: sole.preferenceScore,
        };
        trace.finalCoverPreferenceBeatReasons = ['single_passing_final_no_comparison'];
        chosen = sole.acc;
      }

      const winnerDetail = trace.finalCoverPreferenceFinalists.find(
        (f) => f.candidateUrl === chosen.s.url && f.recipeId === chosen.recipeId
      )!;

      if (isCommercialFinalistFloorEnabled()) {
        trace.commercialFinalistFloorEnabled = true;
        trace.finalCoverProvisionalWinner = trace.finalCoverPreferenceWinner
          ? { ...trace.finalCoverPreferenceWinner }
          : null;
        const floor = evaluateCommercialFinalistFloor({
          preferenceScore: winnerDetail.preferenceScore,
          q: winnerDetail.finalCoverQuality,
          heroMetrics: winnerDetail.heroMetrics,
          thresholds: getCommercialFinalistFloorThresholds(),
        });
        trace.commercialFinalistFloorPass = floor.pass;
        trace.commercialFinalistFloorFailureReasons = floor.failureReasons;
        if (!floor.pass) {
          trace.finalOutcome = 'human_review_required';
          trace.winningRecipeId = null;
          trace.winningRemediationCandidateUrl = null;
          trace.steps.push(
            `commercial_finalist_floor_reject:${floor.failureReasons.slice(0, 6).join('|')}`
          );
          return {
            kind: 'human_review_required',
            reasons: ['ml_canonical_commercial_finalist_floor_failed', ...floor.failureReasons],
            trace,
          };
        }
        trace.steps.push(
          `commercial_finalist_floor_pass:${chosen.recipeId}:${chosen.s.objectKey || 'x'}`
        );
      } else {
        trace.commercialFinalistFloorEnabled = false;
        trace.commercialFinalistFloorPass = null;
        trace.commercialFinalistFloorFailureReasons = [];
        trace.finalCoverProvisionalWinner = null;
      }

      const detailBuf = await loadDetailBufferForRemediation(chosen.s, scored, params.productId);
      const detailJpeg = await applySquareWhiteCatalogJpeg(detailBuf);
      trace.finalOutcome = 'remediated_pass';
      trace.winningRecipeId = chosen.recipeId;
      trace.winningRemediationCandidateUrl = chosen.s.url;
      trace.steps.push(
        `final_cover_preference_winner:${chosen.recipeId}:${chosen.s.objectKey || 'x'}:score=${trace.finalCoverPreferenceWinner?.preferenceScore.toFixed(2)}`
      );
      return {
        kind: 'pack_buffers',
        pack: {
          coverBuffer: chosen.out,
          coverFilename: chosen.coverFilename,
          detailBuffer: detailJpeg,
          detailFilename: 'detail_mount_interface.jpg',
        },
        trace,
      };
    }

    trace.steps.push('final_cover_preference_zero_passing');
  } else {
    for (const s of remediationOrder) {
      const buf = await loadRemediationCandidateBuffer(s);
      if (!buf) continue;
      trace.steps.push(
        `remediation_candidate_try:${s.objectKey || 'x'}:remFit=${s.scores.remediationFitness.toFixed(2)}:${s.remediationFitnessReasons
          .slice(0, 3)
          .join('|')}`
      );
      for (const recipeId of profile.defaultRemediationRecipeChain) {
        const pr = await tryPassingRemediationWithBuffer(s, recipeId, buf);
        if (pr) {
          const prefEv = await evaluateFinalCoverPreferenceOnBuffer(
            pr.out,
            pr.heroMetrics,
            pr.integrityMetrics
          );
          if (isCommercialFinalistFloorEnabled()) {
            trace.commercialFinalistFloorEnabled = true;
            trace.finalCoverProvisionalWinner = {
              candidateUrl: pr.s.url,
              objectKey: pr.s.objectKey,
              recipeId: pr.recipeId,
              preferenceScore: prefEv.preferenceScore,
            };
            const floor = evaluateCommercialFinalistFloor({
              preferenceScore: prefEv.preferenceScore,
              q: prefEv.finalCoverQuality,
              heroMetrics: heroMetricsSnapshot(pr.heroMetrics),
              thresholds: getCommercialFinalistFloorThresholds(),
            });
            trace.commercialFinalistFloorPass = floor.pass;
            trace.commercialFinalistFloorFailureReasons = floor.failureReasons;
            if (!floor.pass) {
              trace.finalOutcome = 'human_review_required';
              trace.winningRecipeId = null;
              trace.winningRemediationCandidateUrl = null;
              trace.steps.push(
                `commercial_finalist_floor_reject:${floor.failureReasons.slice(0, 6).join('|')}`
              );
              return {
                kind: 'human_review_required',
                reasons: ['ml_canonical_commercial_finalist_floor_failed', ...floor.failureReasons],
                trace,
              };
            }
            trace.steps.push(`commercial_finalist_floor_pass:${pr.recipeId}:${pr.s.objectKey || 'x'}`);
          } else {
            trace.commercialFinalistFloorEnabled = false;
            trace.commercialFinalistFloorPass = null;
            trace.commercialFinalistFloorFailureReasons = [];
            trace.finalCoverProvisionalWinner = null;
          }

          const detailBuf = await loadDetailBufferForRemediation(pr.s, scored, params.productId);
          const detailJpeg = await applySquareWhiteCatalogJpeg(detailBuf);
          trace.finalOutcome = 'remediated_pass';
          trace.winningRecipeId = pr.recipeId;
          trace.winningRemediationCandidateUrl = pr.s.url;
          return {
            kind: 'pack_buffers',
            pack: {
              coverBuffer: pr.out,
              coverFilename: pr.coverFilename,
              detailBuffer: detailJpeg,
              detailFilename: 'detail_mount_interface.jpg',
            },
            trace,
          };
        }
      }
    }
  }

  trace.finalOutcome = 'human_review_required';
  return {
    kind: 'human_review_required',
    reasons: [
      'ml_canonical_dual_gate_failed_all_candidates_and_remediations',
      ...(trace.remediationSimulationAllWeak ? ['remediation_simulation_all_weak_preview'] : []),
      ...trace.remediationAttempts.slice(-3).map(
        (r) =>
          `last_try:${r.recipeId}:policy=${r.policyPass}:conv=${r.conversionPass}:hero=${r.heroPass}:integrity=${r.integrityPass}`
      ),
      ...trace.remediationAttempts
        .slice(-2)
        .flatMap((r) => r.heroFailures.map((f) => `hero_gate:${r.recipeId}:${f}`)),
      ...trace.remediationAttempts
        .slice(-2)
        .flatMap((r) => r.integrityFailures.map((f) => `integrity_gate:${r.recipeId}:${f}`)),
    ],
    trace,
  };
}
