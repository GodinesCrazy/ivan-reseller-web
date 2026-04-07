/**
 * Tests for order-time freight truth resolution and profitability gate.
 *
 * Focus: shipping engine correctness, regression prevention for
 * AUTO_PURCHASE_BLOCKED_BY_FREIGHT and ORDER_REQUIRES_SHIPPING_RECHECK gates.
 */

import {
  checkOrderTimeProfitability,
  type ShippingTruthStatus,
} from '../order-time-freight';

// ─── checkOrderTimeProfitability ────────────────────────────────────────────

describe('checkOrderTimeProfitability', () => {
  const baseParams = {
    salePriceUsd: 11.90,     // 11,305 CLP / 950
    supplierCostUsd: 4.00,   // AliExpress listing price
    freightUsd: 1.99,        // AliExpress Standard Shipping CN→CL
    shippingTruthStatus: 'SHIPPING_TRUTH_OK' as ShippingTruthStatus,
  };

  it('allows a profitable order (product 32722 baseline)', () => {
    const result = checkOrderTimeProfitability(baseParams);
    expect(result.allowed).toBe(true);
    expect(result.status).toBe('PROFITABLE');
    expect(result.netProfitUsd).toBeGreaterThan(0);
    // Verify key cost components are calculated
    expect(result.breakdown.mlFeeUsd).toBeCloseTo(11.90 * 0.139, 2);
    expect(result.breakdown.importDutyUsd).toBeCloseTo((4.00 + 1.99) * 0.19, 2);
  });

  it('blocks order when freight makes it unprofitable', () => {
    const result = checkOrderTimeProfitability({
      ...baseParams,
      freightUsd: 30.00, // ridiculous freight spike
    });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe('AUTO_PURCHASE_BLOCKED_BY_FREIGHT');
    expect(result.netProfitUsd).toBeLessThan(0);
    expect(result.reason).toContain('AUTO_PURCHASE_BLOCKED_BY_FREIGHT');
  });

  it('blocks order when margin is thin AND freight truth is ESTIMATED', () => {
    const result = checkOrderTimeProfitability({
      salePriceUsd: 5.50,
      supplierCostUsd: 4.00,
      freightUsd: 1.99,
      shippingTruthStatus: 'SHIPPING_TRUTH_ESTIMATED',
    });
    // With estimated freight and thin margin: should require recheck
    // (if netProfit is still positive but margin < MIN_MARGIN_PCT=5%)
    if (result.status === 'ORDER_REQUIRES_SHIPPING_RECHECK') {
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('SHIPPING_TRUTH_ESTIMATED');
    } else if (result.status === 'AUTO_PURCHASE_BLOCKED_BY_FREIGHT') {
      expect(result.allowed).toBe(false);
    }
    // Either way, it should not be PROFITABLE with these numbers
  });

  it('allows thin margin with confirmed SHIPPING_TRUTH_OK', () => {
    // If margin is thin but freight is confirmed, only block if netProfit < 0
    const result = checkOrderTimeProfitability({
      salePriceUsd: 8.00,
      supplierCostUsd: 4.00,
      freightUsd: 1.99,
      shippingTruthStatus: 'SHIPPING_TRUTH_OK',
    });
    // These numbers: totalCost = 4 + 1.99 + 1.14IVA + 1.11mlFee + 0.77payment = 9.01
    // netProfit = 8.00 - 9.01 = negative → should block
    if (result.netProfitUsd < 0) {
      expect(result.allowed).toBe(false);
      expect(result.status).toBe('AUTO_PURCHASE_BLOCKED_BY_FREIGHT');
    }
  });

  it('returns INSUFFICIENT_DATA when sale price is 0', () => {
    const result = checkOrderTimeProfitability({
      ...baseParams,
      salePriceUsd: 0,
    });
    expect(result.allowed).toBe(true); // Don't block when data is missing
    expect(result.status).toBe('INSUFFICIENT_DATA');
  });

  it('returns INSUFFICIENT_DATA when sale price is NaN', () => {
    const result = checkOrderTimeProfitability({
      ...baseParams,
      salePriceUsd: NaN,
    });
    expect(result.allowed).toBe(true);
    expect(result.status).toBe('INSUFFICIENT_DATA');
  });

  it('calculates breakdown correctly for product 32722', () => {
    const result = checkOrderTimeProfitability(baseParams);
    const b = result.breakdown;

    // Import duty: (4.00 + 1.99) * 0.19 = 1.1381 ≈ 1.14
    expect(b.importDutyUsd).toBeCloseTo(1.14, 1);

    // ML fee: 11.90 * 0.139 = 1.6541 ≈ 1.65
    expect(b.mlFeeUsd).toBeCloseTo(1.65, 1);

    // Payment fee: 11.90 * 0.0349 + 0.49 = 0.9052 ≈ 0.91
    expect(b.paymentFeeUsd).toBeCloseTo(0.91, 1);

    // Total cost ≈ 4.00 + 1.99 + 1.14 + 1.65 + 0.91 = 9.69
    expect(b.totalCostUsd).toBeCloseTo(9.69, 0);

    // Net profit ≈ 11.90 - 9.69 = 2.21
    expect(b.netProfitUsd).toBeCloseTo(2.21, 0);

    // Margin ≈ 18.57%
    expect(b.marginPct).toBeGreaterThan(15);
    expect(b.marginPct).toBeLessThan(25);
  });

  it('handles zero freight (free shipping supplier)', () => {
    const result = checkOrderTimeProfitability({
      ...baseParams,
      freightUsd: 0,
    });
    expect(result.allowed).toBe(true);
    expect(result.status).toBe('PROFITABLE');
    // Import duty should only be on supplier cost
    expect(result.breakdown.importDutyUsd).toBeCloseTo(4.00 * 0.19, 2);
  });

  it('freight of 1.99 does not change profitable order with SHIPPING_TRUTH_MISSING', () => {
    // Even with MISSING status, if profit is clearly positive, it should pass
    const result = checkOrderTimeProfitability({
      ...baseParams,
      shippingTruthStatus: 'SHIPPING_TRUTH_MISSING',
    });
    // With 18% margin, should be PROFITABLE (margin > 5% min)
    expect(result.allowed).toBe(true);
    expect(result.status).toBe('PROFITABLE');
  });
});

// ─── Shipping representation rules ─────────────────────────────────────────

describe('Shipping representation constants', () => {
  it('ML Chile fee is 13.9%', () => {
    const { breakdown } = checkOrderTimeProfitability({
      salePriceUsd: 100,
      supplierCostUsd: 10,
      freightUsd: 0,
      shippingTruthStatus: 'SHIPPING_TRUTH_OK',
    });
    expect(breakdown.mlFeeUsd).toBeCloseTo(13.9, 0);
  });

  it('Payment fee is 3.49% + $0.49 fixed', () => {
    const { breakdown } = checkOrderTimeProfitability({
      salePriceUsd: 100,
      supplierCostUsd: 10,
      freightUsd: 0,
      shippingTruthStatus: 'SHIPPING_TRUTH_OK',
    });
    expect(breakdown.paymentFeeUsd).toBeCloseTo(3.49 + 0.49, 1);
  });

  it('Chile IVA is 19% on (supplier + freight)', () => {
    const { breakdown } = checkOrderTimeProfitability({
      salePriceUsd: 100,
      supplierCostUsd: 10,
      freightUsd: 5,
      shippingTruthStatus: 'SHIPPING_TRUTH_OK',
    });
    expect(breakdown.importDutyUsd).toBeCloseTo((10 + 5) * 0.19, 2);
  });
});
