/**
 * P89 — Canonical web preflight contract for Mercado Libre publication (reusable per product).
 */

import { env } from '../config/env';
import { MarketplaceService } from './marketplace.service';
import { productService } from './product.service';
import type { PrePublishProductShape } from './pre-publish-validator.service';
import { runPreventiveEconomicsCore } from './pre-publish-validator.service';
import { resolveMercadoLibrePublishImageInputs } from './mercadolibre-image-remediation.service';
import { getMarketplaceContext } from './marketplace-context.service';
import { getConnectorReadinessForUser, getWebhookStatus } from './webhook-readiness.service';
import {
  mlcCanonicalPricingFromEconomicsCore,
  type MlcCanonicalPricingAssessment,
} from './mlc-canonical-pricing.service';
import { getMlPhysicalPackageBlockers } from '../utils/ml-physical-package-guard';
import { isRedisAvailable } from '../config/redis';
import {
  mercadoLibrePublishRequiresRedisQueue,
  mercadoLibreWebhookRequiresBullmq,
} from '../utils/ml-operational-guards';
import { mlPilotOpsService, normalizePilotCategoryKey } from './ml-pilot-ops.service';

export type PublishPreflightOverallState =
  | 'ready_to_publish'
  | 'blocked_images'
  | 'blocked_pricing'
  | 'blocked_language'
  | 'blocked_marketplace_connection'
  | 'blocked_credentials'
  | 'blocked_postsale_readiness'
  | 'blocked_missing_source_data'
  | 'blocked_product_status'
  | 'blocked_physical_package'
  | 'blocked_international_capability'
  | 'blocked_pilot_readiness';

export type MercadoLibrePublishMode = 'local' | 'international';
export type MercadoLibrePublishIntent = 'dry_run' | 'pilot' | 'production';
export type MercadoLibreChannelCapability =
  | 'local_only'
  | 'international_candidate'
  | 'foreign_seller_enabled'
  | 'blocked';
export type MercadoLibreProgramResolved =
  | 'local'
  | 'international_candidate'
  | 'foreign_seller_verified'
  | 'unknown'
  | 'blocked';
export type MercadoLibreAccountVerificationStatus =
  | 'verified'
  | 'manual_confirmation_required'
  | 'not_verified';

