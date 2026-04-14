/**
 * Fase 3 — Tests for shipping cost helper (getEffectiveShippingCost, getDefaultShippingCost).
 */

import {
  getEffectiveShippingCost,
  getEffectiveShippingCostForPublish,
  getDefaultShippingCost,
} from '../shipping.utils';

describe('shipping.utils', () => {
  describe('getEffectiveShippingCost', () => {
    it('returns product.shippingCost when present and valid', () => {
      expect(getEffectiveShippingCost({ shippingCost: 3.5 })).toBe(3.5);
      expect(getEffectiveShippingCost({ shippingCost: 0 })).toBe(0);
      expect(getEffectiveShippingCost({ shippingCost: 10 })).toBe(10);
    });

    it('returns metadata.shippingCost when product has none', () => {
      expect(getEffectiveShippingCost({}, { shippingCost: 4 })).toBe(4);
      expect(getEffectiveShippingCost({ shippingCost: null }, { shippingCost: 2 })).toBe(2);
    });

    it('prefers product.shippingCost over metadata', () => {
      expect(getEffectiveShippingCost({ shippingCost: 1 }, { shippingCost: 9 })).toBe(1);
    });

    it('returns options.defaultIfMissing when product and metadata have no valid value', () => {
      expect(getEffectiveShippingCost({}, undefined, { defaultIfMissing: 7 })).toBe(7);
      expect(getEffectiveShippingCost({ shippingCost: null }, {}, { defaultIfMissing: 6 })).toBe(6);
      expect(getEffectiveShippingCost({ shippingCost: undefined }, undefined, { defaultIfMissing: 5 })).toBe(5);
    });

    it('returns config default when no valid value and no options.defaultIfMissing', () => {
      const result = getEffectiveShippingCost({});
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('rejects negative product.shippingCost and falls back to default', () => {
      const result = getEffectiveShippingCost({ shippingCost: -1 }, undefined, { defaultIfMissing: 5.99 });
      expect(result).toBe(5.99);
    });

    it('rejects NaN and falls back to default', () => {
      const result = getEffectiveShippingCost({ shippingCost: NaN }, undefined, { defaultIfMissing: 4 });
      expect(result).toBe(4);
    });

    it('defaultWhenZeroOrMissing uses default instead of 0', () => {
      expect(
        getEffectiveShippingCost({ shippingCost: 0 }, undefined, {
          defaultWhenZeroOrMissing: true,
          defaultIfMissing: 5.99,
        })
      ).toBe(5.99);
      expect(
        getEffectiveShippingCost({}, undefined, { defaultWhenZeroOrMissing: true, defaultIfMissing: 6 })
      ).toBe(6);
    });
  });

  describe('getEffectiveShippingCostForPublish', () => {
    it('uses default when shipping is 0 or absent (small-parcel standard)', () => {
      const d = getEffectiveShippingCostForPublish({}, undefined);
      expect(typeof d).toBe('number');
      expect(d).toBeGreaterThan(0);
      expect(getEffectiveShippingCostForPublish({ shippingCost: 0 })).toBe(d);
    });

    it('keeps positive shipping from product', () => {
      expect(getEffectiveShippingCostForPublish({ shippingCost: 3.25 })).toBe(3.25);
    });

    it('uses custom defaultUsd when shipping is missing', () => {
      expect(getEffectiveShippingCostForPublish({}, undefined, { defaultUsd: 8.5 })).toBe(8.5);
      expect(getEffectiveShippingCostForPublish({ shippingCost: 0 }, undefined, { defaultUsd: 7 })).toBe(7);
    });
  });

  describe('getDefaultShippingCost', () => {
    it('returns a non-negative finite number', () => {
      const result = getDefaultShippingCost();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result)).toBe(true);
    });
  });
});
