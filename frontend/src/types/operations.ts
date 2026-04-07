export interface OperationsTruthAgentTrace {
  agentName: string;
  stage: string;
  decision: string;
  reasonCode: string;
  evidenceSummary: string[];
  blocking: boolean;
  advisory: boolean;
  nextAction: string | null;
  decidedAt: string | null;
}

export interface OperationsTruthItem {
  productId: number;
  productTitle: string;
  marketplace: string | null;
  listingId: string | null;
  localListingState: string | null;
  externalMarketplaceState: string | null;
  externalMarketplaceSubStatus: string[];
  listingUrl: string | null;
  lastMarketplaceSyncAt: string | null;
  imageRemediationState: string | null;
  publicationReadinessState: string | null;
  blockerCode: string | null;
  blockerMessage: string | null;
  nextAction: string | null;
  orderIngested: boolean;
  supplierPurchaseProved: boolean;
  trackingAttached: boolean;
  deliveredTruthObtained: boolean;
  releasedFundsObtained: boolean;
  realizedProfitObtained: boolean;
  proofUpdatedAt: string | null;
  lastAgentDecision: string | null;
  lastAgentDecisionReason: string | null;
  decidedAt: string | null;
  sourceLabels: {
    listing: string;
    blocker: string;
    proof: string;
    agent: string;
  };
  agentTrace: OperationsTruthAgentTrace | null;
}

export interface OperationsTruthSummary {
  liveStateCounts: {
    active: number;
    under_review: number;
    paused: number;
    failed_publish: number;
    unknown: number;
  };
  blockerCounts: Array<{ blockerCode: string; count: number }>;
  proofCounts: {
    orderIngested: number;
    supplierPurchaseProved: number;
    trackingAttached: number;
    deliveredTruthObtained: number;
    releasedFundsObtained: number;
    realizedProfitObtained: number;
  };
}

export interface OperationsTruthResponse {
  generatedAt: string;
  items: OperationsTruthItem[];
  summary: OperationsTruthSummary;
}
