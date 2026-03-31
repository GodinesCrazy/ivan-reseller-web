/**
 * FASE 1 — Fallback Pricing Fix Tests
 *
 * Validates that computeMinimumViablePrice produces a price that:
 * 1. Is not below breakeven (real margin ≥ 0)
 * 2. Meets target margin (18%) with canonical fees included
 * 3. feesConsidered is non-empty (no more {})
 * 4. No item with net-negative margin passes as a viable candidate
 *
 * These tests guard the fallback path in opportunity-finder.service.ts
 * that activates when listingsFound = 0 (e.g., ML_PUBLIC_CATALOG_HTTP_FORBIDDEN).
 */

import { computeMinimumViablePrice, getMarketplaceFee, PAYMENT_FEE_PCT, PAYMENT_FEE_FIXED_USD } from '../../services/canonical-cost-engine.service';

describe('FASE 1 — Fallback pricing: computeMinimumViablePrice', () => {
  const TARGET_MARGIN_PCT = 18; // MIN_OPPORTUNITY_MARGIN = 0.18

  // Products from Cycle 1 real data
  const cycle1Products = [
    { name: 'Translation Earbuds', supplierPriceRaw: 7.86, region: 'CL' },
    { name: 'SONY OWS', supplierPriceRaw: 9.34, region: 'CL' },
    { name: 'Lenovo AI TWS', supplierPriceRaw: 20.45, region: 'CL' },
    { name: 'Sony Q87', supplierPriceRaw: 9.47, region: 'CL' },
    { name: 'AI Translation TWS', supplierPriceRaw: 14.66, region: 'CL' },
  ];

  describe('Old heuristic (price * 1.45) — demonstrates the bug', () => {
    test.each(cycle1Products)('$name: old heuristic produces net-negative margin with canonical fees', ({ supplierPriceRaw, region }) => {
      const mpFee = getMarketplaceFee('mercadolibre', region);
      const heuristicPrice = supplierPriceRaw * 1.45;

      // importTax approx 25% of supplierPrice for CL (IVA 19% + arancel 6%)
      const importTaxApprox = supplierPriceRaw * 0.25;
      const totalCost = supplierPriceRaw + importTaxApprox;

      const marketplaceFee = heuristicPrice * mpFee;
      const paymentFee = heuristicPrice * PAYMENT_FEE_PCT + PAYMENT_FEE_FIXED_USD;
      const netRevenue = heuristicPrice - marketplaceFee - paymentFee;
      const realMargin = (netRevenue - totalCost) / heuristicPrice;

      // The bug: all real margins are negative
      expect(realMargin).toBeLessThan(0);
    });
  });

  describe('New canonical fallback — computeMinimumViablePrice', () => {
    test.each(cycle1Products)('$name: minSalePrice achieves >= 18% real margin', ({ supplierPriceRaw, region }) => {
      const result = computeMinimumViablePrice({
        supplierPriceRaw,
        supplierCurrency: 'USD',
        saleCurrency: 'USD',
        marketplace: 'mercadolibre',
        region,
        targetMarginPct: TARGET_MARGIN_PCT,
      });

      expect(result.minSalePriceUsd).toBeGreaterThan(supplierPriceRaw);

      // breakdown.totalCostUsd already includes marketplaceFee + paymentFee + duties + risks.
      // Do not double-subtract fees — use canonical formula directly.
      const netProfit = result.minSalePriceUsd - result.breakdown.totalCostUsd;
      const realMargin = netProfit / result.minSalePriceUsd;

      // Must be >= 18% (allow small floating-point tolerance from rounding)
      expect(realMargin).toBeGreaterThanOrEqual(TARGET_MARGIN_PCT / 100 - 0.005);
    });

    test.each(cycle1Products)('$name: minSalePrice is greater than old heuristic (price * 1.45)', ({ supplierPriceRaw, region }) => {
      const result = computeMinimumViablePrice({
        supplierPriceRaw,
        supplierCurrency: 'USD',
        saleCurrency: 'USD',
        marketplace: 'mercadolibre',
        region,
        targetMarginPct: TARGET_MARGIN_PCT,
      });

      const heuristicPrice = supplierPriceRaw * 1.45;
      // Canonical price must be higher than the flawed heuristic
      expect(result.minSalePriceUsd).toBeGreaterThan(heuristicPrice);
    });

    test.each(cycle1Products)('$name: breakdown has non-zero canonical fees', ({ supplierPriceRaw, region }) => {
      const result = computeMinimumViablePrice({
        supplierPriceRaw,
        supplierCurrency: 'USD',
        saleCurrency: 'USD',
        marketplace: 'mercadolibre',
        region,
        targetMarginPct: TARGET_MARGIN_PCT,
      });

      // feesConsidered must NOT be empty — canonical breakdown populated
      expect(result.breakdown.marketplaceFeeUsd).toBeGreaterThan(0);
      expect(result.breakdown.paymentFeeUsd).toBeGreaterThan(0);
      expect(result.breakdown.supplierCostUsd).toBeGreaterThan(0);
      expect(result.breakdown.totalCostUsd).toBeGreaterThan(supplierPriceRaw);
    });

    test('ML CL 13.9% fee is applied correctly', () => {
      const supplierPrice = 10;
      const result = computeMinimumViablePrice({
        supplierPriceRaw: supplierPrice,
        supplierCurrency: 'USD',
        saleCurrency: 'USD',
        marketplace: 'mercadolibre',
        region: 'CL',
        targetMarginPct: 18,
      });

      // ML CL fee must be 13.9% of sale price
      const expectedMpFee = result.minSalePriceUsd * 0.139;
      expect(result.breakdown.marketplaceFeeUsd).toBeCloseTo(expectedMpFee, 1);
    });

    test('payment fee is 3.49% + $0.49 fixed', () => {
      const result = computeMinimumViablePrice({
        supplierPriceRaw: 10,
        supplierCurrency: 'USD',
        saleCurrency: 'USD',
        marketplace: 'mercadolibre',
        region: 'CL',
        targetMarginPct: 18,
      });

      const expectedPayment = result.minSalePriceUsd * PAYMENT_FEE_PCT + PAYMENT_FEE_FIXED_USD;
      expect(result.breakdown.paymentFeeUsd).toBeCloseTo(expectedPayment, 2);
    });

    test('minSalePrice > 0 for any valid supplier price', () => {
      for (const price of [1, 5, 10, 50, 100]) {
        const result = computeMinimumViablePrice({
          supplierPriceRaw: price,
          supplierCurrency: 'USD',
          saleCurrency: 'USD',
          marketplace: 'mercadolibre',
          region: 'CL',
          targetMarginPct: 18,
        });
        expect(result.minSalePriceUsd).toBeGreaterThan(0);
      }
    });

    test('no item from Cycle 1 passes as viable at $price * 1.45 when canonical fees applied', () => {
      // This test ensures the old heuristic would correctly be rejected
      cycle1Products.forEach(({ supplierPriceRaw, region }) => {
        const heuristicPrice = supplierPriceRaw * 1.45;
        const mpFee = getMarketplaceFee('mercadolibre', region);
        const paymentFee = heuristicPrice * PAYMENT_FEE_PCT + PAYMENT_FEE_FIXED_USD;
        const importTaxApprox = supplierPriceRaw * 0.25;
        const totalCost = supplierPriceRaw + importTaxApprox;
        const netRevenue = heuristicPrice - (heuristicPrice * mpFee) - paymentFee;
        const realMargin = (netRevenue - totalCost) / heuristicPrice;

        // None should pass the 18% threshold
        expect(realMargin).toBeLessThan(0.18);
      });
    });
  });
});
