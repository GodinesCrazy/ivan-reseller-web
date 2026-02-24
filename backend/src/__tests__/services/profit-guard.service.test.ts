/**
 * Unit tests for profit-guard.service
 * Verifies: sellingPrice > supplier + fees + tax + shipping required; otherwise blocked.
 */
import { checkProfitGuard } from '../../services/profit-guard.service';

describe('profit-guard.service', () => {
  describe('checkProfitGuard', () => {
    it('allows when sellingPrice exceeds total cost', () => {
      const result = checkProfitGuard({
        sellingPriceUsd: 50,
        supplierPriceUsd: 20,
        platformFeesUsd: 5,
        paypalFeesUsd: 2,
        taxUsd: 1,
        shippingUsd: 2,
      });
      expect(result.allowed).toBe(true);
      expect(result.breakdown.totalCostUsd).toBe(30);
      expect(result.breakdown.netProfitUsd).toBe(20);
    });

    it('blocks when sellingPrice equals total cost (no profit)', () => {
      const result = checkProfitGuard({
        sellingPriceUsd: 30,
        supplierPriceUsd: 20,
        platformFeesUsd: 5,
        paypalFeesUsd: 2,
        taxUsd: 1,
        shippingUsd: 2,
      });
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Profit guard');
    });

    it('blocks when sellingPrice is less than total cost', () => {
      const result = checkProfitGuard({
        sellingPriceUsd: 25,
        supplierPriceUsd: 20,
        platformFeesUsd: 5,
        paypalFeesUsd: 2,
        taxUsd: 1,
        shippingUsd: 2,
      });
      expect(result.allowed).toBe(false);
      expect(result.breakdown.netProfitUsd).toBeLessThan(0);
    });

    it('uses default fees when not provided', () => {
      const result = checkProfitGuard({
        sellingPriceUsd: 100,
        supplierPriceUsd: 50,
      });
      expect(result.allowed).toBe(true);
      expect(result.breakdown.platformFeesUsd).toBeGreaterThan(0);
      expect(result.breakdown.paypalFeesUsd).toBeGreaterThan(0);
    });
  });
});
