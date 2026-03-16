/**
 * Phase 2: Multi-supplier abstraction.
 * Adapters normalize product info, stock, and price from different suppliers.
 */

export type SupplierId = 'aliexpress' | string;

export interface SupplierProductInfo {
  productId: string;
  title: string;
  /** Main image URL */
  imageUrl?: string;
  /** All image URLs */
  imageUrls?: string[];
  /** Current sale/offer price in supplier currency */
  price: number;
  /** Original/list price if available */
  originalPrice?: number;
  currency: string;
  /** Available stock (total or sum of SKUs) */
  stock: number;
  /** Optional SKU-level data */
  skus?: Array<{
    skuId: string;
    attributes?: Record<string, string>;
    price: number;
    stock: number;
    imageUrl?: string;
  }>;
}

export interface SupplierAdapter {
  readonly supplierId: SupplierId;

  /**
   * Extract supplier product ID from a product URL (e.g. aliexpress item URL).
   * Return null if URL is not for this supplier or ID cannot be extracted.
   */
  getProductIdFromUrl(url: string): string | null;

  /**
   * Fetch full product info (title, images, price, stock).
   * Throws on API/network errors.
   */
  getProductInfo(
    productId: string,
    options?: { userId: number; locale?: string }
  ): Promise<SupplierProductInfo>;

  /**
   * Get current stock for the product. May be derived from getProductInfo.
   */
  getStock(
    productId: string,
    options?: { userId: number }
  ): Promise<number>;

  /**
   * Get current price (sale price) in supplier currency.
   * May be derived from getProductInfo.
   */
  getPrice(
    productId: string,
    options?: { userId: number }
  ): Promise<{ price: number; currency: string }>;
}