export interface MercadoLibreProgramVerificationPayload {
  verified: boolean;
  accountVerificationStatus: MercadoLibreAccountVerificationStatus;
  programResolved: MercadoLibreProgramResolved;
  verifiedProgram: MercadoLibreProgramResolved;
  siteIdResolved: string | null;
  verifiedSiteId: string | null;
  environmentResolved: 'sandbox' | 'production' | 'unknown';
  verifiedSellerType: string;
  verifiedScopes: string[];
  verifiedCapabilities: string[];
  lastVerifiedAt: string | null;
  verificationEvidence: Record<string, unknown>;
  verificationWarnings: string[];
  verificationBlockers: string[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
}

export interface MercadoLibrePilotReadinessPayload {
  pilotAllowed: boolean;
  pilotModeResolved: MercadoLibrePublishIntent;
  blockers: string[];
  warnings: string[];
  requiredManualChecks: string[];
  runbookHints: string[];
  evidence: {
    publishIntent: MercadoLibrePublishIntent;
    requestedMode: MercadoLibrePublishMode;
    programResolved: MercadoLibreProgramResolved;
    accountVerified: boolean;
    internationalReadinessAllowed: boolean;
    complianceStatus: MercadoLibreComplianceStatus;
    returnsReady: boolean;
    communicationReady: boolean;
    workersReady: boolean;
    redisAvailable: boolean;
    eventFlowReady: boolean;
    environmentResolved: 'sandbox' | 'production' | 'unknown';
    verificationFreshHours: number | null;
    approvalRequired: boolean;
    approvalId: string | null;
    approvalExpiresAt: string | null;
    categoryKeyResolved: string | null;
    categoryAllowlisted: boolean;
    categoryAllowlistNotes: string | null;
    abortControlState: string;
    securityFlags: {
      pilotModeEnabled: boolean;
      pilotRequireManualAck: boolean;
      pilotManualAckProvided: boolean;
      maxActivePilotPublications: number;
      activeMercadoLibrePublications: number;
    };
  };
}

export type MercadoLibreComplianceStatus = 'pass' | 'review_required' | 'blocked';

export interface MercadoLibreComplianceReadinessPayload {
  status: MercadoLibreComplianceStatus;
  reasons: Array<
    | 'restricted_category'
    | 'homologation_required'
    | 'missing_regulatory_data'
    | 'ip_risk'
    | 'sensitive_claims'
    | 'unknown_category_risk'
  >;
  blockers: string[];
  warnings: string[];
  evidence: {
    categoryFingerprint: string;
    hasRegulatoryData: boolean;
    matchedSignals: string[];
  };
  nextActions: string[];
}

export type MercadoLibreReturnsReadinessStatus =
  | 'ready'
  | 'missing_return_address'
  | 'missing_return_policy_config'
  | 'not_required_for_local'
  | 'review_required';

export interface MercadoLibreReturnsReadinessPayload {
  status: MercadoLibreReturnsReadinessStatus;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  evidence: {
    returnAddressConfigured: boolean;
    returnPolicyConfigured: boolean;
    shippingOriginCountry: string | null;
    sellerOriginCountry: string | null;
  };
  nextActions: string[];
}

export interface MercadoLibreCommunicationReadinessPayload {
  communicationReady: boolean;
  blockers: string[];
  warnings: string[];
  evidence: {
    postSaleContactConfigured: boolean;
    responseSlaEnabled: boolean;
    alertsConfigured: boolean;
  };
  nextActions: string[];
}

export interface MercadoLibreInternationalReadinessPayload {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
  complianceReadiness: MercadoLibreComplianceReadinessPayload;
  returnsReadiness: MercadoLibreReturnsReadinessPayload;
  communicationReadiness: MercadoLibreCommunicationReadinessPayload;
  evidence: {
    siteId: string;
    requestedMode: MercadoLibrePublishMode;
    channelCapability: MercadoLibreChannelCapability;
    channelModeConfigured: string;
    foreignSellerEnabled: boolean;
    internationalPublishingEnabled: boolean;
    returnAddressConfigured: boolean;
    shippingOriginCountry: string | null;
    sellerOriginCountry: string | null;
    queue: {
      publishQueueRequired: boolean;
      publishQueueReady: boolean;
      webhookQueueRequired: boolean;
      webhookQueueReady: boolean;
      redisAvailable: boolean;
    };
    connector: {
      eventFlowReady: boolean;
      operationMode: string;
    };
    categoryFingerprint: string;
    shippingModeExpected: string;
  };
  nextActions: string[];
}

/** E2E canary — heuristic rank for “safest first real publish” (same gates as preflight). */
export type MercadoLibreCanaryTier = 'recommended' | 'acceptable' | 'risky' | 'blocked';

export interface MercadoLibreCanaryAssessment {
  tier: MercadoLibreCanaryTier;
  /** 0–100; higher = more suitable for a first real web canary publish. */
  score: number;
  reasons: string[];
}

export interface MercadoLibrePublishPreflightPayload {
  schemaVersion: 1;
  marketplace: 'mercadolibre';
  productId: number;
  publishIntent: MercadoLibrePublishIntent;
  requestedMode: MercadoLibrePublishMode;
  modeResolved: MercadoLibrePublishMode;
  channelCapability: MercadoLibreChannelCapability;
  overallState: PublishPreflightOverallState;
  publishAllowed: boolean;
  programVerification: MercadoLibreProgramVerificationPayload;
  pilotReadiness: MercadoLibrePilotReadinessPayload;
  internationalReadiness: MercadoLibreInternationalReadinessPayload;
  complianceReadiness: MercadoLibreComplianceReadinessPayload;
  returnsReadiness: MercadoLibreReturnsReadinessPayload;
  communicationReadiness: MercadoLibreCommunicationReadinessPayload;
  /** Canary suitability for end-to-end dropshipping test (admin product picker). */
  canary: MercadoLibreCanaryAssessment;
  nextAction: string;
  blockers: string[];
  warnings: string[];
  productStatus: string | null;
  listingSalePriceUsd: number;
  canonicalPricing: MlcCanonicalPricingAssessment;
  images: {
    publishSafe: boolean;
    blockingReason?: string | null;
    imageCount: number;
    /** P97: required MLC pack slots for publish gate */
    packApproved: boolean;
    requiredAssets: Array<{
      assetKey: string;
      approvalState: string;
      exists: boolean;
      localPath: string | null;
      min1200: boolean | null;
      squareLike: boolean | null;
      notes: string | null;
    }>;
  };
  language: {
    supported: boolean;
    country: string;
    resolvedLanguage: string;
    requiredLanguage: string;
    reason?: string;
  };
  credentials: {
    present: boolean;
    active: boolean;
    issues: string[];
  };
  mercadoLibreApi: {
    testConnectionOk: boolean;
    /** Same path as MarketplaceService.testConnection (incl. refresh-on-401) */
    testConnectionMessage?: string;
    credentialEnvironment: 'sandbox' | 'production';
  };
  postsale: {
    mercadolibreWebhookConfigured: boolean;
    mercadolibreEventFlowReady: boolean;
    mercadolibreConnectorAutomationReady: boolean;
    mercadolibreOperationMode: string;
    fulfillPrerequisiteAliExpressUrl: boolean;
    verificationNotes: string[];
  };
}

const ML_COMPLIANCE_RESTRICTED_KEYWORDS = ['weapon', 'arma', 'drug', 'narcotic', 'explosive'];
const ML_COMPLIANCE_HOMOLOGATION_KEYWORDS = [
  'battery',
  'bateria',
  'lithium',
  'litio',
  'radio',
  'bluetooth',
  'wifi',
  'rf',
  'wireless',
];
const ML_COMPLIANCE_IP_RISK_KEYWORDS = [
  'replica',
  'counterfeit',
  'clone',
  'pirated',
  'compatible with apple',
  'compatible with samsung',
];
const ML_COMPLIANCE_SENSITIVE_CLAIM_KEYWORDS = [
  'medic',
  'medicine',
  'medicina',
  'cure',
  'therapeutic',
  'cosmetic',
  'cosmetico',
  'supplement',
  'suplemento',
  'food',
  'alimento',
  'liquid',
  'liquido',
  'aerosol',
];
const ML_COMPLIANCE_REGULATORY_DATA_HINTS = [
  'cert',
  'certificate',
  'homolog',
  'regulator',
  'regulatory',
  'ingredients',
  'ingredient',
  'manufacturer',
  'fabricante',
  'safety',
  'composition',
  'composicion',
];

function toMercadoLibrePublishMode(input: unknown): MercadoLibrePublishMode {
  return String(input || '').toLowerCase() === 'international' ? 'international' : 'local';
}

export function toMercadoLibrePublishIntent(input: unknown): MercadoLibrePublishIntent {
  const v = String(input || '').toLowerCase();
  if (v === 'dry_run') return 'dry_run';
  if (v === 'pilot') return 'pilot';
  return 'production';
}

function normalizeChannelMode(value: unknown): MercadoLibreChannelCapability {
  const v = String(value || '').toLowerCase();
  if (v === 'blocked') return 'blocked';
  if (v === 'international_candidate') return 'international_candidate';
  if (v === 'foreign_seller_enabled') return 'foreign_seller_enabled';
  return 'local_only';
}

function normalizeComplianceText(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase();
  if (value == null) return '';
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function findMatchedKeywords(haystack: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => haystack.includes(keyword));
}

function parseLooseObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function resolvePilotCategoryKey(input: {
  row: Record<string, unknown>;
  productData: unknown;
}): string | null {
  const row = input.row;
  const parsedProductData = parseLooseObject(input.productData);
  const candidates: unknown[] = [
    row.categoryId,
    row.category,
    row.productCategory,
    parsedProductData?.categoryKey,
    parsedProductData?.categoryId,
    parsedProductData?.category,
    parsedProductData?.mlCategoryId,
    parsedProductData?.mercadoLibreCategoryId,
  ];
  for (const candidate of candidates) {
    const normalized = normalizePilotCategoryKey(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function evaluateComplianceReadiness(input: {
  categoryFingerprint: string;
  productData: unknown;
}): MercadoLibreComplianceReadinessPayload {
  const categoryFingerprint = String(input.categoryFingerprint || '').trim();
  const productDataText = normalizeComplianceText(input.productData);
  const haystack = `${categoryFingerprint.toLowerCase()} ${productDataText}`.trim();
  const reasons = new Set<MercadoLibreComplianceReadinessPayload['reasons'][number]>();
  const matchedSignals = new Set<string>();

  if (!categoryFingerprint) {
    reasons.add('unknown_category_risk');
    matchedSignals.add('category_fingerprint_missing');
  }

  const restrictedMatches = findMatchedKeywords(haystack, ML_COMPLIANCE_RESTRICTED_KEYWORDS);
  if (restrictedMatches.length > 0) {
    reasons.add('restricted_category');
    restrictedMatches.forEach((m) => matchedSignals.add(`restricted:${m}`));
  }

  const homologationMatches = findMatchedKeywords(haystack, ML_COMPLIANCE_HOMOLOGATION_KEYWORDS);
  if (homologationMatches.length > 0) {
    reasons.add('homologation_required');
    homologationMatches.forEach((m) => matchedSignals.add(`homologation:${m}`));
  }

  const ipRiskMatches = findMatchedKeywords(haystack, ML_COMPLIANCE_IP_RISK_KEYWORDS);
  if (ipRiskMatches.length > 0) {
    reasons.add('ip_risk');
    ipRiskMatches.forEach((m) => matchedSignals.add(`ip_risk:${m}`));
  }

  const sensitiveMatches = findMatchedKeywords(haystack, ML_COMPLIANCE_SENSITIVE_CLAIM_KEYWORDS);
  if (sensitiveMatches.length > 0) {
    reasons.add('sensitive_claims');
    sensitiveMatches.forEach((m) => matchedSignals.add(`sensitive_claim:${m}`));
  }

  const hasRegulatoryData = ML_COMPLIANCE_REGULATORY_DATA_HINTS.some((keyword) =>
    haystack.includes(keyword)
  );
  const needsRegulatoryData =
    reasons.has('homologation_required') || reasons.has('sensitive_claims');
  if (needsRegulatoryData && !hasRegulatoryData) {
    reasons.add('missing_regulatory_data');
  }

  const reasonsList = Array.from(reasons);
  const blockers: string[] = [];
  const warnings: string[] = [];
  let status: MercadoLibreComplianceStatus = 'pass';

  if (reasons.has('restricted_category') || reasons.has('missing_regulatory_data')) {
    status = 'blocked';
    for (const reason of reasonsList) {
      blockers.push(`international_compliance:${reason}`);
    }
  } else if (reasonsList.length > 0) {
    status = 'review_required';
    blockers.push('international_compliance:review_required');
    for (const reason of reasonsList) {
      blockers.push(`international_compliance:${reason}`);
    }
  }

  const nextActions: string[] = [];
  for (const reason of reasonsList) {
    if (reason === 'restricted_category') {
      nextActions.push(
        'Category is restricted for international mode. Keep this SKU in local mode or remove restricted attributes.'
      );
    } else if (reason === 'homologation_required') {
      nextActions.push('Provide homologation/certification evidence before international publication.');
    } else if (reason === 'missing_regulatory_data') {
      nextActions.push(
        'Add minimum regulatory data (certification, manufacturer/composition/safety metadata) before international publication.'
      );
    } else if (reason === 'ip_risk') {
      nextActions.push('Resolve IP/brand risk (authorization or claim cleanup) before international publication.');
    } else if (reason === 'sensitive_claims') {
      nextActions.push('Remove sensitive claims or provide supporting evidence for review.');
    } else if (reason === 'unknown_category_risk') {
      nextActions.push('Set a valid category fingerprint before international publication.');
    }
  }

  if (status === 'review_required') {
    warnings.push('international_compliance:manual_review_required');
  }

  return {
    status,
    reasons: reasonsList,
    blockers,
    warnings,
    evidence: {
      categoryFingerprint,
      hasRegulatoryData,
      matchedSignals: Array.from(matchedSignals),
    },
    nextActions: Array.from(new Set(nextActions)),
  };
}

function evaluateReturnsReadiness(input: {
  requestedMode: MercadoLibrePublishMode;
  returnAddressConfigured: boolean;
  returnPolicyConfigured: boolean;
  shippingOriginCountry: string | null;
  sellerOriginCountry: string | null;
}): MercadoLibreReturnsReadinessPayload {
  if (input.requestedMode === 'local') {
    return {
      status: 'not_required_for_local',
      ready: true,
      blockers: [],
      warnings: [],
      evidence: {
        returnAddressConfigured: input.returnAddressConfigured,
        returnPolicyConfigured: input.returnPolicyConfigured,
        shippingOriginCountry: input.shippingOriginCountry,
        sellerOriginCountry: input.sellerOriginCountry,
      },
      nextActions: [],
    };
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];

  if (!input.returnAddressConfigured) {
    blockers.push('international_returns:missing_return_address');
    nextActions.push('Configure a valid return address before international publication.');
  }
  if (!input.returnPolicyConfigured) {
    blockers.push('international_returns:missing_return_policy_config');
    nextActions.push('Configure minimum return policy settings before international publication.');
  }

  let status: MercadoLibreReturnsReadinessStatus = 'ready';
  if (!input.returnAddressConfigured) {
    status = 'missing_return_address';
  } else if (!input.returnPolicyConfigured) {
    status = 'missing_return_policy_config';
  }

  return {
    status,
    ready: blockers.length === 0,
    blockers,
    warnings,
    evidence: {
      returnAddressConfigured: input.returnAddressConfigured,
      returnPolicyConfigured: input.returnPolicyConfigured,
      shippingOriginCountry: input.shippingOriginCountry,
      sellerOriginCountry: input.sellerOriginCountry,
    },
    nextActions: Array.from(new Set(nextActions)),
  };
}

function evaluateCommunicationReadiness(input: {
  requestedMode: MercadoLibrePublishMode;
  postSaleContactConfigured: boolean;
  responseSlaEnabled: boolean;
  alertsConfigured: boolean;
}): MercadoLibreCommunicationReadinessPayload {
  if (input.requestedMode === 'local') {
    return {
      communicationReady: true,
      blockers: [],
      warnings: [],
      evidence: {
        postSaleContactConfigured: input.postSaleContactConfigured,
        responseSlaEnabled: input.responseSlaEnabled,
        alertsConfigured: input.alertsConfigured,
      },
      nextActions: [],
    };
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];

  if (!input.postSaleContactConfigured) {
    blockers.push('international_communication:missing_post_sale_contact');
    nextActions.push('Configure post-sale contact channel before international publication.');
  }
  if (!input.responseSlaEnabled) {
    blockers.push('international_communication:response_sla_not_enabled');
    nextActions.push('Enable and commit response SLA before international publication.');
  }
  if (!input.alertsConfigured) {
    blockers.push('international_communication:alerts_not_configured');
    nextActions.push('Configure post-sale alerts before international publication.');
  }

  return {
    communicationReady: blockers.length === 0,
    blockers,
    warnings,
    evidence: {
      postSaleContactConfigured: input.postSaleContactConfigured,
      responseSlaEnabled: input.responseSlaEnabled,
      alertsConfigured: input.alertsConfigured,
    },
    nextActions: Array.from(new Set(nextActions)),
  };
}

function normalizeProgramOverride(
  value: unknown
): 'none' | 'international_candidate' | 'foreign_seller_verified' | null {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'none') return 'none';
  if (v === 'international_candidate') return 'international_candidate';
  if (v === 'foreign_seller_verified') return 'foreign_seller_verified';
  return null;
}

function normalizeSiteId(value: unknown): string | null {
  const v = String(value || '').trim().toUpperCase();
  return v.length > 0 ? v : null;
}

function parseVerificationAgeHours(lastVerifiedAt: string | null): number | null {
  if (!lastVerifiedAt) return null;
  const ts = Date.parse(lastVerifiedAt);
  if (Number.isNaN(ts)) return null;
  const deltaMs = Date.now() - ts;
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return 0;
  return Math.round((deltaMs / (1000 * 60 * 60)) * 100) / 100;
}

function parseProductDataObject(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function resolvePilotCategoryKeyFromProduct(
  categoryRaw: unknown,
  productDataRaw: unknown
): string | null {
  const { normalizePilotCategoryKey } = require('./ml-pilot-ops.service') as {
    normalizePilotCategoryKey: (value: unknown) => string | null;
  };
  const productData = parseProductDataObject(productDataRaw);
  const candidates: unknown[] = [
    productData?.categoryId,
    productData?.mlCategoryId,
    productData?.category_id,
    (productData?.marketplace as Record<string, unknown> | undefined)?.mercadolibre &&
      ((productData?.marketplace as Record<string, unknown>).mercadolibre as Record<string, unknown>)
        ?.categoryId,
    categoryRaw,
  ];
  for (const candidate of candidates) {
    const key = normalizePilotCategoryKey(candidate);
    if (key) return key;
  }
  return null;
}

export function evaluateMercadoLibreProgramVerification(input: {
  requestedMode: MercadoLibrePublishMode;
  configuredChannelMode: string | null | undefined;
  foreignSellerEnabled: boolean;
  internationalPublishingEnabled: boolean;
  manualProgramVerificationOverride: unknown;
  credentialsPresent: boolean;
  credentialsActive: boolean;
  credentialsScope?: string | null;
  credentialsSiteId?: string | null;
  environmentResolved?: 'sandbox' | 'production' | null;
  externalVerificationOk: boolean;
  externalVerificationError?: string | null;
  profile:
    | {
        id?: string | number;
        nickname?: string;
        site_id?: string;
        seller_experience?: string;
        tags?: unknown;
        status?: unknown;
      }
    | null
    | undefined;
}): MercadoLibreProgramVerificationPayload {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];
  const channelMode = normalizeChannelMode(input.configuredChannelMode);
  const manualOverride = normalizeProgramOverride(input.manualProgramVerificationOverride);
  const profile = input.profile || null;
  const profileSiteId = normalizeSiteId(profile?.site_id);
  const credentialsSiteId = normalizeSiteId(input.credentialsSiteId);
  const siteIdResolved = profileSiteId || credentialsSiteId;
  const sellerType = String(profile?.seller_experience || '').trim() || 'unknown';
  const profileTags = Array.isArray(profile?.tags)
    ? (profile?.tags as unknown[]).map((t) => String(t || '').toLowerCase()).filter(Boolean)
    : [];
  const hasInternationalSignal = profileTags.some((tag) =>
    [
      'cross_border',
      'cross_border_seller',
      'global_seller',
      'international_seller',
      'cbt',
      'overseas',
      'foreign_seller',
    ].includes(tag)
  );
  const verifiedScopes = Array.from(
    new Set([String(input.credentialsScope || '').toLowerCase(), 'oauth_token'])
  ).filter(Boolean);
  const verifiedCapabilities = Array.from(
    new Set([
      hasInternationalSignal ? 'international_signal_from_profile' : 'no_external_international_signal',
      input.foreignSellerEnabled ? 'declared_foreign_seller_enabled' : 'declared_foreign_seller_disabled',
      input.internationalPublishingEnabled
        ? 'declared_international_publishing_enabled'
        : 'declared_international_publishing_disabled',
      channelMode === 'blocked' ? 'declared_channel_blocked' : 'declared_channel_not_blocked',
    ])
  );

  if (!input.credentialsPresent) {
    blockers.push('program_verification:credentials_missing');
    nextActions.push('Configure Mercado Libre OAuth credentials before pilot/production publication.');
  } else if (!input.credentialsActive) {
    blockers.push('program_verification:credentials_inactive');
    nextActions.push('Activate Mercado Libre credentials and re-run verification.');
  }

  if (!input.externalVerificationOk) {
    blockers.push('program_verification:external_account_verification_failed');
    if (input.externalVerificationError) {
      warnings.push(`program_verification:error_detail:${input.externalVerificationError}`);
    }
    nextActions.push('Re-run Mercado Libre account verification and confirm access token validity.');
  }

  if (credentialsSiteId && profileSiteId && credentialsSiteId !== profileSiteId) {
    blockers.push(`program_verification:site_id_mismatch:${credentialsSiteId}->${profileSiteId}`);
    nextActions.push('Align credential site_id with externally verified account site before publishing.');
  }

  if (input.requestedMode === 'international' && siteIdResolved !== 'MLC') {
    blockers.push(`program_verification:international_requires_mlc_site:${siteIdResolved || 'unknown'}`);
    nextActions.push('Use an MLC account/site for Mercado Libre Chile international pilot.');
  }

  let programResolved: MercadoLibreProgramResolved = 'unknown';
  if (channelMode === 'blocked') {
    programResolved = 'blocked';
    blockers.push('program_verification:channel_declared_blocked');
    nextActions.push('Unblock channel mode in workflow config before attempting pilot/production publication.');
  } else if (input.externalVerificationOk && hasInternationalSignal) {
    programResolved = 'foreign_seller_verified';
  } else if (manualOverride === 'foreign_seller_verified') {
    programResolved = 'foreign_seller_verified';
    warnings.push('program_verification:manual_override_foreign_seller_verified');
    nextActions.push('Keep manual override evidence attached to pilot runbook and re-verify externally every cycle.');
  } else if (
    manualOverride === 'international_candidate' ||
    channelMode === 'international_candidate' ||
    channelMode === 'foreign_seller_enabled' ||
    input.foreignSellerEnabled ||
    input.internationalPublishingEnabled
  ) {
    programResolved = 'international_candidate';
    warnings.push('program_verification:external_international_capability_not_fully_verified');
    nextActions.push('Obtain external evidence for international capability (or explicit admin approval) before production.');
  } else if (input.externalVerificationOk) {
    programResolved = 'local';
  }

  if (manualOverride === 'none') {
    warnings.push('program_verification:manual_override_none');
  }

  const verified =
    input.externalVerificationOk &&
    blockers.length === 0 &&
    programResolved !== 'unknown' &&
    programResolved !== 'blocked';
  const accountVerificationStatus: MercadoLibreAccountVerificationStatus =
    verified && programResolved !== 'international_candidate'
      ? 'verified'
      : input.externalVerificationOk && programResolved === 'international_candidate'
        ? 'manual_confirmation_required'
        : 'not_verified';
  const lastVerifiedAt = input.externalVerificationOk ? new Date().toISOString() : null;

  return {
    verified,
    accountVerificationStatus,
    programResolved,
    verifiedProgram: programResolved,
    siteIdResolved,
    verifiedSiteId: siteIdResolved,
    environmentResolved: input.environmentResolved || 'unknown',
    verifiedSellerType: sellerType,
    verifiedScopes,
    verifiedCapabilities,
    lastVerifiedAt,
    verificationEvidence: {
      external: {
        verified: input.externalVerificationOk,
        profileId: profile?.id ?? null,
        nickname: profile?.nickname ?? null,
        siteId: profileSiteId,
        sellerExperience: sellerType,
        tags: profileTags,
      },
      declarative: {
        configuredChannelMode: channelMode,
        foreignSellerEnabled: input.foreignSellerEnabled === true,
        internationalPublishingEnabled: input.internationalPublishingEnabled === true,
      },
      manual: {
        override: manualOverride,
      },
    },
    verificationWarnings: warnings,
    verificationBlockers: blockers,
    blockers,
    warnings,
    nextActions: Array.from(new Set(nextActions)),
  };
}

export function evaluateMercadoLibrePilotReadiness(input: {
  publishIntent: MercadoLibrePublishIntent;
  requestedMode: MercadoLibrePublishMode;
  programVerification: MercadoLibreProgramVerificationPayload;
  internationalReadiness: MercadoLibreInternationalReadinessPayload;
  approvalRequired: boolean;
  approvalId: string | null;
  approvalExpiresAt: string | null;
  approvalValid: boolean;
  approvalExpired: boolean;
  categoryKeyResolved: string | null;
  categoryAllowlisted: boolean;
  categoryAllowlistNotes: string | null;
  abortControlState: string;
  pilotModeEnabled: boolean;
  pilotRequireManualAck: boolean;
  pilotManualAckProvided: boolean;
  pilotMaxActivePublications: number;
  activeMercadoLibrePublications: number;
  workersReady: boolean;
  redisAvailable: boolean;
  eventFlowReady: boolean;
  environmentResolved: 'sandbox' | 'production' | 'unknown';
}): MercadoLibrePilotReadinessPayload {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const requiredManualChecks: string[] = [];
  const runbookHints: string[] = [
    'Run preflight dry_run before pilot publication.',
    'Keep rollback command ready (pause/close listing) before pilot publish.',
    'Store evidence: listing id, account profile snapshot, and post-publish checks.',
  ];

  const verificationFreshHours = parseVerificationAgeHours(input.programVerification.lastVerifiedAt);

  if (input.publishIntent === 'dry_run') {
    warnings.push('pilot_mode:dry_run_no_publication');
    return {
      pilotAllowed: true,
      pilotModeResolved: 'dry_run',
      blockers,
      warnings,
      requiredManualChecks,
      runbookHints,
      evidence: {
        publishIntent: input.publishIntent,
        requestedMode: input.requestedMode,
        programResolved: input.programVerification.programResolved,
        accountVerified: input.programVerification.verified,
        internationalReadinessAllowed: input.internationalReadiness.allowed,
        complianceStatus: input.internationalReadiness.complianceReadiness.status,
        returnsReady: input.internationalReadiness.returnsReadiness.ready,
        communicationReady: input.internationalReadiness.communicationReadiness.communicationReady,
        workersReady: input.workersReady,
        redisAvailable: input.redisAvailable,
        eventFlowReady: input.eventFlowReady,
        environmentResolved: input.environmentResolved,
        verificationFreshHours,
        approvalRequired: input.approvalRequired,
        approvalId: input.approvalId,
        approvalExpiresAt: input.approvalExpiresAt,
        categoryKeyResolved: input.categoryKeyResolved,
        categoryAllowlisted: input.categoryAllowlisted,
        categoryAllowlistNotes: input.categoryAllowlistNotes,
        abortControlState: input.abortControlState,
        securityFlags: {
          pilotModeEnabled: input.pilotModeEnabled,
          pilotRequireManualAck: input.pilotRequireManualAck,
          pilotManualAckProvided: input.pilotManualAckProvided,
          maxActivePilotPublications: input.pilotMaxActivePublications,
          activeMercadoLibrePublications: input.activeMercadoLibrePublications,
        },
      },
    };
  }

  if (input.publishIntent === 'pilot' && !input.pilotModeEnabled) {
    blockers.push('pilot_mode:pilot_disabled_in_workflow_config');
  }

  if (!input.workersReady) {
    blockers.push('pilot_operations:workers_not_ready');
  }
  if (!input.eventFlowReady) {
    blockers.push('pilot_operations:event_flow_not_ready');
  }

  if (input.requestedMode === 'international') {
    const program = input.programVerification.programResolved;
    if (program === 'local' || program === 'unknown' || program === 'blocked') {
      blockers.push(`pilot_program:international_not_permitted:${program}`);
    }
    if (program === 'international_candidate') {
      requiredManualChecks.push('admin_confirmation_for_international_candidate');
      if (input.pilotRequireManualAck && !input.pilotManualAckProvided) {
        blockers.push('pilot_manual_ack:required_for_international_candidate');
      }
    }
    if (input.internationalReadiness.complianceReadiness.status !== 'pass') {
      blockers.push(
        `pilot_compliance:requires_pass_status:${input.internationalReadiness.complianceReadiness.status}`
      );
    }
    if (!input.internationalReadiness.returnsReadiness.ready) {
      blockers.push('pilot_returns:not_ready');
    }
    if (!input.internationalReadiness.communicationReadiness.communicationReady) {
      blockers.push('pilot_communication:not_ready');
    }
    if (!input.internationalReadiness.allowed) {
      blockers.push('pilot_readiness:international_readiness_not_allowed');
    }
    if (verificationFreshHours == null || verificationFreshHours > 24) {
      blockers.push('pilot_program:verification_not_recent');
      requiredManualChecks.push('rerun_external_account_verification_within_24h');
    }
    if (input.publishIntent === 'pilot' && input.approvalRequired) {
      if (!input.approvalValid) {
        if (!input.approvalId) {
          blockers.push('pilot_approval:missing_valid_approval');
        } else if (input.approvalExpired) {
          blockers.push('pilot_approval:approval_expired');
        } else {
          blockers.push('pilot_approval:approval_not_valid');
        }
      }
    }
    if (input.publishIntent === 'pilot') {
      if (!input.categoryKeyResolved) {
        blockers.push('pilot_allowlist:category_unresolved');
      } else if (!input.categoryAllowlisted) {
        blockers.push(`pilot_allowlist:category_not_allowed:${input.categoryKeyResolved}`);
      }
      if (
        input.abortControlState === 'aborted' ||
        input.abortControlState === 'rollback_requested' ||
        input.abortControlState === 'rollback_completed'
      ) {
        blockers.push(`pilot_control:blocking_state:${input.abortControlState}`);
      }
    }
  }

  if (input.publishIntent === 'pilot') {
    const maxActive = Math.max(1, input.pilotMaxActivePublications);
    if (input.activeMercadoLibrePublications >= maxActive) {
      blockers.push(
        `pilot_blast_radius:max_active_publications_reached:${input.activeMercadoLibrePublications}/${maxActive}`
      );
    }
  }

  return {
    pilotAllowed: blockers.length === 0,
    pilotModeResolved: input.publishIntent,
    blockers,
    warnings,
    requiredManualChecks: Array.from(new Set(requiredManualChecks)),
    runbookHints,
    evidence: {
      publishIntent: input.publishIntent,
      requestedMode: input.requestedMode,
      programResolved: input.programVerification.programResolved,
      accountVerified: input.programVerification.verified,
      internationalReadinessAllowed: input.internationalReadiness.allowed,
      complianceStatus: input.internationalReadiness.complianceReadiness.status,
      returnsReady: input.internationalReadiness.returnsReadiness.ready,
      communicationReady: input.internationalReadiness.communicationReadiness.communicationReady,
      workersReady: input.workersReady,
      redisAvailable: input.redisAvailable,
      eventFlowReady: input.eventFlowReady,
      environmentResolved: input.environmentResolved,
      verificationFreshHours,
      approvalRequired: input.approvalRequired,
      approvalId: input.approvalId,
      approvalExpiresAt: input.approvalExpiresAt,
      categoryKeyResolved: input.categoryKeyResolved,
      categoryAllowlisted: input.categoryAllowlisted,
      categoryAllowlistNotes: input.categoryAllowlistNotes,
      abortControlState: input.abortControlState,
      securityFlags: {
        pilotModeEnabled: input.pilotModeEnabled,
        pilotRequireManualAck: input.pilotRequireManualAck,
        pilotManualAckProvided: input.pilotManualAckProvided,
        maxActivePilotPublications: input.pilotMaxActivePublications,
        activeMercadoLibrePublications: input.activeMercadoLibrePublications,
      },
    },
  };
}

function makeInternationalNextActions(blockers: string[]): string[] {
  const actions: string[] = [];
  for (const blocker of blockers) {
    if (blocker.startsWith('international_capability:')) {
      actions.push(
        'Configure ML channel capability to foreign_seller_enabled and enable international publishing for this account.'
      );
    } else if (blocker === 'international_config:return_address_not_configured') {
      actions.push(
        'Configure a return address (or explicit local returns policy) before enabling international publication.'
      );
    } else if (blocker === 'international_logistics:shipping_origin_country_missing') {
      actions.push(
        'Set shipping origin country in workflow config (mlShippingOriginCountry) for international mode.'
      );
    } else if (blocker === 'international_operations:publishing_queue_not_ready') {
      actions.push('Enable Redis/BullMQ publishing queue before international publication.');
    } else if (blocker === 'international_operations:webhook_queue_not_ready') {
      actions.push('Enable Redis/BullMQ webhook queue before international publication.');
    } else if (blocker === 'international_operations:event_flow_not_ready') {
      actions.push('Verify Mercado Libre webhook event flow (eventFlowReady=true) before international publication.');
    } else if (blocker === 'international_operations:unsafe_polling_forced') {
      actions.push('Disable ML_FORCE_ORDER_POLLING to avoid unsafe polling fallback in international mode.');
    } else if (blocker === 'international_compliance:review_required') {
      actions.push('Run manual compliance review for this SKU before international publication.');
    } else if (blocker === 'international_compliance:restricted_category') {
      actions.push('Keep this SKU local or remove restricted category signals before international publication.');
    } else if (blocker === 'international_compliance:homologation_required') {
      actions.push('Provide homologation/certification evidence before international publication.');
    } else if (blocker === 'international_compliance:missing_regulatory_data') {
      actions.push('Complete minimum regulatory data before international publication.');
    } else if (blocker === 'international_compliance:ip_risk') {
      actions.push('Resolve IP/brand authorization risk before international publication.');
    } else if (blocker === 'international_compliance:sensitive_claims') {
      actions.push('Remove sensitive claims or submit supporting compliance evidence.');
    } else if (blocker === 'international_compliance:unknown_category_risk') {
      actions.push('Define category risk classification before international publication.');
    } else if (blocker === 'international_returns:missing_return_address') {
      actions.push('Configure return address before international publication.');
    } else if (blocker === 'international_returns:missing_return_policy_config') {
      actions.push('Configure return policy readiness before international publication.');
    } else if (blocker === 'international_communication:missing_post_sale_contact') {
      actions.push('Configure post-sale contact channel before international publication.');
    } else if (blocker === 'international_communication:response_sla_not_enabled') {
      actions.push('Enable response SLA before international publication.');
    } else if (blocker === 'international_communication:alerts_not_configured') {
      actions.push('Configure post-sale alerts before international publication.');
    }
  }
  return Array.from(new Set(actions));
}

export function evaluateMercadoLibreInternationalReadiness(input: {
  requestedMode: MercadoLibrePublishMode;
  configuredChannelMode: string | null | undefined;
  foreignSellerEnabled: boolean;
  internationalPublishingEnabled: boolean;
  returnAddressConfigured: boolean;
  returnPolicyConfigured: boolean;
  postSaleContactConfigured: boolean;
  responseSlaEnabled: boolean;
  alertsConfigured: boolean;
  shippingOriginCountry: string | null;
  sellerOriginCountry: string | null;
  publishQueueRequired: boolean;
  publishQueueReady: boolean;
  webhookQueueRequired: boolean;
  webhookQueueReady: boolean;
  redisAvailable: boolean;
  eventFlowReady: boolean;
  operationMode: string;
  siteId: string;
  unsafePollingForced: boolean;
  categoryFingerprint: string;
  productData: unknown;
}): {
  modeResolved: MercadoLibrePublishMode;
  channelCapability: MercadoLibreChannelCapability;
  readiness: MercadoLibreInternationalReadinessPayload;
} {
  const channelMode = normalizeChannelMode(input.configuredChannelMode);
  const modeResolved = input.requestedMode;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const siteId = String(input.siteId || 'MLC').toUpperCase();
  const marketplaceSupportsInternational = siteId === 'MLC';
  const complianceReadiness = evaluateComplianceReadiness({
    categoryFingerprint: input.categoryFingerprint,
    productData: input.productData,
  });
  const returnsReadiness = evaluateReturnsReadiness({
    requestedMode: input.requestedMode,
    returnAddressConfigured: input.returnAddressConfigured,
    returnPolicyConfigured: input.returnPolicyConfigured,
    shippingOriginCountry: input.shippingOriginCountry,
    sellerOriginCountry: input.sellerOriginCountry,
  });
  const communicationReadiness = evaluateCommunicationReadiness({
    requestedMode: input.requestedMode,
    postSaleContactConfigured: input.postSaleContactConfigured,
    responseSlaEnabled: input.responseSlaEnabled,
    alertsConfigured: input.alertsConfigured,
  });

  let channelCapability: MercadoLibreChannelCapability = channelMode;
  if (channelMode === 'blocked') {
    channelCapability = 'blocked';
  } else if (
    channelMode === 'foreign_seller_enabled' ||
    (input.foreignSellerEnabled && input.internationalPublishingEnabled)
  ) {
    channelCapability = 'foreign_seller_enabled';
  } else if (
    channelMode === 'international_candidate' ||
    input.internationalPublishingEnabled
  ) {
    channelCapability = 'international_candidate';
  } else {
    channelCapability = 'local_only';
  }

  if (!marketplaceSupportsInternational) {
    blockers.push(`international_capability:site_not_supported:${siteId}`);
  }

  if (channelCapability === 'blocked') {
    blockers.push('international_capability:account_blocked');
  } else if (channelCapability === 'local_only') {
    blockers.push('international_capability:local_only_account');
  } else if (channelCapability === 'international_candidate') {
    blockers.push('international_capability:candidate_not_enabled');
  }

  if (!input.internationalPublishingEnabled) {
    blockers.push('international_capability:international_publishing_disabled');
  }
  if (!input.foreignSellerEnabled) {
    blockers.push('international_capability:foreign_seller_not_enabled');
  }
  if (!input.returnAddressConfigured) {
    blockers.push('international_config:return_address_not_configured');
  }
  if (!input.shippingOriginCountry) {
    blockers.push('international_logistics:shipping_origin_country_missing');
  }
  if (!input.sellerOriginCountry) {
    warnings.push('international_logistics:seller_origin_country_missing');
  }
  if (input.publishQueueRequired && !input.publishQueueReady) {
    blockers.push('international_operations:publishing_queue_not_ready');
  }
  if (input.webhookQueueRequired && !input.webhookQueueReady) {
    blockers.push('international_operations:webhook_queue_not_ready');
  }
  if (!input.eventFlowReady) {
    blockers.push('international_operations:event_flow_not_ready');
  }
  if (input.unsafePollingForced) {
    blockers.push('international_operations:unsafe_polling_forced');
  }

  if (input.requestedMode === 'international') {
    blockers.push(...complianceReadiness.blockers);
    blockers.push(...returnsReadiness.blockers);
    blockers.push(...communicationReadiness.blockers);
  }
  warnings.push(...complianceReadiness.warnings);
  warnings.push(...returnsReadiness.warnings);
  warnings.push(...communicationReadiness.warnings);

  const nextActions = Array.from(
    new Set([
      ...makeInternationalNextActions(blockers),
      ...complianceReadiness.nextActions,
      ...returnsReadiness.nextActions,
      ...communicationReadiness.nextActions,
    ])
  );

  const readiness: MercadoLibreInternationalReadinessPayload = {
    allowed: blockers.length === 0,
    blockers,
    warnings,
    complianceReadiness,
    returnsReadiness,
    communicationReadiness,
    evidence: {
      siteId,
      requestedMode: input.requestedMode,
      channelCapability,
      channelModeConfigured: String(input.configuredChannelMode || 'local_only'),
      foreignSellerEnabled: input.foreignSellerEnabled === true,
      internationalPublishingEnabled: input.internationalPublishingEnabled === true,
      returnAddressConfigured: input.returnAddressConfigured === true,
      shippingOriginCountry: input.shippingOriginCountry,
      sellerOriginCountry: input.sellerOriginCountry,
      queue: {
        publishQueueRequired: input.publishQueueRequired,
        publishQueueReady: input.publishQueueReady,
        webhookQueueRequired: input.webhookQueueRequired,
        webhookQueueReady: input.webhookQueueReady,
        redisAvailable: input.redisAvailable,
      },
      connector: {
        eventFlowReady: input.eventFlowReady,
        operationMode: input.operationMode,
      },
      categoryFingerprint: input.categoryFingerprint,
      shippingModeExpected: 'me2',
    },
    nextActions,
  };

  return {
    modeResolved,
    channelCapability,
    readiness,
  };
}

function toPrePublishShape(row: Record<string, unknown>): PrePublishProductShape {
  return {
    id: Number(row.id),
    title: (row.title as string) || undefined,
    category: (row.category as string) || undefined,
    images: row.images,
    productData: row.productData,
    aliexpressUrl: String(row.aliexpressUrl || ''),
    aliexpressSku: (row.aliexpressSku as string) || null,
    aliexpressPrice: row.aliexpressPrice,
    importTax: row.importTax,
    currency: (row.currency as string) || null,
    targetCountry: (row.targetCountry as string) || null,
    originCountry: (row.originCountry as string) || null,
    shippingCost: row.shippingCost,
  };
}

export function resolveMercadoLibrePreflightOverallState(checks: {
  productStatusOk: boolean;
  hasAliUrl: boolean;
  packageOk: boolean;
  credentialsOk: boolean;
  mlApiOk: boolean;
  languageOk: boolean;
  imagesOk: boolean;
  pricingOk: boolean;
  postsaleOk: boolean;
}): PublishPreflightOverallState {
  if (!checks.productStatusOk) return 'blocked_product_status';
  if (!checks.hasAliUrl) return 'blocked_missing_source_data';
  if (!checks.packageOk) return 'blocked_physical_package';
  if (!checks.credentialsOk) return 'blocked_credentials';
  if (!checks.mlApiOk) return 'blocked_marketplace_connection';
  if (!checks.languageOk) return 'blocked_language';
  if (!checks.imagesOk) return 'blocked_images';
  if (!checks.pricingOk) return 'blocked_pricing';
  if (!checks.postsaleOk) return 'blocked_postsale_readiness';
  return 'ready_to_publish';
}

/**
 * Derives a canary score from the same truthful preflight payload shown in the admin UI.
 * Not a substitute for gates: `publishAllowed` still controls actual publish.
 */
export function computeMercadoLibreCanaryAssessment(
  p: Omit<MercadoLibrePublishPreflightPayload, 'canary'>
): MercadoLibreCanaryAssessment {
  const reasons: string[] = [];
  let score = 0;

  if (p.publishAllowed) {
    score += 42;
    reasons.push('all_preflight_gates_pass');
  } else {
    reasons.push(`blocked_state:${p.overallState}`);
  }

  if (p.images.publishSafe) {
    score += 22;
    reasons.push('images_publish_safe');
  } else {
    reasons.push('images_not_publish_safe');
  }

  if (p.canonicalPricing.ok === true) {
    score += 16;
    const net = p.canonicalPricing.profitabilityUsd?.netProfitUsd;
    if (typeof net === 'number' && net > 0) {
      score += 4;
      reasons.push('positive_net_profit_usd');
    } else {
      reasons.push('pricing_ok_but_non_positive_net_profit');
    }
  } else {
    reasons.push('canonical_pricing_not_ok');
  }

  if (p.postsale.mercadolibreWebhookConfigured) {
    score += 8;
    reasons.push('ml_webhook_secret_configured');
  } else {
    reasons.push('ml_webhook_secret_missing_or_not_required');
  }

  if (p.postsale.mercadolibreConnectorAutomationReady) {
    score += 5;
    reasons.push('ml_connector_automation_ready');
  } else {
    reasons.push('ml_connector_automation_not_ready');
  }

  if (p.postsale.mercadolibreEventFlowReady) {
    score += 3;
    reasons.push('ml_event_flow_verified');
  } else {
    reasons.push('ml_event_flow_not_verified');
  }

  if (p.warnings.length > 2) {
    score -= 6;
    reasons.push('multiple_preflight_warnings');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let tier: MercadoLibreCanaryTier = 'blocked';
  if (!p.publishAllowed) {
    tier = 'blocked';
  } else if (
    score >= 88 &&
    p.images.publishSafe &&
    p.canonicalPricing.ok === true &&
    p.postsale.mercadolibreWebhookConfigured &&
    (p.canonicalPricing.profitabilityUsd?.netProfitUsd ?? 0) > 0
  ) {
    tier = 'recommended';
  } else if (score >= 62) {
    tier = 'acceptable';
  } else {
    tier = 'risky';
  }

  return { tier, score, reasons };
}

export async function buildMercadoLibreProgramVerification(params: {
  userId: number;
  environment?: 'sandbox' | 'production';
  requestedMode?: MercadoLibrePublishMode | string;
}): Promise<MercadoLibreProgramVerificationPayload> {
  const marketplaceService = new MarketplaceService();
  const { workflowConfigService } = await import('./workflow-config.service');
  const requestedMode = toMercadoLibrePublishMode(params.requestedMode);
  const environment =
    params.environment || (await workflowConfigService.getUserEnvironment(params.userId));
  const channelConfig = await workflowConfigService.getMercadoLibreChannelConfig(params.userId);

  const credentials = await marketplaceService.getCredentials(
    params.userId,
    'mercadolibre',
    environment
  );
  const credentialsOk = Boolean(credentials?.isActive && !credentials?.issues?.length);

  let externalProfile:
    | {
        id?: string | number;
        nickname?: string;
        site_id?: string;
        seller_experience?: string;
        tags?: unknown;
        status?: unknown;
      }
    | null = null;
  let externalVerificationOk = false;
  let externalVerificationError: string | null = null;
  if (credentials?.credentials) {
    try {
      const { MercadoLibreService } = await import('./mercadolibre.service');
      const mlService = new MercadoLibreService(
        credentials.credentials as {
          clientId: string;
          clientSecret: string;
          accessToken?: string;
          refreshToken?: string;
          userId?: string;
          siteId: string;
        }
      );
      externalProfile = await mlService.getAuthenticatedUserProfile();
      externalVerificationOk = true;
    } catch (error) {
      externalVerificationError = error instanceof Error ? error.message : String(error);
      externalVerificationOk = false;
    }
  }

  const resolvedSiteId = normalizeSiteId(
    ((credentials?.credentials as Record<string, unknown> | undefined)?.siteId as string | undefined) ||
      process.env.MERCADOLIBRE_SITE_ID ||
      'MLC'
  );

  return evaluateMercadoLibreProgramVerification({
    requestedMode,
    configuredChannelMode: channelConfig.channelMode,
    foreignSellerEnabled: channelConfig.foreignSellerEnabled,
    internationalPublishingEnabled: channelConfig.internationalPublishingEnabled,
    manualProgramVerificationOverride: channelConfig.programVerificationManualOverride,
    credentialsPresent: Boolean(credentials),
    credentialsActive: credentialsOk,
    credentialsScope: credentials?.scope || null,
    credentialsSiteId: resolvedSiteId,
    environmentResolved: environment,
    externalVerificationOk,
    externalVerificationError,
    profile: externalProfile,
  });
}

export async function buildMercadoLibrePublishPreflight(params: {
  userId: number;
  productId: number;
  isAdmin: boolean;
  environment?: 'sandbox' | 'production';
  requestedMode?: MercadoLibrePublishMode | string;
  publishIntent?: MercadoLibrePublishIntent | string;
  pilotManualAck?: boolean;
}): Promise<MercadoLibrePublishPreflightPayload> {
  const { userId, productId, isAdmin } = params;
  const marketplaceService = new MarketplaceService();

  const row = await productService.getProductById(productId, userId, isAdmin);
  const product = toPrePublishShape(row as Record<string, unknown>);
  const requestedMode = toMercadoLibrePublishMode(params.requestedMode);
  const publishIntent = toMercadoLibrePublishIntent(params.publishIntent);

  const blockers: string[] = [];
  const warnings: string[] = [];

  const statusOk = row.status === 'VALIDATED_READY';
  if (!statusOk) {
    blockers.push(`product_status:${String(row.status)} (required VALIDATED_READY)`);
  }

  const hasAliUrl = Boolean(product.aliexpressUrl && product.aliexpressUrl.startsWith('http'));
  if (!hasAliUrl) {
    blockers.push('missing_aliexpress_url');
  }

  const physicalPackageBlockers = getMlPhysicalPackageBlockers({
    packageWeightGrams: (row as { packageWeightGrams?: number | null }).packageWeightGrams,
    packageLengthCm: (row as { packageLengthCm?: number | null }).packageLengthCm,
    packageWidthCm: (row as { packageWidthCm?: number | null }).packageWidthCm,
    packageHeightCm: (row as { packageHeightCm?: number | null }).packageHeightCm,
    maxUnitsPerOrder: (row as { maxUnitsPerOrder?: number | null }).maxUnitsPerOrder,
  });
  const packageOk = physicalPackageBlockers.length === 0;
  if (!packageOk) {
    for (const p of physicalPackageBlockers) {
      blockers.push(`physical_package:${p}`);
    }
  }

  const { workflowConfigService } = await import('./workflow-config.service');

  let userEnvironment: 'sandbox' | 'production' = 'production';
  if (params.environment) {
    userEnvironment = params.environment;
  } else {
    userEnvironment = await workflowConfigService.getUserEnvironment(userId);
  }
  const channelConfig = await workflowConfigService.getMercadoLibreChannelConfig(userId);

  const credentials = await marketplaceService.getCredentials(userId, 'mercadolibre', userEnvironment);
  const credentialsOk = Boolean(credentials?.isActive && !credentials?.issues?.length);
  if (!credentials) {
    blockers.push('mercadolibre_credentials_missing');
  } else if (!credentials.isActive) {
    blockers.push('mercadolibre_credentials_inactive');
  } else if (credentials.issues?.length) {
    blockers.push(...credentials.issues.map((i) => `credential_issue:${i}`));
  }

  let mlApiOk = false;
  let mlTestConnectionMessage: string | undefined;
  try {
    const tc = await marketplaceService.testConnection(userId, 'mercadolibre', userEnvironment);
    mlApiOk = tc.success;
    mlTestConnectionMessage = tc.message;
  } catch (e) {
    mlApiOk = false;
    mlTestConnectionMessage = e instanceof Error ? e.message : String(e);
  }
  if (!mlApiOk && credentialsOk) {
    blockers.push('mercadolibre_test_connection_failed');
  }

  let externalProfile:
    | {
        id?: string | number;
        nickname?: string;
        site_id?: string;
        seller_experience?: string;
        tags?: unknown;
        status?: unknown;
      }
    | null = null;
  let externalVerificationOk = false;
  let externalVerificationError: string | null = null;
  if (credentials?.credentials) {
    try {
      const { MercadoLibreService } = await import('./mercadolibre.service');
      const mlService = new MercadoLibreService(
        credentials.credentials as {
          clientId: string;
          clientSecret: string;
          accessToken?: string;
          refreshToken?: string;
          userId?: string;
          siteId: string;
        }
      );
      externalProfile = await mlService.getAuthenticatedUserProfile();
      externalVerificationOk = true;
    } catch (error) {
      externalVerificationError = error instanceof Error ? error.message : String(error);
      externalVerificationOk = false;
    }
  }

  const listingSalePriceUsd = marketplaceService.getEffectiveListingPrice(row, undefined);

  const ctx = getMarketplaceContext('mercadolibre', credentials?.credentials as Record<string, unknown>);
  const languageOk = ctx.languageSupported === true;
  if (!languageOk) {
    blockers.push(`language:${ctx.languageBlockReason || 'unsupported_or_unresolved'}`);
  }

  const imageResolution = await resolveMercadoLibrePublishImageInputs({
    userId,
    productId,
    title: product.title || '',
    images: product.images,
    productData: product.productData,
  });
  const requiredAssetRows = imageResolution.remediation.assetPack.assets
    .filter((a) => a.assetKey === 'cover_main' || a.assetKey === 'detail_mount_interface')
    .map((a) => ({
      assetKey: a.assetKey,
      approvalState: a.approvalState,
      exists: a.exists,
      localPath: a.localPath,
      min1200: a.min1200,
      squareLike: a.squareLike,
      notes: a.notes,
    }));
  const imagesOk = imageResolution.publishSafe === true;
  if (!imagesOk) {
    blockers.push(`images:${imageResolution.blockingReason || 'not_publish_safe'}`);
  }

  const assertParams = {
    userId,
    product,
    marketplace: 'mercadolibre' as const,
    credentials: credentials?.credentials as Record<string, unknown> | undefined,
    listingSalePrice: listingSalePriceUsd,
  };

  const econCore =
    statusOk && hasAliUrl && credentialsOk && listingSalePriceUsd > 0
      ? await runPreventiveEconomicsCore(assertParams)
      : ({
          ok: false as const,
          message:
            listingSalePriceUsd <= 0
              ? 'listing sale price is missing or invalid'
              : !hasAliUrl
                ? 'missing AliExpress URL'
                : !credentialsOk
                  ? 'mercadolibre credentials not ready'
                  : 'product not in VALIDATED_READY',
        });
  const pricingOk = econCore.ok === true;
  if (econCore.ok === false) {
    blockers.push(`pricing:${econCore.message}`);
  }

  const canonicalPricing = mlcCanonicalPricingFromEconomicsCore(listingSalePriceUsd, econCore);

  const connectorSummary = await getConnectorReadinessForUser(userId);
  const mlConn = connectorSummary.connectors.mercadolibre;
  const wh = getWebhookStatus().mercadolibre;
  const webhookConfigured = wh.configured === true;
  const siteId = String(
    ((credentials?.credentials as Record<string, unknown> | undefined)?.siteId as string | undefined) ||
      process.env.MERCADOLIBRE_SITE_ID ||
      'MLC'
  ).toUpperCase();

  const strictPostsale = env.ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET === true;
  const postsaleOk =
    hasAliUrl &&
    (!strictPostsale || webhookConfigured);

  if (strictPostsale && !webhookConfigured) {
    blockers.push('postsale:WEBHOOK_SECRET_MERCADOLIBRE_not_configured');
  }

  if (!mlConn.eventFlowReady) {
    warnings.push(
      'mercadolibre_webhook_event_flow_not_verified: order automation may require manual reconciliation until an inbound webhook event is proven'
    );
  }
  if (!mlConn.automationReady) {
    warnings.push(`mercadolibre_connector:${mlConn.operationMode} — ${mlConn.issues.join('; ') || 'see connector readiness'}`);
  }

  const publishQueueRequired = mercadoLibrePublishRequiresRedisQueue();
  const webhookQueueRequired = mercadoLibreWebhookRequiresBullmq();
  let publishQueueReady = true;
  let webhookQueueReady = true;
  if (publishQueueRequired || webhookQueueRequired) {
    const { publishingQueue, mlWebhookQueue } = await import('./job.service');
    publishQueueReady = Boolean(isRedisAvailable && publishingQueue);
    webhookQueueReady = Boolean(isRedisAvailable && mlWebhookQueue);
  }

  const categoryFingerprint = [row.category, row.title].filter(Boolean).join(' | ');
  const unsafePollingForced = String(process.env.ML_FORCE_ORDER_POLLING || '').toLowerCase() === 'true';
  const international = evaluateMercadoLibreInternationalReadiness({
    requestedMode,
    configuredChannelMode: channelConfig.channelMode,
    foreignSellerEnabled: channelConfig.foreignSellerEnabled,
    internationalPublishingEnabled: channelConfig.internationalPublishingEnabled,
    returnAddressConfigured: channelConfig.returnAddressConfigured,
    returnPolicyConfigured: channelConfig.returnPolicyConfigured,
    postSaleContactConfigured: channelConfig.postSaleContactConfigured,
    responseSlaEnabled: channelConfig.responseSlaEnabled,
    alertsConfigured: channelConfig.alertsConfigured,
    shippingOriginCountry: channelConfig.shippingOriginCountry || product.originCountry || null,
    sellerOriginCountry: channelConfig.sellerOriginCountry || product.originCountry || null,
    publishQueueRequired,
    publishQueueReady,
    webhookQueueRequired,
    webhookQueueReady,
    redisAvailable: isRedisAvailable,
    eventFlowReady: connectorSummary.webhookStatus.mercadolibre.eventFlowReady === true,
    operationMode: mlConn.operationMode,
    siteId,
    unsafePollingForced,
    categoryFingerprint,
    productData: row.productData,
  });

  const programVerification = evaluateMercadoLibreProgramVerification({
    requestedMode,
    configuredChannelMode: channelConfig.channelMode,
    foreignSellerEnabled: channelConfig.foreignSellerEnabled,
    internationalPublishingEnabled: channelConfig.internationalPublishingEnabled,
    manualProgramVerificationOverride: channelConfig.programVerificationManualOverride,
    credentialsPresent: Boolean(credentials),
    credentialsActive: credentialsOk,
    credentialsScope: credentials?.scope || null,
    credentialsSiteId: siteId,
    environmentResolved: userEnvironment,
    externalVerificationOk,
    externalVerificationError,
    profile: externalProfile,
  });

  const approvalRequired = publishIntent === 'pilot' && requestedMode === 'international';
  const pilotCategoryKey = resolvePilotCategoryKey({
    row: row as unknown as Record<string, unknown>,
    productData: row.productData,
  });
  const latestPilotApprovals = await mlPilotOpsService.listPilotApprovals({
    userId,
    productId,
    marketplace: 'mercadolibre',
    limit: 1,
  });
  const latestPilotApproval = latestPilotApprovals[0] || null;
  const validPilotApproval =
    requestedMode === 'international'
      ? await mlPilotOpsService.findValidPilotApproval({
          userId,
          productId,
          marketplace: 'mercadolibre',
          requestedMode: 'international',
        })
      : null;
  const allowlistResult =
    requestedMode === 'international' && pilotCategoryKey
      ? await mlPilotOpsService.isPilotCategoryAllowlisted({
          marketplace: 'mercadolibre',
          siteId,
          categoryKey: pilotCategoryKey,
        })
      : { allowed: requestedMode !== 'international', entry: null as any };
  const pilotControlState = await mlPilotOpsService.getPilotControlState({
    userId,
    productId,
    marketplace: 'mercadolibre',
  });
  const approvalAnchor = validPilotApproval || latestPilotApproval;
  const approvalExpired =
    !validPilotApproval &&
    Boolean(approvalAnchor) &&
    (approvalAnchor.decision === 'expired' ||
      (approvalAnchor.expiresAt instanceof Date && approvalAnchor.expiresAt.getTime() <= Date.now()));

  let activeMercadoLibrePublications = 0;
  try {
    const { prisma } = await import('../config/database');
    activeMercadoLibrePublications = await prisma.marketplaceListing.count({
      where: {
        userId,
        marketplace: 'mercadolibre',
        status: 'active',
      },
    });
  } catch {
    activeMercadoLibrePublications = 0;
  }

  const pilotReadiness = evaluateMercadoLibrePilotReadiness({
    publishIntent,
    requestedMode,
    programVerification,
    internationalReadiness: international.readiness,
    approvalRequired,
    approvalId: approvalAnchor?.id || null,
    approvalExpiresAt:
      approvalAnchor?.expiresAt instanceof Date ? approvalAnchor.expiresAt.toISOString() : null,
    approvalValid: Boolean(validPilotApproval),
    approvalExpired,
    categoryKeyResolved: pilotCategoryKey,
    categoryAllowlisted: allowlistResult.allowed === true,
    categoryAllowlistNotes: allowlistResult.entry?.notes || null,
    abortControlState: pilotControlState?.state || 'ready',
    pilotModeEnabled: channelConfig.pilotModeEnabled,
    pilotRequireManualAck: channelConfig.pilotRequireManualAck,
    pilotManualAckProvided: params.pilotManualAck === true,
    pilotMaxActivePublications: channelConfig.pilotMaxActivePublications,
    activeMercadoLibrePublications,
    workersReady: publishQueueReady && webhookQueueReady,
    redisAvailable: isRedisAvailable,
    eventFlowReady: connectorSummary.webhookStatus.mercadolibre.eventFlowReady === true,
    environmentResolved: userEnvironment,
  });

  const baseOverallState = resolveMercadoLibrePreflightOverallState({
    productStatusOk: statusOk,
    hasAliUrl,
    packageOk,
    credentialsOk,
    mlApiOk,
    languageOk,
    imagesOk,
    pricingOk,
    postsaleOk,
  });

  let overallState = baseOverallState;
  if (
    requestedMode === 'international' &&
    overallState === 'ready_to_publish' &&
    !international.readiness.allowed
  ) {
    overallState = 'blocked_international_capability';
  }
  if (
    publishIntent === 'pilot' &&
    overallState === 'ready_to_publish' &&
    !pilotReadiness.pilotAllowed
  ) {
    overallState = 'blocked_pilot_readiness';
  }
  if (
    publishIntent === 'production' &&
    requestedMode === 'international' &&
    overallState === 'ready_to_publish' &&
    programVerification.programResolved !== 'foreign_seller_verified'
  ) {
    overallState = 'blocked_pilot_readiness';
  }

  if (requestedMode === 'international') {
    for (const blocker of international.readiness.blockers) {
      blockers.push(blocker);
    }
    for (const warning of international.readiness.warnings) {
      warnings.push(warning);
    }
  } else if (!international.readiness.allowed) {
    warnings.push(
      `international_readiness_not_met:${international.readiness.blockers.join('; ') || 'unknown'}`
    );
  }

  if (requestedMode === 'international' || publishIntent === 'pilot') {
    for (const blocker of programVerification.blockers) {
      blockers.push(blocker);
    }
  } else if (programVerification.blockers.length > 0) {
    warnings.push(
      `program_verification_not_enforced_for_local:${programVerification.blockers.join('; ')}`
    );
  }
  for (const warning of programVerification.warnings) {
    warnings.push(warning);
  }
  if (publishIntent === 'pilot') {
    for (const blocker of pilotReadiness.blockers) {
      blockers.push(blocker);
    }
    for (const warning of pilotReadiness.warnings) {
      warnings.push(warning);
    }
  }
  if (
    publishIntent === 'production' &&
    requestedMode === 'international' &&
    programVerification.programResolved !== 'foreign_seller_verified'
  ) {
    blockers.push(
      `program_verification:production_requires_foreign_seller_verified:${programVerification.programResolved}`
    );
  }

  const publishAllowed =
    publishIntent === 'dry_run'
      ? false
      : publishIntent === 'pilot'
        ? overallState === 'ready_to_publish' && pilotReadiness.pilotAllowed
        : requestedMode === 'international'
          ? overallState === 'ready_to_publish' &&
            programVerification.programResolved === 'foreign_seller_verified'
          : overallState === 'ready_to_publish';

  let nextAction = 'Use Intelligent Publisher approve flow or POST /api/marketplace/publish when all checks pass.';
  if (publishIntent === 'dry_run') {
    nextAction = 'Dry run completed. No publication was executed.';
  }
  if (!statusOk) nextAction = 'Move product to VALIDATED_READY in the preventive validation workflow.';
  else if (!hasAliUrl) nextAction = 'Attach a valid AliExpress supplier URL.';
  else if (!packageOk)
    nextAction = `Set real package fields on the product (weight grams, L/W/H cm, max units per order): ${physicalPackageBlockers.join('; ')}`;
  else if (!credentialsOk) nextAction = 'Configure Mercado Libre OAuth credentials in API settings.';
  else if (!mlApiOk) nextAction = 'Refresh Mercado Libre token or fix API credentials; test connection from settings.';
  else if (!languageOk) nextAction = 'Fix listing language / site (MLC requires Spanish listing context for CL).';
  else if (!imagesOk) nextAction = 'Complete ML image remediation until publishSafe is true.';
  else if (!pricingOk)
    nextAction = `Fix pricing or economics: ${econCore.ok === false ? econCore.message : ''}`;
  else if (publishIntent === 'pilot' && !pilotReadiness.pilotAllowed)
    nextAction =
      pilotReadiness.requiredManualChecks[0] ||
      pilotReadiness.blockers[0] ||
      'Pilot mode is blocked by readiness or blast-radius controls.';
  else if (
    publishIntent === 'production' &&
    requestedMode === 'international' &&
    programVerification.programResolved !== 'foreign_seller_verified'
  )
    nextAction =
      'Production international publish requires externally verified foreign_seller capability. Run pilot/dry-run and complete verification evidence first.';
  else if (requestedMode === 'international' && !international.readiness.allowed)
    nextAction =
      international.readiness.nextActions[0] ||
      'International publish mode is blocked by channel capability/readiness requirements.';
  else if (!postsaleOk) nextAction = 'Set WEBHOOK_SECRET_MERCADOLIBRE (or disable ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET for non-production tests).';

  const verificationNotes = [
    `webhook_secret_configured:${webhookConfigured}`,
    `webhook_proof_level:${connectorSummary.webhookStatus.mercadolibre.proofLevel ?? 'unknown'}`,
    `event_flow_ready:${connectorSummary.webhookStatus.mercadolibre.eventFlowReady === true}`,
    `inbound_event_seen:${connectorSummary.webhookStatus.mercadolibre.inboundEventSeen === true}`,
    'fulfill_path: auto_purchase_and_supplier_order require AliExpress dropshipping credentials and runtime order ingestion (verify separately).',
  ];

  if (publishIntent === 'pilot' || publishIntent === 'dry_run') {
    try {
      await mlPilotOpsService.appendPilotDecisionLedger({
        userId,
        productId,
        marketplace: 'mercadolibre',
        publishIntent,
        requestedMode,
        modeResolved: international.modeResolved,
        result:
          publishIntent === 'dry_run'
            ? 'assessment_only'
            : publishAllowed
              ? 'assessment_only'
              : 'blocked',
        approvalId: pilotReadiness.evidence.approvalId,
        blockers,
        warnings,
        programVerificationSnapshot: programVerification as unknown as Record<string, unknown>,
        pilotReadinessSnapshot: pilotReadiness as unknown as Record<string, unknown>,
        evidenceSnapshot: {
          overallState,
          channelCapability: international.channelCapability,
          categoryKeyResolved: pilotCategoryKey,
          categoryAllowlisted: allowlistResult.allowed === true,
          abortControlState: pilotControlState?.state || 'ready',
          nextAction,
        },
        reason:
          publishIntent === 'dry_run'
            ? 'dry_run_assessment'
            : publishAllowed
              ? 'pilot_assessment_allowed'
              : 'pilot_assessment_blocked',
      });
    } catch {
      warnings.push('pilot_ledger:write_failed');
    }
  }

  const dedupedBlockers = Array.from(new Set(blockers));
  const dedupedWarnings = Array.from(new Set(warnings));

  const base: Omit<MercadoLibrePublishPreflightPayload, 'canary'> = {
    schemaVersion: 1,
    marketplace: 'mercadolibre',
    productId,
    publishIntent,
    requestedMode,
    modeResolved: international.modeResolved,
    channelCapability: international.channelCapability,
    overallState,
    publishAllowed,
    programVerification,
    pilotReadiness,
    internationalReadiness: international.readiness,
    complianceReadiness: international.readiness.complianceReadiness,
    returnsReadiness: international.readiness.returnsReadiness,
    communicationReadiness: international.readiness.communicationReadiness,
    nextAction,
    blockers: dedupedBlockers,
    warnings: dedupedWarnings,
    productStatus: row.status as string,
    listingSalePriceUsd,
    canonicalPricing,
    images: {
      publishSafe: imageResolution.publishSafe,
      blockingReason: imageResolution.blockingReason ?? null,
      imageCount: imageResolution.images?.length ?? 0,
      packApproved: imageResolution.remediation.assetPack.packApproved,
      requiredAssets: requiredAssetRows,
    },
    language: {
      supported: languageOk,
      country: ctx.country,
      resolvedLanguage: String(ctx.destination.language || '').toLowerCase(),
      requiredLanguage: ctx.requiredLanguage,
      reason: ctx.languageBlockReason,
    },
    credentials: {
      present: Boolean(credentials),
      active: Boolean(credentials?.isActive),
      issues: credentials?.issues ?? [],
    },
    mercadoLibreApi: {
      testConnectionOk: mlApiOk,
      testConnectionMessage: mlTestConnectionMessage,
      credentialEnvironment: userEnvironment,
    },
    postsale: {
      mercadolibreWebhookConfigured: webhookConfigured,
      mercadolibreEventFlowReady: connectorSummary.webhookStatus.mercadolibre.eventFlowReady === true,
      mercadolibreConnectorAutomationReady: mlConn.automationReady,
      mercadolibreOperationMode: mlConn.operationMode,
      fulfillPrerequisiteAliExpressUrl: hasAliUrl,
      verificationNotes,
    },
  };

  return {
    ...base,
    canary: computeMercadoLibreCanaryAssessment(base),
  };
}
