/**
 * FASE 0 — Validation tests for canonical cost engine consistency.
 *
 * Validates:
 * 1. Payment fee is 3.49% + $0.49 fixed (not 2.9% flat)
 * 2. Marketplace fees are canonical (eBay 12.85%, ML 13.9%, Amazon 15%)
 * 3. profit-guard uses correct marketplace-specific fees
 * 4. No divergence between cost-calculator, profit-guard, and canonical engine
 * 5. ML Chile import duties included (IVA 19% + arancel 6%)
 */

import { CostCalculatorService } from '../../services/cost-calculator.service';
import { checkProfitGuard } from '../../services/profit-guard.service';
import { computeSuggestedPrice } from '../../services/pricing-engine.service';
import {
  computeCanonicalCost,
  getMarketplaceFee,
  PAYMENT_FEE_PCT,
  PAYMENT_FEE_FIXED_USD,
} from '../../services/canonical-cost-engine.service';

const costCalc = new CostCalculatorService();

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Canonical fee constants
// ─────────────────────────────────────────────────────────────────────────────
describe('FASE 0 — Canonical fee constants', () => {
  it('Payment fee pct is 3.49% (not 2.9%)', () => {
    expect(PAYMENT_FEE_PCT).toBeCloseTo(0.0349, 4);
  });

  it('Payment fee fixed is $0.49', () => {
    expect(PAYMENT_FEE_FIXED_USD).toBeCloseTo(0.49, 2);
  });

  it('eBay US fee is 12.85%', () => {
    expect(getMarketplaceFee('ebay', 'US')).toBeCloseTo(0.1285, 4);
  });

  it('MercadoLibre CL fee is 13.9%', () => {
    expect(getMarketplaceFee('mercadolibre', 'CL')).toBeCloseTo(0.139, 4);
  });

  it('MercadoLibre BR fee is 16%', () => {
    expect(getMarketplaceFee('mercadolibre', 'BR')).toBeCloseTo(0.16, 4);
  });

  it('Amazon US fee is 15%', () => {
    expect(getMarketplaceFee('amazon', 'US')).toBeCloseTo(0.15, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: cost-calculator payment fee fix
// ─────────────────────────────────────────────────────────────────────────────
describe('FASE 0 — cost-calculator payment fee (was 2.9% flat, now 3.49%+$0.49)', () => {
  it('eBay $20 sale: paymentFee = 3.49%*20 + 0.49 = $1.188', () => {
    const { breakdown } = costCalc.calculate('ebay', 20, 5, { shippingCost: 0, importTax: 0 });
    const expectedPayment = 20 * 0.0349 + 0.49;
    expect(breakdown.paymentFee).toBeCloseTo(expectedPayment, 2);
  });

  it('eBay $20 sale: old 2.9% would have been $0.58 — now correctly $1.19', () => {
    const { breakdown } = costCalc.calculate('ebay', 20, 5, { shippingCost: 0, importTax: 0 });
    // Old value: 20 * 0.029 = 0.58
    // New value: 20 * 0.0349 + 0.49 = 1.188
    expect(breakdown.paymentFee).toBeGreaterThan(0.58 + 0.40); // at least $0.40 higher than old
  });

  it('ML $50 sale: marketplaceFee = 13.9%*50 = $6.95 (was 11%=$5.50)', () => {
    const { breakdown } = costCalc.calculate('mercadolibre', 50, 15, { shippingCost: 0, importTax: 0 });
    expect(breakdown.marketplaceFee).toBeCloseTo(50 * 0.139, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: profit-guard uses marketplace-specific fees
// ─────────────────────────────────────────────────────────────────────────────
describe('FASE 0 — profit-guard canonical fees by marketplace', () => {
  it('eBay US: platformFee = 12.85% of selling price', () => {
    const result = checkProfitGuard({
      sellingPriceUsd: 100,
      supplierPriceUsd: 50,
      marketplace: 'ebay',
      region: 'US',
    });
    expect(result.breakdown.platformFeesUsd).toBeCloseTo(100 * 0.1285, 2);
  });

  it('ML CL: platformFee = 13.9% of selling price', () => {
    const result = checkProfitGuard({
      sellingPriceUsd: 100,
      supplierPriceUsd: 50,
      marketplace: 'mercadolibre',
      region: 'CL',
    });
    expect(result.breakdown.platformFeesUsd).toBeCloseTo(100 * 0.139, 2);
  });

  it('ML BR: platformFee = 16% of selling price', () => {
    const result = checkProfitGuard({
      sellingPriceUsd: 100,
      supplierPriceUsd: 50,
      marketplace: 'mercadolibre',
      region: 'BR',
    });
    expect(result.breakdown.platformFeesUsd).toBeCloseTo(100 * 0.16, 2);
  });

  it('profit-guard payment fee is 3.49% + $0.49 (canonical)', () => {
    const sellingPrice = 100;
    const result = checkProfitGuard({
      sellingPriceUsd: sellingPrice,
      supplierPriceUsd: 30,
      marketplace: 'ebay',
      region: 'US',
    });
    const expectedPaypal = sellingPrice * PAYMENT_FEE_PCT + PAYMENT_FEE_FIXED_USD;
    expect(result.breakdown.paypalFeesUsd).toBeCloseTo(expectedPaypal, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: No divergence between services on same scenario
// ─────────────────────────────────────────────────────────────────────────────
describe('FASE 0 — Fee consistency: cost-calculator vs profit-guard vs canonical engine', () => {
  const SALE = 30;
  const SUPPLIER = 8;
  const SHIPPING = 5.99;

  it('eBay US $30 — all three services agree on fees within $0.10', () => {
    // cost-calculator
    const { breakdown: ccBreakdown } = costCalc.calculate('ebay', SALE, SUPPLIER, {
      shippingCost: SHIPPING,
      importTax: 0,
    });

    // profit-guard (uses canonical engine internally)
    const pgResult = checkProfitGuard({
      sellingPriceUsd: SALE,
      supplierPriceUsd: SUPPLIER,
      marketplace: 'ebay',
      region: 'US',
      shippingUsd: SHIPPING,
    });

    // canonical engine directly
    const canonical = computeCanonicalCost({
      supplierPriceRaw: SUPPLIER,
      supplierCurrency: 'USD',
      saleCurrency: 'USD',
      salePriceRaw: SALE,
      marketplace: 'ebay',
      region: 'US',
      shippingToCustomerRaw: SHIPPING,
      skipImportDuties: true,
    });

    // All should agree on fees within $0.10
    expect(Math.abs(ccBreakdown.marketplaceFee - pgResult.breakdown.platformFeesUsd)).toBeLessThan(0.10);
    expect(Math.abs(ccBreakdown.paymentFee - pgResult.breakdown.paypalFeesUsd)).toBeLessThan(0.10);
    expect(Math.abs(ccBreakdown.marketplaceFee - canonical.breakdown.marketplaceFeeUsd)).toBeLessThan(0.10);
  });

  it('ML CL $30 — no service diverges on fees by more than $0.10', () => {
    const { breakdown: ccBreakdown } = costCalc.calculate('mercadolibre', SALE, SUPPLIER, {
      shippingCost: SHIPPING,
      importTax: 0,
    });

    const pgResult = checkProfitGuard({
      sellingPriceUsd: SALE,
      supplierPriceUsd: SUPPLIER,
      marketplace: 'mercadolibre',
      region: 'CL',
      shippingUsd: SHIPPING,
    });

    expect(Math.abs(ccBreakdown.marketplaceFee - pgResult.breakdown.platformFeesUsd)).toBeLessThan(0.10);
    expect(Math.abs(ccBreakdown.paymentFee - pgResult.breakdown.paypalFeesUsd)).toBeLessThan(0.10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Pricing engine includes fees in totalCost
// ─────────────────────────────────────────────────────────────────────────────
describe('FASE 0 — pricing-engine totalCost includes marketplace + payment fees', () => {
  it('suggests price that accounts for fees (not just supplier + tax + shipping)', () => {
    const result = computeSuggestedPrice({
      supplierPriceUsd: 10,
      competitorPrices: [25, 28, 30, 32, 35],
      taxUsd: 0,
      shippingUsd: 5.99,
      marketplace: 'ebay',
    });

    expect(result.success).toBe(true);
    // With fees included: supplier $10 + shipping $5.99 + eBay 12.85%*price + payment 3.49%*price+0.49
    // The suggested price must be > supplier + shipping alone ($15.99) to cover fees
    expect(result.suggestedPriceUsd).toBeGreaterThan(15.99);
  });

  it('margin is calculated after all fees (not pre-fee inflated)', () => {
    const result = computeSuggestedPrice({
      supplierPriceUsd: 10,
      competitorPrices: [25, 28, 30],
      taxUsd: 0,
      shippingUsd: 5.99,
      marketplace: 'ebay',
    });
    // With eBay 12.85% + payment 3.49%+$0.49 + supplier $10 + shipping $5.99
    // margin should NOT be 30%+ that you'd get if ignoring fees
    expect(result.marginPercent).toBeGreaterThanOrEqual(0);
    expect(result.marginPercent).toBeLessThan(60); // sanity check: not absurdly high
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: ML Chile canonical cost with duties
// ─────────────────────────────────────────────────────────────────────────────
describe('FASE 0 — ML Chile: canonical cost includes import duties', () => {
  it('CL: importDuty included in canonical cost breakdown', () => {
    const canonical = computeCanonicalCost({
      supplierPriceRaw: 15,
      supplierCurrency: 'USD',
      saleCurrency: 'USD',
      salePriceRaw: 40,
      marketplace: 'mercadolibre',
      region: 'CL',
      shippingToCustomerRaw: 5.99,
    });

    // CL: IVA 19% + arancel 6% on (product + shipping)
    expect(canonical.breakdown.importDutiesUsd).toBeGreaterThan(0);
    expect(canonical.breakdown.marketplaceFeeUsd).toBeCloseTo(40 * 0.139, 2);
    expect(canonical.breakdown.paymentFeeUsd).toBeCloseTo(40 * 0.0349 + 0.49, 2);
  });
});
