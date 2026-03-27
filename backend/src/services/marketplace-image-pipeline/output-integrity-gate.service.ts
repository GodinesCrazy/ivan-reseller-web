/**
 * P80 — Output integrity gate: blocks near-blank / near-uniform-white covers that can still pass
 * policy + conversion + trim-based hero when trim treats the whole canvas as “subject”.
 */
import sharp from 'sharp';
import type { GateResult, MarketplaceImagePolicyProfile } from './types';
import type { HeroCoverQualityMetrics } from './hero-cover-quality-gate.service';
import { isOutputIntegrityGateEnabled } from './policy-profiles';

export interface OutputIntegrityMetrics {
  sampleWidth: number;
  sampleHeight: number;
  meanLuminance: number;
  luminanceStdev: number;
  signalPixelRatio: number;
  nearWhitePixelRatio: number;
  luminanceRange: number;
}

export interface OutputIntegrityEvaluation {
  integrity: GateResult;
  pass: boolean;
  metrics: OutputIntegrityMetrics;
}

function emptyMetrics(): OutputIntegrityMetrics {
  return {
    sampleWidth: 0,
    sampleHeight: 0,
    meanLuminance: 0,
    luminanceStdev: 0,
    signalPixelRatio: 0,
    nearWhitePixelRatio: 0,
    luminanceRange: 0,
  };
}

function evaluateAgainstThresholds(
  m: OutputIntegrityMetrics,
  t: MarketplaceImagePolicyProfile['outputIntegrityGate'],
  hero: HeroCoverQualityMetrics | null | undefined
): string[] {
  const failures: string[] = [];
  const n = m.sampleWidth * m.sampleHeight;
  if (n < 64) {
    failures.push('integrity_sample_too_small');
    return failures;
  }

  if (m.signalPixelRatio < t.minSignalPixelRatio) {
    failures.push(
      `integrity_signal_pixel_ratio_${m.signalPixelRatio.toFixed(4)}_below_${t.minSignalPixelRatio}`
    );
  }

  if (m.nearWhitePixelRatio > t.maxNearWhitePixelRatio) {
    failures.push(
      `integrity_near_white_pixel_ratio_${m.nearWhitePixelRatio.toFixed(4)}_above_${t.maxNearWhitePixelRatio}`
    );
  }

  if (m.meanLuminance >= t.meanLuminanceTriggersStdevCheck && m.luminanceStdev < t.minLuminanceStdevWhenMeanHigh) {
    failures.push(
      `integrity_luminance_stdev_${m.luminanceStdev.toFixed(3)}_below_${t.minLuminanceStdevWhenMeanHigh}_while_mean_${m.meanLuminance.toFixed(2)}_high_near_uniform_bright`
    );
  }

  if (m.luminanceRange < t.minLuminanceRange) {
    failures.push(
      `integrity_luminance_range_${m.luminanceRange.toFixed(2)}_below_${t.minLuminanceRange}_weak_global_contrast`
    );
  }

  if (hero && hero.subjectAreaRatio >= t.minSubjectAreaRatioForTrimSuspicion) {
    if (
      m.signalPixelRatio < t.minSignalPixelRatioWhenSubjectFullCanvas &&
      m.meanLuminance >= t.trimSuspicionMeanLuminanceMin
    ) {
      failures.push(
        'integrity_suspected_trim_full_canvas_with_low_visible_ink_subject_area_ratio_high_but_pixel_signal_weak'
      );
    }
  }

  return failures;
}

/**
 * Downsampled RGB stats independent of trim — catches near-blank outputs hero can miss.
 */
export async function evaluateOutputIntegrityOnBuffer(
  buf: Buffer,
  profile: MarketplaceImagePolicyProfile,
  options?: { heroMetrics?: HeroCoverQualityMetrics | null }
): Promise<OutputIntegrityEvaluation> {
  const t = profile.outputIntegrityGate;
  const maxDim = t.sampleMaxDimension;
  const nwTh = t.nearWhiteRgbThreshold;

  if (!isOutputIntegrityGateEnabled()) {
    const meta = await sharp(buf).rotate().metadata();
    return {
      integrity: { pass: true, failures: [] },
      pass: true,
      metrics: {
        ...emptyMetrics(),
        sampleWidth: meta.width ?? 0,
        sampleHeight: meta.height ?? 0,
      },
    };
  }

  let data: Buffer;
  let width: number;
  let height: number;
  try {
    const out = await sharp(buf)
      .rotate()
      .resize({
        width: maxDim,
        height: maxDim,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = out.data;
    width = out.info.width;
    height = out.info.height;
  } catch {
    return {
      integrity: { pass: false, failures: ['integrity_sharp_decode_or_sample_failed'] },
      pass: false,
      metrics: emptyMetrics(),
    };
  }

  const channels = width > 0 && height > 0 ? data.length / (width * height) : 0;
  if (channels < 3 || !Number.isFinite(channels)) {
    return {
      integrity: { pass: false, failures: ['integrity_unexpected_channel_layout'] },
      pass: false,
      metrics: { ...emptyMetrics(), sampleWidth: width, sampleHeight: height },
    };
  }

  const stride = Math.round(channels);
  const n = width * height;
  let sumL = 0;
  let sumL2 = 0;
  let nearWhiteCount = 0;
  let signalCount = 0;
  let minL = 255;
  let maxL = 0;

  for (let i = 0; i < n; i++) {
    const o = i * stride;
    const R = data[o];
    const G = data[o + 1];
    const B = data[o + 2];
    const L = 0.299 * R + 0.587 * G + 0.114 * B;
    sumL += L;
    sumL2 += L * L;
    if (R >= nwTh && G >= nwTh && B >= nwTh) {
      nearWhiteCount += 1;
    }
    const chroma = Math.max(R, G, B) - Math.min(R, G, B);
    const isSignal = L < 247 || chroma > 10 || Math.min(R, G, B) < 245;
    if (isSignal) {
      signalCount += 1;
    }
    if (L < minL) minL = L;
    if (L > maxL) maxL = L;
  }

  const meanL = sumL / n;
  const variance = Math.max(0, sumL2 / n - meanL * meanL);
  const stdev = Math.sqrt(variance);

  const metrics: OutputIntegrityMetrics = {
    sampleWidth: width,
    sampleHeight: height,
    meanLuminance: Number(meanL.toFixed(3)),
    luminanceStdev: Number(stdev.toFixed(4)),
    signalPixelRatio: Number((signalCount / n).toFixed(5)),
    nearWhitePixelRatio: Number((nearWhiteCount / n).toFixed(5)),
    luminanceRange: Number((maxL - minL).toFixed(3)),
  };

  const failures = evaluateAgainstThresholds(metrics, t, options?.heroMetrics ?? null);
  const integrity: GateResult = { pass: failures.length === 0, failures };
  return { integrity, pass: integrity.pass, metrics };
}
