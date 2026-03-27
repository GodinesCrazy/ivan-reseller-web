import {
  buildMlChileIssueQueues,
  getMlChilePreSaleBlockers,
} from './ml-chile-issue-queues';

describe('ML Chile issue queues', () => {
  it('classifies missing Chile-specific commercial truth', () => {
    expect(
      getMlChilePreSaleBlockers({
        status: 'APPROVED',
        targetCountry: null,
        shippingCost: null,
        importTax: null,
        totalCost: null,
        aliexpressSku: null,
      }),
    ).toEqual([
      'status_not_validated_ready',
      'missing_target_country',
      'missing_shipping_cost',
      'missing_import_tax',
      'missing_total_cost',
      'missing_aliexpress_sku',
    ]);
  });

  it('marks non-CL target countries explicitly', () => {
    expect(
      getMlChilePreSaleBlockers({
        status: 'VALIDATED_READY',
        targetCountry: 'US',
        shippingCost: 1,
        importTax: 1,
        totalCost: 2,
        aliexpressSku: 'sku-1',
      }),
    ).toEqual(['target_country_not_cl']);
  });

  it('builds issue queues and near-valid list', () => {
    const queues = buildMlChileIssueQueues([
      {
        id: 1,
        status: 'VALIDATED_READY',
        targetCountry: 'US',
        shippingCost: 1,
        importTax: 1,
        totalCost: 2,
        aliexpressSku: 'sku-1',
      },
      {
        id: 2,
        status: 'VALIDATED_READY',
        targetCountry: 'CL',
        shippingCost: 1,
        importTax: 1,
        totalCost: 2,
        aliexpressSku: '',
      },
    ], {
      1: { authBlocked: true, oauthReauthRequired: true },
    });

    expect(queues.authBlocked).toEqual([1]);
    expect(queues.oauthReauthRequired).toEqual([1]);
    expect(queues.missingTargetCountryCl).toEqual([1]);
    expect(queues.missingAliExpressSku).toEqual([2]);
    expect(queues.nearValid).toEqual([1, 2]);
  });
});
