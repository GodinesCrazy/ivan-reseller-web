/**
 * Phase 53 — unit tests for pre-publish validator helpers (no live AliExpress API).
 */

import {
  minShippingCostFromApi,
  selectPurchasableSku,
  selectPurchasableSkuSoft,
  computeProfitAfterFees,
  resolveCanonicalMlChileFreightTruth,
} from '../pre-publish-validator.service';
import type { DropshippingProductInfo } from '../aliexpress-dropshipping-api.service';

describe('pre-publish-validator.service', () => {
  describe('minShippingCostFromApi', () => {
    it('returns minimum non-negative cost', () => {
      const info: DropshippingProductInfo = {
        productId: '1',
        productTitle: 't',
        productImages: [],
        salePrice: 10,
        originalPrice: 10,
        currency: 'USD',
        stock: 1,
        shippingInfo: {
          availableShippingMethods: [
            { methodId: 'a', methodName: 'A', cost: 5.5, estimatedDays: 10 },
            { methodId: 'b', methodName: 'B', cost: 2.25, estimatedDays: 20 },
          ],
        },
      };
      expect(minShippingCostFromApi(info)).toBe(2.25);
    });

    it('returns null when no methods', () => {
      const info: DropshippingProductInfo = {
        productId: '1',
        productTitle: 't',
        productImages: [],
        salePrice: 10,
        originalPrice: 10,
        currency: 'USD',
        stock: 1,
      };
      expect(minShippingCostFromApi(info)).toBeNull();
    });

    it('allows zero-cost shipping', () => {
      const info: DropshippingProductInfo = {
        productId: '1',
        productTitle: 't',
        productImages: [],
        salePrice: 10,
        originalPrice: 10,
        currency: 'USD',
        stock: 1,
        shippingInfo: {
          availableShippingMethods: [{ methodId: 'f', methodName: 'Free', cost: 0, estimatedDays: 30 }],
        },
      };
      expect(minShippingCostFromApi(info)).toBe(0);
    });
  });

  describe('selectPurchasableSku', () => {
    it('picks cheapest in-stock SKU when no preference', () => {
      const info: DropshippingProductInfo = {
        productId: '1',
        productTitle: 't',
        productImages: [],
        salePrice: 99,
        originalPrice: 99,
        currency: 'USD',
        stock: 0,
        skus: [
          { skuId: 'a', attributes: {}, salePrice: 10, stock: 0 },
          { skuId: 'b', attributes: {}, salePrice: 8, stock: 3 },
          { skuId: 'c', attributes: {}, salePrice: 5, stock: 1 },
        ],
      };
      const r = selectPurchasableSku(info, null);
      expect(r).toEqual({ skuId: 'c', unitPrice: 5 });
    });

    it('returns null when all SKUs out of stock', () => {
      const info: DropshippingProductInfo = {
        productId: '1',
        productTitle: 't',
        productImages: [],
        salePrice: 0,
        originalPrice: 0,
        currency: 'USD',
        stock: 0,
        skus: [{ skuId: 'a', attributes: {}, salePrice: 10, stock: 0 }],
      };
      expect(selectPurchasableSku(info, null)).toBeNull();
    });

    it('uses single-product stock when no sku array', () => {
      const info: DropshippingProductInfo = {
        productId: '1',
        productTitle: 't',
        productImages: [],
        salePrice: 12.5,
        originalPrice: 15,
        currency: 'USD',
        stock: 5,
      };
      const r = selectPurchasableSku(info, null);
      expect(r).toEqual({ skuId: '', unitPrice: 12.5 });
    });
  });

  describe('selectPurchasableSkuSoft', () => {
    it('returns reason when preferred SKU missing', () => {
      const info: DropshippingProductInfo = {
        productId: '1',
        productTitle: 't',
        productImages: [],
        salePrice: 10,
        originalPrice: 10,
        currency: 'USD',
        stock: 0,
        skus: [{ skuId: 'x', attributes: {}, salePrice: 10, stock: 2 }],
      };
      const r = selectPurchasableSkuSoft(info, 'wrong-id');
      expect(r).toMatchObject({
        ok: false,
        reason: expect.stringContaining('not found'),
      });
    });
  });

  describe('computeProfitAfterFees', () => {
    it('includes marketplace and payment fees in total cost', () => {
      const { netProfit, totalCost, breakdown } = computeProfitAfterFees(
        'ebay',
        100,
        40,
        5,
        0
      );
      expect(breakdown.productCost).toBe(40);
      expect(breakdown.shippingCost).toBe(5);
      expect(breakdown.marketplaceFee).toBeCloseTo(12.5, 5);
      expect(breakdown.paymentFee).toBeCloseTo(2.9, 5);
      expect(totalCost).toBeGreaterThan(40 + 5);
      expect(netProfit).toBe(100 - totalCost);
    });
  });

  describe('resolveCanonicalMlChileFreightTruth', () => {
    it('accepts fresh and internally consistent persisted freight truth', () => {
      const result = resolveCanonicalMlChileFreightTruth(
        {
          id: 32690,
          aliexpressUrl: 'https://www.aliexpress.com/item/1005000000000000.html',
          targetCountry: 'CL',
          shippingCost: 2.99,
          productData: JSON.stringify({
            mlChileFreight: {
              freightSummaryCode: 'freight_quote_found_for_cl',
              targetCountry: 'CL',
              selectedServiceName: 'CAINIAO_FULFILLMENT_STD',
              selectedFreightAmount: 2.99,
              selectedFreightCurrency: 'USD',
              checkedAt: '2026-03-22T22:45:09.762Z',
            },
          }),
        },
        'CL',
        new Date('2026-03-23T00:45:09.762Z')
      );

      expect(result).toMatchObject({
        ok: true,
        status: 'freight_truth_ready_for_publish',
        truth: {
          selectedServiceName: 'CAINIAO_FULFILLMENT_STD',
          selectedFreightAmount: 2.99,
          selectedFreightCurrency: 'USD',
          shippingUsd: 2.99,
        },
      });
    });

    it('rejects stale persisted freight truth', () => {
      const result = resolveCanonicalMlChileFreightTruth(
        {
          id: 32690,
          aliexpressUrl: 'https://www.aliexpress.com/item/1005000000000000.html',
          targetCountry: 'CL',
          shippingCost: 2.99,
          productData: JSON.stringify({
            mlChileFreight: {
              freightSummaryCode: 'freight_quote_found_for_cl',
              targetCountry: 'CL',
              selectedServiceName: 'CAINIAO_FULFILLMENT_STD',
              selectedFreightAmount: 2.99,
              selectedFreightCurrency: 'USD',
              checkedAt: '2026-03-18T22:45:09.762Z',
            },
          }),
        },
        'CL',
        new Date('2026-03-23T00:45:09.762Z')
      );

      expect(result).toMatchObject({
        ok: false,
        status: 'freight_truth_stale',
      });
      expect(result.reason).toContain('stale');
    });

    it('rejects inconsistent top-level shipping cost', () => {
      const result = resolveCanonicalMlChileFreightTruth(
        {
          id: 32690,
          aliexpressUrl: 'https://www.aliexpress.com/item/1005000000000000.html',
          targetCountry: 'CL',
          shippingCost: 3.5,
          productData: {
            mlChileFreight: {
              freightSummaryCode: 'freight_quote_found_for_cl',
              targetCountry: 'CL',
              selectedServiceName: 'CAINIAO_FULFILLMENT_STD',
              selectedFreightAmount: 2.99,
              selectedFreightCurrency: 'USD',
              checkedAt: '2026-03-22T22:45:09.762Z',
            },
          },
        },
        'CL',
        new Date('2026-03-23T00:45:09.762Z')
      );

      expect(result).toMatchObject({
        ok: false,
        status: 'freight_truth_inconsistent',
      });
      expect(result.reason).toContain('does not match');
    });
  });
});
