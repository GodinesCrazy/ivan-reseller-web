/**
 * Phase 2: AliExpress supplier adapter.
 * Wraps existing AliExpress dropshipping API; does not change behavior.
 */

import type { SupplierAdapter, SupplierProductInfo } from '../supplier-adapter.types';
import { CredentialsManager } from '../credentials-manager.service';
import type { AliExpressDropshippingCredentials } from '../../types/api-credentials.types';

const ALIEXPRESS_ITEM_ID_REGEX = /\/item\/(\d+)(?:\.[a-z]+)?(?:\?|$|\/)/i;

export class AliExpressSupplierAdapter implements SupplierAdapter {
  readonly supplierId = 'aliexpress';

  getProductIdFromUrl(url: string): string | null {
    if (!url || typeof url !== 'string') return null;
    const m = url.trim().match(ALIEXPRESS_ITEM_ID_REGEX);
    return m ? m[1]! : null;
  }

  async getProductInfo(
    productId: string,
    options?: { userId: number; locale?: string }
  ): Promise<SupplierProductInfo> {
    const userId = options?.userId;
    if (userId == null) throw new Error('userId required for AliExpress getProductInfo');

    const creds = (await CredentialsManager.getCredentials(
      userId,
      'aliexpress-dropshipping',
      'production'
    )) as AliExpressDropshippingCredentials | null;
    if (!creds?.accessToken) throw new Error('AliExpress dropshipping credentials not configured');

    const { aliexpressDropshippingAPIService } = await import('../aliexpress-dropshipping-api.service');
    aliexpressDropshippingAPIService.setCredentials(creds);

    const info = await aliexpressDropshippingAPIService.getProductInfo(productId, {
      localCountry: options?.locale?.slice(0, 2)?.toUpperCase(),
      localLanguage: options?.locale?.slice(0, 2)?.toLowerCase(),
    });

    const stock = info.skus?.length
      ? Math.max(info.stock ?? 0, info.skus.reduce((s, sku) => s + (sku.stock ?? 0), 0))
      : (info.stock ?? 0);

    return {
      productId: info.productId,
      title: info.productTitle,
      imageUrl: info.productImages?.[0],
      imageUrls: info.productImages,
      price: info.salePrice,
      originalPrice: info.originalPrice,
      currency: info.currency ?? 'USD',
      stock,
      skus: info.skus?.map((s) => ({
        skuId: s.skuId,
        attributes: s.attributes,
        price: s.salePrice,
        stock: s.stock ?? 0,
        imageUrl: s.imageUrl,
      })),
    };
  }

  async getStock(productId: string, options?: { userId: number }): Promise<number> {
    const info = await this.getProductInfo(productId, options);
    return info.stock;
  }

  async getPrice(
    productId: string,
    options?: { userId: number }
  ): Promise<{ price: number; currency: string }> {
    const info = await this.getProductInfo(productId, options);
    return { price: info.price, currency: info.currency };
  }
}

export const aliExpressSupplierAdapter = new AliExpressSupplierAdapter();
