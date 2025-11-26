import { MarketplaceService } from '../marketplace.service';

describe('MarketplaceService - Multi-Image Publishing', () => {
  let marketplaceService: MarketplaceService;

  beforeEach(() => {
    marketplaceService = new MarketplaceService();
  });

  describe('prepareImagesForMarketplace', () => {
    // Test helper para acceder al método privado
    const prepareImages = (images: any, marketplace: 'ebay' | 'mercadolibre' | 'amazon'): string[] => {
      // @ts-ignore - Acceder a método privado para testing
      return marketplaceService.prepareImagesForMarketplace(images, marketplace);
    };

    test('should return all images when within marketplace limit (eBay)', () => {
      const images = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
        'https://example.com/image3.jpg',
      ];
      const result = prepareImages(images, 'ebay');
      expect(result).toHaveLength(3);
      expect(result).toEqual(images);
    });

    test('should limit images to eBay maximum (12)', () => {
      const images = Array.from({ length: 15 }, (_, i) => `https://example.com/image${i + 1}.jpg`);
      const result = prepareImages(images, 'ebay');
      expect(result).toHaveLength(12);
      expect(result).toEqual(images.slice(0, 12));
    });

    test('should limit images to MercadoLibre maximum (10)', () => {
      const images = Array.from({ length: 15 }, (_, i) => `https://example.com/image${i + 1}.jpg`);
      const result = prepareImages(images, 'mercadolibre');
      expect(result).toHaveLength(10);
      expect(result).toEqual(images.slice(0, 10));
    });

    test('should limit images to Amazon maximum (9)', () => {
      const images = Array.from({ length: 15 }, (_, i) => `https://example.com/image${i + 1}.jpg`);
      const result = prepareImages(images, 'amazon');
      expect(result).toHaveLength(9);
      expect(result).toEqual(images.slice(0, 9));
    });

    test('should handle single image correctly', () => {
      const images = ['https://example.com/image1.jpg'];
      const result = prepareImages(images, 'ebay');
      expect(result).toHaveLength(1);
      expect(result).toEqual(images);
    });

    test('should handle JSON string format', () => {
      const imagesJson = JSON.stringify([
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
      ]);
      const result = prepareImages(imagesJson, 'ebay');
      expect(result).toHaveLength(2);
    });

    test('should filter invalid URLs', () => {
      const images = [
        'https://example.com/image1.jpg',
        'not-a-url',
        'https://example.com/image2.jpg',
        '',
      ];
      const result = prepareImages(images, 'ebay');
      expect(result).toHaveLength(2);
      expect(result).toEqual([
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
      ]);
    });

    test('should return empty array for invalid input', () => {
      expect(prepareImages(null, 'ebay')).toEqual([]);
      expect(prepareImages(undefined, 'ebay')).toEqual([]);
      expect(prepareImages('', 'ebay')).toEqual([]);
      expect(prepareImages([], 'ebay')).toEqual([]);
    });
  });
});
