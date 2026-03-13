/**
 * Unit tests for Mercado Libre policy compliance (duplicate titles, first image).
 * See docs/MERCADOLIBRE_COMPLIANCE.md
 */
import { MarketplaceService } from '../marketplace.service';

describe('MarketplaceService - Mercado Libre compliance', () => {
  let marketplaceService: MarketplaceService;

  beforeEach(() => {
    marketplaceService = new MarketplaceService();
  });

  describe('prepareImagesForMarketplace (ML) - reorder for clean portada', () => {
    const prepareImages = (images: any, marketplace: 'mercadolibre'): string[] => {
      // @ts-ignore - access private method for testing
      return marketplaceService.prepareImagesForMarketplace(images, marketplace);
    };

    test('should put URLs without logo/watermark/banner first (ML policy: portada sin logos)', () => {
      const images = [
        'https://ae01.alicdn.com/product_watermark_final.jpg',
        'https://ae02.alicdn.com/clean-product-123.jpg',
        'https://ae01.alicdn.com/item_banner_promo.jpg',
      ];
      const result = prepareImages(images, 'mercadolibre');
      expect(result).toHaveLength(3);
      // Clean URL (no watermark, no banner) should be first
      expect(result[0]).toBe('https://ae02.alicdn.com/clean-product-123.jpg');
      expect(result[1]).toMatch(/watermark/);
      expect(result[2]).toMatch(/banner/);
    });

    test('should keep single image unchanged', () => {
      const images = ['https://ae01.alicdn.com/single.jpg'];
      const result = prepareImages(images, 'mercadolibre');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(images[0]);
    });

    test('all clean URLs should maintain order (no suspect terms)', () => {
      const images = [
        'https://ae01.alicdn.com/product_a.jpg',
        'https://ae01.alicdn.com/product_b.jpg',
      ];
      const result = prepareImages(images, 'mercadolibre');
      expect(result).toHaveLength(2);
      expect(result[0]).toBe(images[0]);
      expect(result[1]).toBe(images[1]);
    });
  });

  describe('Title normalization for duplicate detection', () => {
    // Pure normalization logic (mirrors ensureUniqueMlTitle) - testable without prisma
    const normalize = (t: string) =>
      (t || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\sáéíóúñü]/gi, '')
        .trim();

    test('should normalize titles consistently for duplicate comparison', () => {
      expect(normalize('7-in-1 Cell Phone Stand')).toBe('7in1 cell phone stand');
      expect(normalize('  Multiple   Spaces  ')).toBe('multiple spaces');
      expect(normalize('Producto con ñ y tildes: áéíóú')).toBe('producto con ñ y tildes áéíóú');
    });

    test('should treat identical normalized titles as duplicates', () => {
      const a = normalize('Wireless Bluetooth Speaker');
      const b = normalize('wireless bluetooth speaker');
      expect(a).toBe(b);
    });

    test('should treat different titles as non-duplicates', () => {
      const a = normalize('Bluetooth Speaker Black');
      const b = normalize('Bluetooth Speaker White');
      expect(a).not.toBe(b);
    });
  });
});
