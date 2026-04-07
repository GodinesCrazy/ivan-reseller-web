export type MlPublishMode = 'local' | 'international';
export type MlPublishIntent = 'dry_run' | 'pilot' | 'production';
export type MlChannelCapability =
  | 'local_only'
  | 'international_candidate'
  | 'foreign_seller_enabled'
  | 'blocked';

export interface MlProgramVerificationPayload {
  verified: boolean;
  accountVerificationStatus: 'verified' | 'manual_confirmation_required' | 'not_verified';
  programResolved:
    | 'local'
    | 'international_candidate'
    | 'foreign_seller_verified'
    | 'unknown'
    | 'blocked';
  verifiedProgram: string;
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

export interface MlPilotReadinessPayload {
  pilotAllowed: boolean;
  pilotModeResolved: MlPublishIntent;
  blockers: string[];
  warnings: string[];
  requiredManualChecks: string[];
  runbookHints: string[];
  evidence: {
    publishIntent: MlPublishIntent;
    requestedMode: MlPublishMode;
    programResolved: string;
    accountVerified: boolean;
    internationalReadinessAllowed: boolean;
    complianceStatus: 'pass' | 'review_required' | 'blocked';
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

export interface MlComplianceReadinessPayload {
  status: 'pass' | 'review_required' | 'blocked';
  reasons: string[];
  blockers: string[];
  warnings: string[];
  evidence: {
    categoryFingerprint: string;
    hasRegulatoryData: boolean;
    matchedSignals: string[];
  };
  nextActions: string[];
}

export interface MlReturnsReadinessPayload {
  status:
    | 'ready'
    | 'missing_return_address'
    | 'missing_return_policy_config'
    | 'not_required_for_local'
    | 'review_required';
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

export interface MlCommunicationReadinessPayload {
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

export interface MlInternationalReadinessPayload {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
  complianceReadiness: MlComplianceReadinessPayload;
  returnsReadiness: MlReturnsReadinessPayload;
  communicationReadiness: MlCommunicationReadinessPayload;
  evidence: Record<string, unknown>;
  nextActions: string[];
}

export interface MlPublishPreflightPayload {
  schemaVersion: 1;
  marketplace: 'mercadolibre';
  productId: number;
  publishIntent: MlPublishIntent;
  requestedMode: MlPublishMode;
  modeResolved: MlPublishMode;
  channelCapability: MlChannelCapability;
  overallState: string;
  publishAllowed: boolean;
  programVerification: MlProgramVerificationPayload;
  pilotReadiness: MlPilotReadinessPayload;
  internationalReadiness: MlInternationalReadinessPayload;
  complianceReadiness: MlComplianceReadinessPayload;
  returnsReadiness: MlReturnsReadinessPayload;
  communicationReadiness: MlCommunicationReadinessPayload;
  canary?: { tier?: string; score?: number; reasons?: string[] };
  nextAction: string;
  blockers: string[];
  warnings: string[];
  listingSalePriceUsd?: number;
  canonicalPricing?: { ok?: boolean; failureReasons?: string[] };
  images?: { publishSafe?: boolean; blockingReason?: string | null; imageCount?: number };
  postsale?: { mercadolibreWebhookConfigured?: boolean; mercadolibreEventFlowReady?: boolean };
}

export interface MlPilotApproval {
  id: string;
  productId: number;
  requestedMode: string;
  decision: 'approved' | 'rejected' | 'expired' | 'consumed';
  approvedBy: string;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
  consumedAt: string | null;
  evidenceSnapshot: Record<string, unknown> | null;
}

export interface MlPilotLedgerRow {
  id: string;
  productId: number;
  publishIntent: string;
  requestedMode: string;
  modeResolved: string;
  result: string;
  approvalId: string | null;
  blockers: string[];
  warnings: string[];
  programVerificationSnapshot: Record<string, unknown> | null;
  pilotReadinessSnapshot: Record<string, unknown> | null;
  evidenceSnapshot: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

export interface MlPilotControlState {
  userId: number;
  productId: number;
  marketplace: 'mercadolibre';
  state: 'ready' | 'aborted' | 'rollback_requested' | 'rollback_completed';
  reason: string | null;
  updatedAt?: string;
}

export interface MlPilotPostPublishStatus {
  pilotPostPublishChecklistGenerated: boolean;
  listingObserved: boolean;
  firstSyncCompleted: boolean;
  postPublishMonitoringRequired: boolean;
  abortRecommended: boolean;
  blockers: string[];
  warnings: string[];
  evidence: Record<string, unknown>;
  nextActions: string[];
}
