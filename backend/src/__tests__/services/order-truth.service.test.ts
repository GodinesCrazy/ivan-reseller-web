import {
  getOrderTruthFlags,
  mergeOrderTruthFlags,
} from '../../services/order-truth.service';

describe('order-truth.service', () => {
  it('treats manual marketplace cancellation as excluded from commercial proof', () => {
    const notes = mergeOrderTruthFlags({
      fulfillmentNotes: null,
      patch: {
        manuallyCancelledMarketplaceSide: true,
        excludedFromCommercialProof: true,
        commercialProofEligible: false,
        operatorTruthReason: 'Cancelled manually on eBay due to negative margin',
        marketplaceObservedStatus: 'MANUALLY_CANCELLED_OPERATOR_CONFIRMED',
      },
    });

    expect(
      getOrderTruthFlags({
        fulfillmentNotes: notes,
      })
    ).toMatchObject({
      manuallyCancelledMarketplaceSide: true,
      excludedFromCommercialProof: true,
      commercialProofEligible: false,
      operatorTruthReason: 'Cancelled manually on eBay due to negative margin',
      marketplaceObservedStatus: 'MANUALLY_CANCELLED_OPERATOR_CONFIRMED',
    });
  });

  it('falls back to failureReason when legacy rows were manually cancelled', () => {
    expect(
      getOrderTruthFlags({
        fulfillmentNotes: null,
        failureReason: 'MANUALLY_CANCELLED_MARKETPLACE_SIDE',
        errorMessage: 'Cancelled manually in marketplace',
      })
    ).toMatchObject({
      manuallyCancelledMarketplaceSide: true,
      excludedFromCommercialProof: true,
      commercialProofEligible: false,
      operatorTruthReason: 'Cancelled manually in marketplace',
    });
  });
});
