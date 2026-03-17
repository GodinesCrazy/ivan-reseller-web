/**
 * Phase 26: Full Listing Recovery + Multi-Marketplace Lifecycle Control
 * Types for audit, classification, and recovery.
 */

export const LISTING_CLASSIFICATION = [
  'GOOD',
  'NEEDS_OPTIMIZATION',
  'BROKEN',
  'REJECTED',
  'INACTIVE',
  'LOW_PERFORMANCE',
  'NOT_EXISTING',
] as const;

export type ListingClassification = (typeof LISTING_CLASSIFICATION)[number];

/** Lifecycle states for Task 12 */
export const LISTING_LIFECYCLE_STAGES = [
  'CREATE',
  'VALIDATE',
  'PUBLISH',
  'SYNC',
  'MONITOR',
  'OPTIMIZE',
  'SCALE',
  'REMOVE',
] as const;

export type ListingLifecycleStage = (typeof LISTING_LIFECYCLE_STAGES)[number];

export interface ListingAuditRecord {
  /** Internal MarketplaceListing.id */
  listingDbId: number;
  productId: number;
  userId: number;
  marketplace: string;
  /** Marketplace item id (e.g. ML item id, eBay item id) */
  listingId: string;
  /** Current status in DB: active | paused | failed_publish | not_found */
  status: string;
  /** From reconciliation: ACTIVE | PAUSED | NOT_FOUND | ERROR */
  reconciliationResult?: string;
  /** Aggregated from ListingMetric (real API data) */
  impressions: number;
  clicks: number;
  sales: number;
  /** Last N days used for aggregation */
  metricsDays: number;
  /** Recent publish errors (policy, validation, api, rate_limit) */
  recentErrors: Array<{ errorType: string; errorMessage?: string; createdAt: string }>;
  /** Pending audit/repair actions (not executed) */
  pendingAuditActions: number;
  /** Policy / compliance issues detected */
  policyIssues: string[];
  /** Missing required attributes for marketplace */
  missingAttributes: string[];
  /** Category correctness: ok | mismatch | missing */
  categoryCorrectness: 'ok' | 'mismatch' | 'missing';
  /** Has required images/videos per marketplace */
  hasRequiredMedia: boolean;
  /** Last time reconciled with marketplace API */
  lastReconciledAt: Date | null;
  /** Suggested classification after running ClassificationEngine */
  classification?: ListingClassification;
}

export interface ClassificationInput {
  record: ListingAuditRecord;
  /** Min impressions to consider "has traffic" */
  minImpressionsThreshold?: number;
  /** Min sales to consider "performing" */
  minSalesThreshold?: number;
  /** Days with zero impressions to mark LOW_PERFORMANCE */
  zeroImpressionsDaysThreshold?: number;
}

export interface RecoveryAction {
  listingDbId: number;
  listingId: string;
  marketplace: string;
  userId: number;
  productId: number;
  classification: ListingClassification;
  /** Action to take: optimize | fix_republish | reactivate | retry_rejected | remove | remove_from_db */
  action: 'optimize' | 'fix_republish' | 'reactivate' | 'retry_rejected' | 'remove' | 'remove_from_db';
  reason: string;
}
