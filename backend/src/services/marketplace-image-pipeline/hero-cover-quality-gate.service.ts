/**
 * P79 — Mandatory hero/portada quality gate (trim-based subject dominance).
 * Complements Policy + Conversion gates; blocks technically compliant but commercially weak covers.
 */
import sharp from 'sharp';
import type { GateResult, MarketplaceImagePolicyProfile } from './types';
import { isHeroCoverGateEnabled } from './policy-profiles';

export interface HeroCoverQualityMetrics {
  canvasWidth: number;
  canvasHeight: number;
  trimWidth: number;
  trimHeight: number;
  subjectWidthRatio: number;
  subjectHeightRatio: number;
  subjectAreaRatio: number;
  extentBalance: number;
  trimThreshold: number;
}

export interface HeroCoverQualityEvaluation {
  hero: GateResult;
  pass: boolean;
  metrics: HeroCoverQualityMetrics;
}

function emptyMetrics(threshold: number): HeroCoverQualityMetrics {
  return {
    canvasWidth: 0,
    canvasHeight: 0,
    trimWidth: 0,
    trimHeight: 0,
    subjectWidthRatio: 0,
    subjectHeightRatio: 0,
    subjectAreaRatio: 0,
    extentBalance: 0,
    trimThreshold: threshold,
  };
}

function evaluateMetricsAgainstThresholds(
  m: HeroCoverQualityMetrics,
  t: MarketplaceImagePolicyProfile['heroCoverGate']
): string[] {
  const failures: string[] = [];
  const { W, H, tw, th } = {
    W: m.canvasWidth,
    H: m.canvasHeight,
    tw: m.trimWidth,
    th: m.trimHeight,
  };
  if (W < 32 || H < 32 || tw < 2 || th < 2) {
    failures.push('hero_canvas_or_trim_too_small');
    return failures;
  }

  if (m.subjectAreaRatio < t.minSubjectAreaRatio) {
    failures.push(
      `hero_subject_area_ratio_${m.subjectAreaRatio.toFixed(3)}_below_${t.minSubjectAreaRatio}`
    );
  }
  if (m.subjectWidthRatio < t.minSubjectWidthRatio) {
    failures.push(
      `hero_subject_width_ratio_${m.subjectWidthRatio.toFixed(3)}_below_${t.minSubjectWidthRatio}`
    );
  }
  if (m.subjectHeightRatio < t.minSubjectHeightRatio) {
    failures.push(
      `hero_subject_height_ratio_${m.subjectHeightRatio.toFixed(3)}_below_${t.minSubjectHeightRatio}`
    );
  }
  if (m.extentBalance < t.minExtentBalance) {
    failures.push(
      `hero_extent_balance_${m.extentBalance.toFixed(3)}_below_${t.minExtentBalance}_thin_or_strip_composition`
    );
  }

  return failures;
}

/**
 * Measures non-background subject dominance via Sharp trim bounding box vs full canvas.
 */
export async function evaluateHeroCoverQualityOnBuffer(
  buf: Buffer,
  profile: MarketplaceImagePolicyProfile
): Promise<HeroCoverQualityEvaluation> {
  const t = profile.heroCoverGate;
  const threshold = t.trimThreshold;

  if (!isHeroCoverGateEnabled()) {
    const meta = await sharp(buf).rotate().metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    return {
      hero: { pass: true, failures: [] },
      pass: true,
      metrics: {
        canvasWidth: W,
        canvasHeight: H,
        trimWidth: W,
        trimHeight: H,
        subjectWidthRatio: 1,
        subjectHeightRatio: 1,
        subjectAreaRatio: 1,
        extentBalance: 1,
        trimThreshold: threshold,
      },
    };
  }

  let trimmed: Buffer;
  try {
    trimmed = await sharp(buf).rotate().trim({ threshold }).png().toBuffer();
  } catch {
    const meta = await sharp(buf).rotate().metadata();
    return {
      hero: { pass: false, failures: ['hero_trim_failed_or_uniform_canvas'] },
      pass: false,
      metrics: { ...emptyMetrics(threshold), canvasWidth: meta.width ?? 0, canvasHeight: meta.height ?? 0 },
    };
  }

  const fullMeta = await sharp(buf).rotate().metadata();
  const trimMeta = await sharp(trimmed).metadata();
  const W = fullMeta.width ?? 0;
  const H = fullMeta.height ?? 0;
  const tw = trimMeta.width ?? 0;
  const th = trimMeta.height ?? 0;

  if (W <= 0 || H <= 0) {
    return {
      hero: { pass: false, failures: ['hero_invalid_canvas_dimensions'] },
      pass: false,
      metrics: emptyMetrics(threshold),
    };
  }

  const subjectWidthRatio = tw / W;
  const subjectHeightRatio = th / H;
  const subjectAreaRatio = (tw * th) / (W * H);
  const sm = Math.min(subjectWidthRatio, subjectHeightRatio);
  const lg = Math.max(subjectWidthRatio, subjectHeightRatio);
  const extentBalance = lg > 0 ? sm / lg : 0;

  const metrics: HeroCoverQualityMetrics = {
    canvasWidth: W,
    canvasHeight: H,
    trimWidth: tw,
    trimHeight: th,
    subjectWidthRatio: Number(subjectWidthRatio.toFixed(4)),
    subjectHeightRatio: Number(subjectHeightRatio.toFixed(4)),
    subjectAreaRatio: Number(subjectAreaRatio.toFixed(4)),
    extentBalance: Number(extentBalance.toFixed(4)),
    trimThreshold: threshold,
  };

  const failures = evaluateMetricsAgainstThresholds(metrics, t);
  const hero: GateResult = { pass: failures.length === 0, failures };

  return { hero, pass: hero.pass, metrics };
}
