import type { MarketplaceImagePolicyProfile } from './types';

/** Mercado Libre Chile — strict portada + gallery (P76 canonical). */
export const ML_CHILE_POLICY_PROFILE_V1: MarketplaceImagePolicyProfile = {
  id: 'mercadolibre_mlc_v1',
  marketplace: 'mercadolibre',
  siteId: 'MLC',
  label: 'Mercado Libre Chile (strict main + gallery)',
  slots: {
    main: {
      minWidth: 1000,
      minHeight: 1000,
      maxAspectRatioDeviation: 0.22,
      requireWhiteishBackgroundProxy: true,
      maxEdgeTextureStdev: 38,
      minEdgeMeanLuminance: 210,
    },
    gallery: {
      minWidth: 500,
      minHeight: 500,
      maxAspectRatioDeviation: 0.35,
      requireWhiteishBackgroundProxy: false,
      maxEdgeTextureStdev: 55,
      minEdgeMeanLuminance: 160,
    },
    detail: {
      minWidth: 500,
      minHeight: 500,
      maxAspectRatioDeviation: 0.35,
      requireWhiteishBackgroundProxy: false,
      maxEdgeTextureStdev: 55,
      minEdgeMeanLuminance: 160,
    },
  },
  dualGate: {
    minPolicyFitness: 68,
    minConversionFitness: 52,
  },
  /** P79 — blocks thin/inset “postage stamp” heroes that still pass policy+conversion on buffer. */
  heroCoverGate: {
    minSubjectAreaRatio: 0.42,
    minSubjectWidthRatio: 0.42,
    minSubjectHeightRatio: 0.38,
    minExtentBalance: 0.32,
    trimThreshold: 14,
  },
  /** P80 — pixel stats independent of trim; closes near-blank “full canvas = subject” loophole. */
  outputIntegrityGate: {
    sampleMaxDimension: 256,
    minSignalPixelRatio: 0.018,
    maxNearWhitePixelRatio: 0.97,
    nearWhiteRgbThreshold: 249,
    meanLuminanceTriggersStdevCheck: 246,
    minLuminanceStdevWhenMeanHigh: 4.5,
    minLuminanceRange: 6,
    minSubjectAreaRatioForTrimSuspicion: 0.985,
    minSignalPixelRatioWhenSubjectFullCanvas: 0.028,
    trimSuspicionMeanLuminanceMin: 248,
  },
  defaultRemediationRecipeChain: ['square_white_catalog_jpeg', 'inset_white_catalog_png'],
  compatibleRecipeIds: ['square_white_catalog_jpeg', 'inset_white_catalog_png'],
};

export function getMercadoLibreChilePolicyProfile(): MarketplaceImagePolicyProfile {
  return ML_CHILE_POLICY_PROFILE_V1;
}

export function isMlCanonicalPipelineEnabled(): boolean {
  return process.env.ML_CANONICAL_IMAGE_PIPELINE !== '0' && process.env.ML_CANONICAL_IMAGE_PIPELINE !== 'false';
}

/** P79 hero/cover gate — default on; set ML_HERO_COVER_GATE=0 or false to disable (break-glass only). */
export function isHeroCoverGateEnabled(): boolean {
  return process.env.ML_HERO_COVER_GATE !== '0' && process.env.ML_HERO_COVER_GATE !== 'false';
}

/** P80 output-integrity gate — default on; set ML_OUTPUT_INTEGRITY_GATE=0 or false to disable (break-glass only). */
export function isOutputIntegrityGateEnabled(): boolean {
  return (
    process.env.ML_OUTPUT_INTEGRITY_GATE !== '0' && process.env.ML_OUTPUT_INTEGRITY_GATE !== 'false'
  );
}

/** P82 — simulation-based remediation ranking; default on. Set ML_REMEDIATION_SIMULATION=0 to disable. */
export function isRemediationSimulationEnabled(): boolean {
  return (
    process.env.ML_REMEDIATION_SIMULATION !== '0' && process.env.ML_REMEDIATION_SIMULATION !== 'false'
  );
}

export function getRemediationSimulationMaxCandidates(): number {
  const n = Number(process.env.ML_REMEDIATION_SIM_MAX_CANDIDATES);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return Math.floor(n);
  return 5;
}

export function getRemediationSimulationPreviewMaxInput(): number {
  const n = Number(process.env.ML_REMEDIATION_SIM_PREVIEW_MAX_INPUT);
  if (Number.isFinite(n) && n >= 320 && n <= 1600) return Math.floor(n);
  return 900;
}

/** P83 — higher-fidelity preview for top simulated candidates. Default on; ML_REMEDIATION_SIM_HIFI=0 disables. */
export function isRemediationSimulationHifiEnabled(): boolean {
  return process.env.ML_REMEDIATION_SIM_HIFI !== '0' && process.env.ML_REMEDIATION_SIM_HIFI !== 'false';
}

export function getRemediationSimulationHifiTopCandidates(): number {
  const n = Number(process.env.ML_REMEDIATION_SIM_HIFI_TOP_N);
  if (Number.isFinite(n) && n >= 0 && n <= 5) return Math.floor(n);
  return 2;
}

export function getRemediationSimulationHifiMaxInput(): number {
  const n = Number(process.env.ML_REMEDIATION_SIM_HIFI_MAX_INPUT);
  if (Number.isFinite(n) && n >= 640 && n <= 2000) return Math.floor(n);
  return 1400;
}

/** P84 — compare up to N gate-passing remediated covers; default on. ML_FINAL_COVER_PREFERENCE=0 disables. */
export function isFinalCoverPreferenceEnabled(): boolean {
  return process.env.ML_FINAL_COVER_PREFERENCE !== '0' && process.env.ML_FINAL_COVER_PREFERENCE !== 'false';
}

/** P84 — max passing finals to collect before preference (2–5). */
export function getFinalCoverPreferenceMaxFinalists(): number {
  const n = Number(process.env.ML_FINAL_COVER_PREFERENCE_MAX_FINALISTS);
  if (Number.isFinite(n) && n >= 2 && n <= 5) return Math.floor(n);
  return 3;
}
