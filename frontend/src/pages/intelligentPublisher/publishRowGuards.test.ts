import { describe, it, expect } from 'vitest';
import {
  isPendingTruthLoading,
  isPendingRowPublishBlocked,
  isMlCanaryCandidateRow,
} from './publishRowGuards';
import type { OperationsTruthItem } from '@/types/operations';

const baseTruth = (over: Partial<OperationsTruthItem>): OperationsTruthItem =>
  ({
    productId: 1,
    productTitle: 't',
    marketplace: null,
    listingId: null,
    localListingState: null,
    externalMarketplaceState: null,
    externalMarketplaceSubStatus: [],
    listingUrl: null,
    lastMarketplaceSyncAt: null,
    imageRemediationState: null,
    publicationReadinessState: null,
    blockerCode: null,
    blockerMessage: null,
    nextAction: null,
    orderIngested: false,
    supplierPurchaseProved: false,
    trackingAttached: false,
    deliveredTruthObtained: false,
    releasedFundsObtained: false,
    realizedProfitObtained: false,
    proofUpdatedAt: null,
    lastAgentDecision: null,
    lastAgentDecisionReason: null,
    decidedAt: null,
    sourceLabels: { listing: 'x', blocker: 'x', proof: 'x', agent: 'x' },
    agentTrace: null,
    ...over,
  }) as OperationsTruthItem;

describe('publishRowGuards', () => {
  it('isPendingTruthLoading when pending and fetch loading', () => {
    expect(isPendingTruthLoading(0, true)).toBe(false);
    expect(isPendingTruthLoading(3, true)).toBe(true);
    expect(isPendingTruthLoading(3, false)).toBe(false);
  });

  it('isPendingRowPublishBlocked fail-closed when loading or missing truth', () => {
    expect(isPendingRowPublishBlocked(undefined, true)).toBe(true);
    expect(isPendingRowPublishBlocked(undefined, false)).toBe(true);
    expect(isPendingRowPublishBlocked(baseTruth({}), true)).toBe(true);
  });

  it('blocks on blockerCode e.g. missingSku', () => {
    expect(isPendingRowPublishBlocked(baseTruth({ blockerCode: 'missingSku' }), false)).toBe(true);
  });

  it('blocks on publicationReadinessState BLOCKED even if blockerCode missing', () => {
    expect(isPendingRowPublishBlocked(baseTruth({ publicationReadinessState: 'BLOCKED', blockerCode: null }), false)).toBe(true);
  });

  it('blocks whitespace-only blockerCode (fail-closed)', () => {
    expect(isPendingRowPublishBlocked(baseTruth({ blockerCode: '   ' }), false)).toBe(true);
  });

  it('blocks when agentTrace.blocking', () => {
    expect(
      isPendingRowPublishBlocked(
        baseTruth({
          agentTrace: {
            agentName: 'x',
            stage: 'x',
            decision: 'x',
            reasonCode: 'x',
            evidenceSummary: [],
            blocking: true,
            advisory: false,
            nextAction: null,
            decidedAt: null,
          },
        }),
        false
      )
    ).toBe(true);
  });

  it('allows when no blocker and agent not blocking', () => {
    expect(isPendingRowPublishBlocked(baseTruth({}), false)).toBe(false);
  });

  it('isMlCanaryCandidateRow requires unblock + positive ML profit', () => {
    const p = { estimatedProfitByMarketplace: { mercadolibre: 5 } };
    expect(isMlCanaryCandidateRow(p, baseTruth({ blockerCode: 'missingSku' }), false)).toBe(false);
    expect(isMlCanaryCandidateRow(p, baseTruth({}), false)).toBe(true);
    expect(isMlCanaryCandidateRow({ estimatedProfitByMarketplace: { mercadolibre: 0 } }, baseTruth({}), false)).toBe(
      false
    );
  });
});
