import sharp from 'sharp';
import type { DualGateEvaluation, GateResult, MarketplaceImagePolicyProfile, ScoredImageCandidate } from './types';

export function evaluateDualGatesOnCandidate(
  candidate: ScoredImageCandidate,
  profile: MarketplaceImagePolicyProfile
): DualGateEvaluation {
  const policyFailures: string[] = [];
  const conversionFailures: string[] = [];

  if (candidate.policyFitness < profile.dualGate.minPolicyFitness) {
    policyFailures.push(
      `policy_fitness_${candidate.policyFitness}_below_${profile.dualGate.minPolicyFitness}`
    );
  }
  if (candidate.scores.textLogoRisk > 82) {
    policyFailures.push(`text_logo_risk_high_${candidate.scores.textLogoRisk}`);
  }
  if (candidate.scores.backgroundSimplicity < 38) {
    policyFailures.push(`background_not_simple_${candidate.scores.backgroundSimplicity}`);
  }

  if (candidate.conversionFitness < profile.dualGate.minConversionFitness) {
    conversionFailures.push(
      `conversion_fitness_${candidate.conversionFitness}_below_${profile.dualGate.minConversionFitness}`
    );
  }
  if (candidate.scores.catalogLook < 44) {
    conversionFailures.push(`catalog_look_weak_${candidate.scores.catalogLook}`);
  }
  if (candidate.scores.productOccupancy < 35) {
    conversionFailures.push(`product_occupancy_weak_${candidate.scores.productOccupancy}`);
  }

  const policy: GateResult = { pass: policyFailures.length === 0, failures: policyFailures };
  const conversion: GateResult = { pass: conversionFailures.length === 0, failures: conversionFailures };

  return {
    policy,
    conversion,
    bothPass: policy.pass && conversion.pass,
  };
}

/** After remediation — re-score dimensions + edge on output buffer. */
export async function evaluateDualGatesOnOutputBuffer(
  buf: Buffer,
  profile: MarketplaceImagePolicyProfile
): Promise<DualGateEvaluation> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const slot = profile.slots.main;
  const policyFailures: string[] = [];
  const conversionFailures: string[] = [];

  if (W < slot.minWidth || H < slot.minHeight) {
    policyFailures.push(`output_below_min_dimensions_${W}x${H}`);
  }
  if (W > 0 && H > 0 && Math.abs(W / H - 1) > slot.maxAspectRatioDeviation + 0.08) {
    policyFailures.push(`output_aspect_off_${W}x${H}`);
  }

  const edge = await sharp(buf)
    .rotate()
    .extract({
      left: 0,
      top: 0,
      width: W,
      height: Math.max(4, Math.floor(H * 0.08)),
    })
    .flatten({ background: '#ffffff' })
    .stats();
  const edgeMean = (edge.channels[0].mean + edge.channels[1].mean + edge.channels[2].mean) / 3;
  const edgeStd =
    (edge.channels[0].stdev + edge.channels[1].stdev + edge.channels[2].stdev) / 3;

  if (slot.requireWhiteishBackgroundProxy && edgeMean < slot.minEdgeMeanLuminance - 15) {
    policyFailures.push(`output_edge_not_light_${edgeMean.toFixed(1)}`);
  }
  if (edgeStd > slot.maxEdgeTextureStdev + 8) {
    policyFailures.push(`output_edge_texture_high_${edgeStd.toFixed(1)}`);
  }

  const st = await sharp(buf).rotate().stats();
  const fullMean = (st.channels[0].mean + st.channels[1].mean + st.channels[2].mean) / 3;
  if (fullMean < 200) {
    conversionFailures.push(`output_global_dim_${fullMean.toFixed(1)}`);
  }

  const policy: GateResult = { pass: policyFailures.length === 0, failures: policyFailures };
  const conversion: GateResult = { pass: conversionFailures.length === 0, failures: conversionFailures };

  return {
    policy,
    conversion,
    bothPass: policy.pass && conversion.pass,
  };
}

/**
 * P82 — Simulation-grade output policy/conversion check: same edge/global signals as production,
 * but skips absolute min pixel dimensions so preview-sized outputs (≈960–1152) can be ranked.
 */
export async function evaluateSimulationDualGatesOnOutputBuffer(
  buf: Buffer,
  profile: MarketplaceImagePolicyProfile
): Promise<DualGateEvaluation> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const slot = profile.slots.main;
  const policyFailures: string[] = [];
  const conversionFailures: string[] = [];

  if (W > 0 && H > 0 && Math.abs(W / H - 1) > slot.maxAspectRatioDeviation + 0.08) {
    policyFailures.push(`sim_output_aspect_off_${W}x${H}`);
  }

  if (W < 32 || H < 32) {
    policyFailures.push(`sim_output_too_small_${W}x${H}`);
  }

  const edge = await sharp(buf)
    .rotate()
    .extract({
      left: 0,
      top: 0,
      width: W,
      height: Math.max(4, Math.floor(H * 0.08)),
    })
    .flatten({ background: '#ffffff' })
    .stats();
  const edgeMean = (edge.channels[0].mean + edge.channels[1].mean + edge.channels[2].mean) / 3;
  const edgeStd =
    (edge.channels[0].stdev + edge.channels[1].stdev + edge.channels[2].stdev) / 3;

  if (slot.requireWhiteishBackgroundProxy && edgeMean < slot.minEdgeMeanLuminance - 15) {
    policyFailures.push(`sim_output_edge_not_light_${edgeMean.toFixed(1)}`);
  }
  if (edgeStd > slot.maxEdgeTextureStdev + 8) {
    policyFailures.push(`sim_output_edge_texture_high_${edgeStd.toFixed(1)}`);
  }

  const st = await sharp(buf).rotate().stats();
  const fullMean = (st.channels[0].mean + st.channels[1].mean + st.channels[2].mean) / 3;
  if (fullMean < 200) {
    conversionFailures.push(`sim_output_global_dim_${fullMean.toFixed(1)}`);
  }

  const policy: GateResult = { pass: policyFailures.length === 0, failures: policyFailures };
  const conversion: GateResult = { pass: conversionFailures.length === 0, failures: conversionFailures };

  return {
    policy,
    conversion,
    bothPass: policy.pass && conversion.pass,
  };
}
