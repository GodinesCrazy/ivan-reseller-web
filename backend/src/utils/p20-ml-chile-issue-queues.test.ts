import { buildMlChileIssueQueues } from './ml-chile-issue-queues';

describe('buildMlChileIssueQueues P20 freight flags', () => {
  it('surfaces freight and RUT issue queues from productData metadata', () => {
    const queues = buildMlChileIssueQueues([
      {
        id: 1,
        status: 'PENDING',
        targetCountry: 'CL',
        shippingCost: null,
        importTax: null,
        totalCost: null,
        aliexpressSku: 'sku-1',
        productData: JSON.stringify({
          mlChileFreightCompatibility: {
            freightCredentialCompatibility: 'freight_endpoint_incompatible',
          },
          mlChileStrategicPause: {
            state: 'paused_on_external_freight_dependency',
          },
          mlChileFreight: {
            freightSummaryCode: 'freight_quote_missing_for_cl',
          },
          mlChileRutReadiness: {
            classification: 'absent_but_likely_required',
          },
        }),
      },
      {
        id: 2,
        status: 'PENDING',
        targetCountry: 'CL',
        shippingCost: 2,
        importTax: 1,
        totalCost: 10,
        aliexpressSku: 'sku-2',
        productData: JSON.stringify({
          mlChileFreightCompatibility: {
            freightCredentialCompatibility: 'freight_endpoint_compatible',
          },
          mlChileFreight: {
            freightSummaryCode: 'freight_quote_found_for_cl',
            selectedServiceName: 'AliExpress Standard Shipping',
          },
          mlChileLandedCost: {
            landedCostCompleteness: 'complete',
          },
        }),
      },
      {
        id: 3,
        status: 'PENDING',
        targetCountry: 'CL',
        shippingCost: null,
        importTax: null,
        totalCost: null,
        aliexpressSku: 'sku-3',
        productData: JSON.stringify({
          mlChileFreightCompatibility: {
            freightCredentialCompatibility: 'freight_method_present_signature_blocked',
          },
          mlChileFreight: {
            freightSummaryCode: 'freight_quote_missing_for_cl',
          },
          mlChileStrategicPause: {
            state: 'paused_on_external_freight_dependency',
          },
        }),
      },
    ]);

    expect(queues.freightQuoteMissingForCl).toEqual([1, 3]);
    expect(queues.freightQuoteFoundForCl).toEqual([2]);
    expect(queues.freightEndpointIncompatible).toEqual([1]);
    expect(queues.freightEndpointCompatible).toEqual([2]);
    expect(queues.freightPlatformEntitlementRequired).toEqual([1]);
    expect(queues.freightCodeSideRecoveryExhausted).toEqual([1]);
    expect(queues.freightFallbackPathUnavailable).toEqual([1]);
    expect(queues.selectedShippingServicePersisted).toEqual([2]);
    expect(queues.freightMethodPresentSignatureBlocked).toEqual([3]);
    expect(queues.likelyRutRequiredForSupplierCheckout).toEqual([1]);
    expect(queues.nearValidWaitingOnExternalPlatformFix).toEqual([1, 3]);
  });
});
