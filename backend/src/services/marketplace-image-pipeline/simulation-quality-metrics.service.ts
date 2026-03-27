/**
 * P83 — Calibrated commercial-quality signals on simulated remediation outputs
 * (not production gates; used only to rank preview candidates).
 */
import sharp from 'sharp';
import type { CanonicalSimulationQualityMetrics } from './types';
import type { HeroCoverQualityMetrics } from './hero-cover-quality-gate.service';
import type { OutputIntegrityMetrics } from './output-integrity-gate.service';

/** Match output-integrity “signal” heuristic on a downsampled patch. */
function signalPixelRatioOnRaw(
  data: Buffer,
  width: number,
  height: number,
  stride: number
): number {
  const n = width * height;
  if (n < 1) return 0;
  let signal = 0;
  for (let i = 0; i < n; i++) {
    const o = i * stride;
    const R = data[o]!;
    const G = data[o + 1]!;
    const B = data[o + 2]!;
    const L = 0.299 * R + 0.587 * G + 0.114 * B;
    const chroma = Math.max(R, G, B) - Math.min(R, G, B);
    if (L < 247 || chroma > 10 || Math.min(R, G, B) < 245) signal += 1;
  }
  return signal / n;
}

/**
 * Commercial readability / washout / silhouette proxies on the **simulated** output buffer.
 */
export async function evaluateSimulationQualityOnBuffer(
  buf: Buffer,
  hero: HeroCoverQualityMetrics,
  integrity: OutputIntegrityMetrics
): Promise<CanonicalSimulationQualityMetrics> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;

  const deadSpaceRatio =
    W > 0 && H > 0 ? Math.max(0, Math.min(1, 1 - hero.subjectAreaRatio)) : 1;

  let centerSignalRatio = 0;
  if (W >= 32 && H >= 32) {
    const cw = Math.floor(W * 0.58);
    const ch = Math.floor(H * 0.58);
    const left = Math.floor((W - cw) / 2);
    const top = Math.floor((H - ch) / 2);
    try {
      const { data, info } = await sharp(buf)
        .rotate()
        .extract({ left, top, width: cw, height: ch })
        .resize(128, 128, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const chn = info.channels;
      if (chn >= 3) {
        centerSignalRatio = signalPixelRatioOnRaw(data, info.width, info.height, chn);
      }
    } catch {
      centerSignalRatio = 0;
    }
  }

  const st = await sharp(buf).rotate().stats();
  const globalLuminanceStdev =
    (st.channels[0].stdev + st.channels[1].stdev + st.channels[2].stdev) / 3;

  let edgeTextureStdev = 0;
  if (W >= 8 && H >= 8) {
    const th = Math.max(4, Math.floor(H * 0.08));
    const edge = await sharp(buf)
      .rotate()
      .extract({ left: 0, top: 0, width: W, height: th })
      .flatten({ background: '#ffffff' })
      .stats();
    edgeTextureStdev =
      (edge.channels[0].stdev + edge.channels[1].stdev + edge.channels[2].stdev) / 3;
  }

  const lr = integrity.luminanceRange / 255;
  const nw = integrity.nearWhitePixelRatio;
  const washoutIndex = Math.max(
    0,
    Math.min(1, nw * 0.55 + Math.max(0, 1 - Math.min(1, integrity.luminanceRange / 72)) * 0.45)
  );

  const silhouetteStrength =
    lr * Math.sqrt(integrity.signalPixelRatio + 0.0005) * 100;

  const readabilityEstimate = Math.max(
    0,
    Math.min(
      100,
      centerSignalRatio * 28 +
        hero.subjectAreaRatio * 22 +
        hero.extentBalance * 18 +
        (1 - washoutIndex) * 20 +
        Math.min(12, globalLuminanceStdev * 0.08)
    )
  );

  return {
    deadSpaceRatio: Number(deadSpaceRatio.toFixed(4)),
    centerSignalRatio: Number(centerSignalRatio.toFixed(5)),
    globalLuminanceStdev: Number(globalLuminanceStdev.toFixed(3)),
    edgeTextureStdev: Number(edgeTextureStdev.toFixed(3)),
    washoutIndex: Number(washoutIndex.toFixed(4)),
    silhouetteStrength: Number(silhouetteStrength.toFixed(4)),
    readabilityEstimate: Number(readabilityEstimate.toFixed(2)),
  };
}

