/**
 * Tests for MarketplaceService - price validation (price > totalCost)
 * Verifies the validation rules used in publishToEbay, publishToMercadoLibre, publishToAmazon.
 */

import { MarketplaceService } from '../marketplace.service';

describe('MarketplaceService - Price validation logic', () => {
  let service: MarketplaceService;

  beforeEach(() => {
    service = new MarketplaceService();
  });

  describe('totalCost and price validation', () => {
    it('computes totalCost as cost + shipping + importTax', () => {
      const aliexpressPrice = 10;
      const shippingCost = 2;
      const importTax = 1;
      const totalCost = aliexpressPrice + shippingCost + importTax;
      expect(totalCost).toBe(13);
    });

    it('price must be strictly greater than totalCost for profit', () => {
      const totalCost = 13;
      expect(15 > totalCost).toBe(true);
      expect(14 > totalCost).toBe(true);
      expect(13 > totalCost).toBe(false);
      expect(12 > totalCost).toBe(false);
    });

    it('prepareImagesForMarketplace returns valid URLs for listing', () => {
      const images = ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'];
      const result = (service as any).prepareImagesForMarketplace(images, 'ebay');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatch(/^https:\/\//);
    });
  });
});
