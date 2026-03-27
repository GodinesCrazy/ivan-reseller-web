import { evaluateMlChileShippingGate } from './ml-chile-shipping-gate';

describe('ML Chile shipping gate', () => {
  it('admits a shipping method with a parsed positive cost', () => {
    const result = evaluateMlChileShippingGate({
      shippingMethods: [{ serviceName: 'AliExpress Standard Shipping', shippingCost: 4.25 }],
      rawLogisticsInfoDto: { ship_to_country: 'CL', delivery_time: 7 },
    });

    expect(result).toMatchObject({
      code: 'admitted',
      admitted: true,
      shippingMethodCount: 1,
    });
  });

  it('admits a truthful free-shipping method', () => {
    const result = evaluateMlChileShippingGate({
      shippingMethods: [{ serviceName: 'Choice', freeShipping: true, shippingCost: 0 }],
      rawLogisticsInfoDto: { ship_to_country: 'CL', delivery_time: 7 },
    });

    expect(result).toMatchObject({
      code: 'admitted',
      admitted: true,
      shippingMethodCount: 1,
    });
  });

  it('classifies destination acknowledgement without method or cost as true supplier-side missing shipping cost', () => {
    const result = evaluateMlChileShippingGate({
      shippingMethods: [],
      rawLogisticsInfoDto: { ship_to_country: 'CL', delivery_time: 7 },
    });

    expect(result).toMatchObject({
      code: 'missing_shipping_cost_true_supplier_side',
      admitted: false,
      shippingMethodCount: 0,
    });
  });

  it('detects a likely false negative when raw payload has shipping-cost-like keys but nothing normalized', () => {
    const result = evaluateMlChileShippingGate({
      shippingMethods: [],
      rawLogisticsInfoDto: {
        ship_to_country: 'CL',
        delivery_time: 7,
        freight_amount: '3.12',
      },
    });

    expect(result).toMatchObject({
      code: 'missing_shipping_cost_gate_false_negative',
      admitted: false,
      shippingMethodCount: 0,
    });
  });
});