export function computeSimScoreBase(params: {
  simBothPass: boolean;
  heroPass: boolean;
  integrityPass: boolean;
  subjectAreaRatio: number;
  extentBalance: number;
  signalPixelRatio: number;
  luminanceRange: number;
  nearWhitePixelRatio: number;
}): number {
  let s = 0;
  if (params.simBothPass) s += 1_000_000;
  if (params.heroPass) s += 200_000;
  if (params.integrityPass) s += 100_000;
  s += params.subjectAreaRatio * 50_000;
  s += params.extentBalance * 30_000;
  s += params.signalPixelRatio * 80_000;
  s += params.luminanceRange * 80;
  s -= params.nearWhitePixelRatio * 25_000;
  return Math.round(s * 100) / 100;
}

export function computeCalibratedSimScore(params: {
  simBothPass: boolean;
  heroPass: boolean;
  integrityPass: boolean;
  subjectAreaRatio: number;
  extentBalance: number;
  subjectWidthRatio: number;
  subjectHeightRatio: number;
  signalPixelRatio: number;
  luminanceRange: number;
  nearWhitePixelRatio: number;
  q: CanonicalSimulationQualityMetrics;
}): { simScoreBase: number; simScore: number; calibratedReasons: string[] } {
  const simScoreBase = computeSimScoreBase({
    simBothPass: params.simBothPass,
    heroPass: params.heroPass,
    integrityPass: params.integrityPass,
    subjectAreaRatio: params.subjectAreaRatio,
    extentBalance: params.extentBalance,
    signalPixelRatio: params.signalPixelRatio,
    luminanceRange: params.luminanceRange,
    nearWhitePixelRatio: params.nearWhitePixelRatio,
  });

  const reasons: string[] = [];
  let score = simScoreBase;

  score += params.q.readabilityEstimate * 920;
  reasons.push(`cal_readability_${params.q.readabilityEstimate.toFixed(1)}`);

  score += params.q.silhouetteStrength * 480;
  reasons.push(`cal_silhouette_${params.q.silhouetteStrength.toFixed(2)}`);

  score += params.q.centerSignalRatio * 52_000;
  reasons.push(`cal_center_signal_${params.q.centerSignalRatio.toFixed(4)}`);

  score -= params.q.washoutIndex * 108_000;
  reasons.push(`cal_washout_penalty_${params.q.washoutIndex.toFixed(3)}`);

  score -= params.q.deadSpaceRatio * 32_000;
  reasons.push(`cal_dead_space_${params.q.deadSpaceRatio.toFixed(3)}`);

  const minWH = Math.min(params.subjectWidthRatio, params.subjectHeightRatio);
  score += minWH * 12_000;
  reasons.push(`cal_subject_min_wh_${minWH.toFixed(3)}`);

  if (params.q.edgeTextureStdev > 40) {
    const over = params.q.edgeTextureStdev - 40;
    score -= over * 950;
    reasons.push(`cal_edge_texture_penalty_${over.toFixed(1)}`);
  }

  const simAllCorePass = params.simBothPass && params.heroPass && params.integrityPass;
  if (simAllCorePass && params.q.washoutIndex > 0.68 && params.q.centerSignalRatio < 0.14) {
    score -= 220_000;
    reasons.push('cal_suspicious_pass_washy_center');
  }

  score = Math.round(score * 100) / 100;
  return { simScoreBase, simScore: score, calibratedReasons: reasons.slice(0, 8) };
}
