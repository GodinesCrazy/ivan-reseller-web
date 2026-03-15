/**
 * Unit tests for pricing-engine.service (spec: min(competitor)*0.97, margin 20-35%, profit guard).
 */
import { computeSuggestedPrice } from '../pricing-engine.service';

describe('pricing-engine.service', () => {
  describe('computeSuggestedPrice', () => {
    it('uses min(competitor_prices) * 0.97 when competitors provided', () => {
      const result = computeSuggestedPrice({
        supplierPriceUsd: 10,
        competitorPrices: [20, 25, 30],
        taxUsd: 0,
        shippingUsd: 0,
        useSpecFactor: true,
      });
      expect(result.success).toBe(true);
      expect(result.source).toBe('spec_engine');
      expect(result.suggestedPriceUsd).toBeGreaterThanOrEqual(10);
      expect(result.reason).toContain('0.97');
    });

    it('ensures price respects profit guard when competitor min is low', () => {
      const result = computeSuggestedPrice({
        supplierPriceUsd: 15,
        competitorPrices: [18],
        taxUsd: 0,
        shippingUsd: 0,
        useSpecFactor: true,
      });
      expect(result.success).toBe(true);
      expect(result.suggestedPriceUsd).toBeGreaterThanOrEqual(15);
      expect(result.reason).toBeDefined();
    });

    it('falls back when no competitors', () => {
      const result = computeSuggestedPrice({
        supplierPriceUsd: 10,
        competitorPrices: [],
        taxUsd: 0,
        shippingUsd: 0,
      });
      expect(result.success).toBe(true);
      expect(result.source).toBe('fallback');
      expect(result.suggestedPriceUsd).toBeGreaterThanOrEqual(10);
    });

    it('returns error when supplierPriceUsd <= 0', () => {
      const result = computeSuggestedPrice({
        supplierPriceUsd: 0,
        competitorPrices: [20],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('respects profit guard floor', () => {
      const result = computeSuggestedPrice({
        supplierPriceUsd: 50,
        competitorPrices: [52],
        taxUsd: 0,
        shippingUsd: 0,
        useSpecFactor: true,
      });
      expect(result.success).toBe(true);
      expect(result.suggestedPriceUsd).toBeGreaterThanOrEqual(50);
    });
  });
});
