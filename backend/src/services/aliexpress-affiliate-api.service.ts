/**
 * AliExpress Affiliate API Service
 * 
 * Implementa la AliExpress Affiliate API (AliExpress Portals API) oficial
 * para extraer datos de productos, precios, imágenes y costos de envío
 * 
 * @see https://developer.alibaba.com/help/en/portal
 * @see instalarAPi.txt - Documentación técnica de la API
 */

import { trace } from '../utils/boot-trace';
trace('loading aliexpress-affiliate-api.service');

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import logger from '../config/logger';
import type { AliExpressAffiliateCredentials } from '../types/api-credentials.types';
import { getToken, setToken, markNeedsReauth } from './aliexpress-token.store';
import { refreshAccessToken } from './aliexpress-oauth.service';
import { AffiliatePermissionMissingError } from '../errors/affiliate-permission-missing.error';
// Tipos de datos de la API
export interface AffiliateProduct {
  productId: string;
  productTitle: string;
  productMainImageUrl: string;
  productSmallImageUrls: string[];
  salePrice: number;
  originalPrice: number;
  discount: number;
  evaluateScore?: number;
  evaluateRate?: number;
  volume?: number; // Número de ventas
  storeName?: string;
  storeUrl?: string;
  productDetailUrl?: string;
  promotionLink?: string; // Link de afiliado
  currency?: string;
  commissionRate?: number;
  /** Estimated profit (e.g. salePrice * commissionRate/100). */
  estimatedProfit?: number;
}

export interface AffiliateProductDetail extends AffiliateProduct {
  description?: string;
  categoryId?: string;
  categoryName?: string;
  shippingInfo?: {
    shipToCountry?: string;
    deliveryDays?: number;
    shippingCost?: number;
  };
  skus?: AffiliateSKU[];
}

export interface AffiliateSKU {
  skuId: string;
  attributes: {
    property?: string;
    value?: string;
  }[];
  skuSalePrice: number;
  skuStock: number;
  skuImageUrl?: string;
}

export interface ProductSearchParams {
  keywords: string;
  categoryIds?: string;
  minSalePrice?: number;
  maxSalePrice?: number;
  pageNo?: number;
  pageSize?: number;
  sort?: 'SALE_PRICE_ASC' | 'SALE_PRICE_DESC' | 'LAST_VOLUME_DESC' | 'PRICE_ASC' | 'PRICE_DESC';
  targetCurrency?: string; // USD, EUR, etc.
  targetLanguage?: string; // EN, ES, FR, etc.
  shipToCountry?: string; // CL, US, etc.
  deliveryDays?: number;
  trackingId?: string;
}

/** Result of affiliate product search. empty: true when API returned 0 products (triggers fallback). */
export interface AffiliateSearchResult {
  products: AffiliateProduct[];
  source: 'affiliate';
  empty: boolean;
}

export interface ProductDetailParams {
  productIds: string; // Coma separada para múltiples productos
  targetCurrency?: string;
  targetLanguage?: string;
  country?: string;
  shipToCountry?: string;
  trackingId?: string;
}

export class AliExpressAffiliateAPIService {
  private client: AxiosInstance;
  private credentials: AliExpressAffiliateCredentials | null = null;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly trackingId: string;
  private readonly apiBaseUrl: string;

  // Production: APP_KEY mode only, no OAuth
  private static readonly ENDPOINT = 'https://api-sg.aliexpress.com/sync';
  private readonly ENDPOINT_SYNC = AliExpressAffiliateAPIService.ENDPOINT;
  private endpoint: string = AliExpressAffiliateAPIService.ENDPOINT;

  constructor() {
    const rawKey = (process.env.ALIEXPRESS_APP_KEY || '').trim();
    const rawSecret = (process.env.ALIEXPRESS_APP_SECRET || '').trim();
    this.appKey = rawKey && rawKey !== 'PUT_YOUR_APP_KEY_HERE' ? rawKey : '';
    this.appSecret = rawSecret && rawSecret !== 'PUT_YOUR_APP_SECRET_HERE' ? rawSecret : '';
    this.trackingId = (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim();
    if (!this.appKey || !this.appSecret) {
      throw new Error('ALIEXPRESS_API_NOT_CONFIGURED');
    }
    console.log('[AUTOPILOT] Affiliate API credentials loaded');
    console.log('[AUTOPILOT] Using APP_KEY mode');
    console.log('[ALIEXPRESS-AFFILIATE] TRACKING ID:', this.trackingId || 'MISSING');
    this.apiBaseUrl = (process.env.ALIEXPRESS_API_BASE || process.env.ALIEXPRESS_API_BASE_URL || this.ENDPOINT_SYNC).replace(/\/$/, '');

    this.client = axios.create({
      timeout: 30000, // ✅ CRÍTICO: Timeout aumentado a 30s para dar tiempo a AliExpress TOP API
      // AliExpress TOP API puede ser lenta, especialmente en la primera llamada
      // El Promise.race en advanced-scraper tiene 35s, así que este timeout debe ser menor
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      // ✅ Agregar configuración adicional para conexiones lentas
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Aceptar códigos < 500
      // ✅ Agregar keepAlive para conexiones más rápidas
      httpAgent: new (require('http').Agent)({ keepAlive: true }),
      httpsAgent: new (require('https').Agent)({ keepAlive: true }),
    });
  }

  /**
   * Configurar credenciales
   */
  setCredentials(credentials: AliExpressAffiliateCredentials): void {
    this.credentials = credentials;
    this.endpoint = this.ENDPOINT_SYNC;
    
    // ✅ CRÍTICO: Si las credenciales incluyen accessToken, usarlo (opcional - Affiliate API no lo requiere)
    // Note: Affiliate API uses signature auth, not OAuth tokens
    if ((credentials as any).accessToken) {
      this.accessToken = (credentials as any).accessToken;
      if ((credentials as any).accessTokenExpiresAt) {
        this.tokenExpiresAt = new Date((credentials as any).accessTokenExpiresAt);
      }
    }
    
    const logger = require('../config/logger').default;
    logger.info('[ALIEXPRESS-AFFILIATE-API] Credentials set', {
      endpoint: this.ENDPOINT_SYNC,
      sandbox: credentials.sandbox,
      appKey: credentials.appKey ? `${credentials.appKey.substring(0, 6)}...` : 'missing',
      hasAccessToken: !!this.accessToken,
      tokenExpiresAt: this.tokenExpiresAt?.toISOString() || 'N/A',
      note: 'Using legacy endpoint (more stable). Both sandbox and production use the same endpoint in AliExpress TOP API.'
    });
  }

  /**
   * ✅ NUEVO: Establecer access token OAuth
   */
  setAccessToken(accessToken: string, expiresAt?: Date): void {
    this.accessToken = accessToken;
    this.tokenExpiresAt = expiresAt || null;
    logger.info('[ALIEXPRESS-AUTH] Access token set', {
      hasToken: !!accessToken,
      expiresAt: expiresAt?.toISOString() || 'N/A',
      tokenPreview: accessToken ? `${accessToken.substring(0, 10)}...` : 'N/A'
    });
  }

  /**
   * Load token from database and sync to in-memory store.
   */
  async loadTokenFromDatabase(): Promise<void> {
    try {
      const { prisma } = await import('../config/database');
      const tokenRecord = await prisma.aliExpressToken.findUnique({
        where: { id: 'global' },
      });

      if (tokenRecord) {
        this.accessToken = tokenRecord.accessToken;
        this.tokenExpiresAt = tokenRecord.expiresAt;
        setToken({
          accessToken: tokenRecord.accessToken,
          refreshToken: tokenRecord.refreshToken || '',
          expiresAt: tokenRecord.expiresAt.getTime(),
        });
        logger.info('[ALIEXPRESS-AUTH] Token loaded from database', {
          expiresAt: tokenRecord.expiresAt.toISOString(),
          hasRefresh: !!tokenRecord.refreshToken,
        });
      } else {
        logger.info('[ALIEXPRESS-AUTH] No token found in database');
      }
    } catch (error: any) {
      logger.error('[ALIEXPRESS-AUTH] Failed to load token from database', { error: error.message });
    }
  }

  /**
   * FINAL PROFIT MODE: OAuth disabled. Always use APP_KEY + APP_SECRET only.
   * Never throw NEEDS_REAUTH.
   */
  async getValidAccessToken(): Promise<string> {
    return '';
  }

  /**
   * ✅ Obtener access token (nullable, for backward compatibility).
   */
  async getAccessToken(): Promise<string | null> {
    try {
      return await this.getValidAccessToken();
    } catch {
      return null;
    }
  }

  /** AliExpress SYNC: YYYY-MM-DD HH:mm:ss, server local time. */
  private getTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      now.getFullYear() +
      '-' +
      pad(now.getMonth() + 1) +
      '-' +
      pad(now.getDate()) +
      ' ' +
      pad(now.getHours()) +
      ':' +
      pad(now.getMinutes()) +
      ':' +
      pad(now.getSeconds())
    );
  }

  /**
   * SYNC endpoint signature: sorted key+value only (no secret in base string).
   * Use HMAC-SHA256 with APP_SECRET as key. createHash causes IncompleteSignature.
   */
  private generateSignature(params: Record<string, string>): string {
    const sortedKeys = Object.keys(params)
      .filter((k) => k !== 'sign')
      .sort();
    const baseString = sortedKeys.map((k) => k + params[k]).join('');
    return crypto
      .createHmac('sha256', this.appSecret)
      .update(baseString, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Build params (all values string), add sign after generation. No access_token.
   */
  private async makeRequest(method: string, requestParams: Record<string, any>): Promise<any> {
    const params: Record<string, string> = {
      app_key: String(this.appKey),
      method: String(method),
      format: 'json',
      sign_method: 'sha256',
      timestamp: String(this.getTimestamp()),
      v: '2.0',
    };
    Object.entries(requestParams || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params[key] = String(value);
      }
    });
    params.sign = this.generateSignature(params);

    console.log('[AUTOPILOT] Affiliate request signed correctly');

    const response = await axios.get('https://api-sg.aliexpress.com/sync', {
      params,
      timeout: 30000,
    });
    return response.data;
  }

  /** Common keywords that should return results when affiliate permission is granted */
  private static readonly COMMON_KEYWORDS = new Set([
    'phone', 'case', 'wireless', 'bluetooth', 'watch', 'bag', 'shoes', 'earbuds',
    'phone case', 'gaming keyboard', 'usb cable', 'charging cable', 'led light',
  ]);

  private isCommonKeyword(keyword: string): boolean {
    const normalized = String(keyword || '').toLowerCase().trim();
    if (AliExpressAffiliateAPIService.COMMON_KEYWORDS.has(normalized)) return true;
    return Array.from(AliExpressAffiliateAPIService.COMMON_KEYWORDS).some(k => normalized.includes(k));
  }

  /** Estimated profit from sale price and commission rate (or 30% fallback). */
  private static calculateProfit(p: any): number {
    const price = parseFloat(p.target_sale_price || p.sale_price || '0');
    const rate = parseFloat(p.commission_rate || '0');
    if (rate > 0) return (price * rate) / 100;
    return price * 0.3;
  }

  /**
   * Buscar productos (aliexpress.affiliate.product.query). APP_KEY only.
   * When 0 products: returns { products: [], source: 'affiliate', empty: true } so callers can activate fallback.
   */
  async searchProducts(params: ProductSearchParams): Promise<AffiliateSearchResult> {
    if (!this.trackingId) {
      throw new Error('TRACKING_ID_MISSING');
    }
    try {
      const keywords = params.keywords;
      const pageNo = (params.pageNo ?? 1).toString();
      const pageSize = Math.min(params.pageSize ?? 20, 20).toString();

      const requestParams: Record<string, string> = {
        keywords,
        page_no: pageNo,
        page_size: pageSize,
        target_currency: 'USD',
        target_language: 'EN',
        ship_to_country: 'US',
        tracking_id: this.trackingId,
        fields:
          'product_id,product_title,product_main_image_url,product_small_image_urls,sale_price,original_price,target_sale_price,target_sale_price_currency,product_detail_url,promotion_link,commission_rate,currency',
      };
      if (params.targetCurrency) requestParams.target_currency = params.targetCurrency;
      if (params.targetLanguage) requestParams.target_language = params.targetLanguage;
      if (params.shipToCountry) requestParams.ship_to_country = params.shipToCountry;

      const data = await this.makeRequest('aliexpress.affiliate.product.query', requestParams);

      if (data?.error_response) {
        const err = data.error_response;
        const msg = err.msg || err.error_msg || err.sub_msg || 'Unknown error';
        const code = err.code || err.error_code || 'UNKNOWN';
        throw new Error(`ALIEXPRESS_API_ERROR: ${msg} (Code: ${code})`);
      }

      const products =
        data?.aliexpress_affiliate_product_query_response?.result?.products?.product ||
        data?.result?.products?.product ||
        [];

      if (products.length === 0) {
        console.log('[AUTOPILOT] Affiliate empty');
        const resp = data?.aliexpress_affiliate_product_query_response;
        const result = resp?.result;
        if (result && typeof result === 'object') {
          const msg = (result as any).resp_msg ?? (result as any).msg ?? (result as any).message;
          const code = (result as any).resp_code ?? (result as any).code;
          if (code != null || msg) {
            logger.info('[AUTOPILOT] Affiliate 0 products', { code, msg: msg || '(none)' });
          }
        }
        return { products: [], source: 'affiliate', empty: true };
      }

      const mapped = products.map((p: any) => {
        const price = parseFloat(p.target_sale_price || p.sale_price || '0');
        const currency = p.target_sale_price_currency || p.currency || 'USD';
        const commissionRate = parseFloat(p.commission_rate || '0');
        const estimatedProfit = AliExpressAffiliateAPIService.calculateProfit(p);
        return {
          productId: String(p.product_id || ''),
          productTitle: p.product_title || '',
          productMainImageUrl: p.product_main_image_url || '',
          productSmallImageUrls: Array.isArray(p.product_small_image_urls?.string)
            ? p.product_small_image_urls.string
            : (p.product_small_image_urls ? [p.product_small_image_urls] : []),
          salePrice: price,
          originalPrice: parseFloat(p.original_price || '0'),
          discount: parseFloat(p.discount || '0'),
          productDetailUrl: p.product_detail_url,
          promotionLink: p.promotion_link,
          currency,
          commissionRate: Number.isFinite(commissionRate) ? commissionRate : undefined,
          estimatedProfit,
        };
      });
      console.log('[AUTOPILOT] Affiliate SUCCESS:', mapped.length);
      return { products: mapped, source: 'affiliate', empty: false };
    } catch (error: any) {
      logger.error('[ALIEXPRESS-AFFILIATE-API] Search products failed', {
        error: error.message,
        params,
      });
      throw error;
    }
  }

  /**
   * Debug raw search for diagnostics.
   */
  async debugSearchRaw(params: Record<string, any>): Promise<any> {
    const stringParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) stringParams[k] = String(v);
    }
    const data = await this.makeRequest('aliexpress.affiliate.product.query', stringParams);
    return data;
  }

  /**
   * Obtener detalles de producto (aliexpress.affiliate.productdetail.get)
   */
  async getProductDetails(params: ProductDetailParams): Promise<AffiliateProductDetail[]> {
    try {
      logger.info('[ALIEXPRESS-AFFILIATE-API] Getting product details', {
        productIds: params.productIds,
      });
      const apiParams: Record<string, any> = {
        product_ids: params.productIds,
      };
      if (params.targetCurrency) apiParams.target_currency = params.targetCurrency;
      if (params.targetLanguage) apiParams.target_language = params.targetLanguage;
      if (params.country) apiParams.country = params.country;
      if (params.shipToCountry) apiParams.ship_to_country = params.shipToCountry;
      if (params.trackingId) apiParams.tracking_id = params.trackingId;
      apiParams.fields = 'product_id,product_title,product_main_image_url,product_small_image_urls,sale_price,original_price,discount,evaluate_score,evaluate_rate,volume,store_name,store_url,product_detail_url,promotion_link,commission_rate,description,category_id,category_name,shipping_info';

      const data = await this.makeRequest('aliexpress.affiliate.productdetail.get', apiParams);
      const result = data?.result ?? data?.response?.result ?? data?.aliexpress_affiliate_productdetail_get_response ?? data;
      const products = Array.isArray(result?.products?.product)
        ? result.products.product
        : (result?.product ? [result.product] : []);

      return products.map((p: any) => ({
        productId: String(p.product_id || ''),
        productTitle: p.product_title || '',
        productMainImageUrl: p.product_main_image_url || '',
        productSmallImageUrls: Array.isArray(p.product_small_image_urls?.string) 
          ? p.product_small_image_urls.string 
          : (p.product_small_image_urls ? [p.product_small_image_urls] : []),
        salePrice: parseFloat(p.sale_price || '0'),
        originalPrice: parseFloat(p.original_price || '0'),
        discount: parseFloat(p.discount || '0'),
        evaluateScore: p.evaluate_score ? parseFloat(p.evaluate_score) : undefined,
        evaluateRate: p.evaluate_rate ? parseFloat(p.evaluate_rate) : undefined,
        volume: p.volume ? parseInt(p.volume, 10) : undefined,
        storeName: p.store_name,
        storeUrl: p.store_url,
        productDetailUrl: p.product_detail_url,
        promotionLink: p.promotion_link,
        currency: p.currency || 'USD',
        commissionRate: p.commission_rate ? parseFloat(p.commission_rate) : undefined,
        description: p.description,
        categoryId: p.category_id,
        categoryName: p.category_name,
        shippingInfo: p.shipping_info ? {
          shipToCountry: p.shipping_info.ship_to_country,
          deliveryDays: p.shipping_info.delivery_days ? parseInt(p.shipping_info.delivery_days, 10) : undefined,
          shippingCost: p.shipping_info.shipping_cost ? parseFloat(p.shipping_info.shipping_cost) : undefined,
        } : undefined,
      }));
    } catch (error: any) {
      logger.error('[ALIEXPRESS-AFFILIATE-API] Get product details failed', {
        error: error.message,
        params,
      });
      throw error;
    }
  }

  /**
   * Obtener detalles de SKUs/variantes (aliexpress.affiliate.product.sku.detail.get)
   */
  async getSKUDetails(productId: string, params?: {
    shipToCountry?: string;
    targetCurrency?: string;
    targetLanguage?: string;
  }): Promise<AffiliateSKU[]> {
    try {
      logger.info('[ALIEXPRESS-AFFILIATE-API] Getting SKU details', {
        productId,
      });
      const apiParams: Record<string, any> = { product_id: productId };
      if (params?.shipToCountry) apiParams.ship_to_country = params.shipToCountry;
      if (params?.targetCurrency) apiParams.target_currency = params.targetCurrency;
      if (params?.targetLanguage) apiParams.target_language = params.targetLanguage;

      const data = await this.makeRequest('aliexpress.affiliate.product.sku.detail.get', apiParams);
      const result = data?.result ?? data?.response?.result ?? data?.aliexpress_affiliate_product_sku_detail_get_response ?? data;
      const skus = result?.skus?.sku || [];
      
      return skus.map((s: any) => ({
        skuId: String(s.sku_id || ''),
        attributes: Array.isArray(s.attributes?.attribute) 
          ? s.attributes.attribute.map((attr: any) => ({
              property: attr.property,
              value: attr.value,
            }))
          : [],
        skuSalePrice: parseFloat(s.sku_sale_price || '0'),
        skuStock: parseInt(s.sku_stock || '0', 10),
        skuImageUrl: s.sku_image_url,
      }));
    } catch (error: any) {
      logger.error('[ALIEXPRESS-AFFILIATE-API] Get SKU details failed', {
        error: error.message,
        productId,
      });
      throw error;
    }
  }

  /**
   * Get product by AliExpress URL (extracts product ID and fetches details)
   */
  async getProductByUrl(aliexpressUrl: string): Promise<{
    title: string;
    description: string;
    price: number;
    currency: string;
    images: string[];
    category?: string;
    shipping?: { cost?: number; estimatedDays?: number };
    rating?: number;
    reviews?: number;
    seller?: { name: string; rating: number; location: string };
  }> {
    await this.getValidAccessToken();
    const match = aliexpressUrl.match(/\/item\/(\d+)\.html/);
    const productId = match?.[1];
    if (!productId) {
      throw new Error('Invalid AliExpress URL: could not extract product ID');
    }
    const details = await this.getProductDetails({ productIds: productId });
    if (!details?.length) {
      throw new Error('Product not found in Affiliate API');
    }
    const p = details[0];
    const images = [p.productMainImageUrl, ...(p.productSmallImageUrls || [])].filter(Boolean);
    return {
      title: p.productTitle || 'Producto sin título',
      description: p.description || '',
      price: p.salePrice || 0,
      currency: p.currency || 'USD',
      images,
      category: p.categoryName,
      shipping: p.shippingInfo ? {
        cost: p.shippingInfo.shippingCost,
        estimatedDays: p.shippingInfo.deliveryDays,
      } : undefined,
      rating: p.evaluateScore,
      reviews: p.volume,
      seller: p.storeName ? { name: p.storeName, rating: 0, location: '' } : undefined,
    };
  }

  /**
   * Convertir producto de Affiliate API a formato ScrapedProduct para compatibilidad
   */
  /** @deprecated Use searchProducts or debugSearchRaw instead. Kept for manual raw diagnostics. */
  async debugProductQuery(keyword: string): Promise<any> {
    const params = { keywords: keyword, page_no: 1, page_size: 20, ship_to_country: 'US', sort: 'volume_desc' };
    return this.debugSearchRaw(params);
  }

  toScrapedProduct(product: AffiliateProductDetail, productUrl?: string): {
    title: string;
    price: number;
    description?: string;
    images: string[];
    category?: string;
    rating?: number;
    productUrl?: string;
  } {
    const images = [product.productMainImageUrl, ...product.productSmallImageUrls].filter(Boolean);
    
    return {
      title: product.productTitle,
      price: product.salePrice,
      description: product.description,
      images,
      category: product.categoryName,
      rating: product.evaluateScore,
      productUrl: productUrl || product.productDetailUrl,
    };
  }
}

// Exportar instancia singleton
export const aliexpressAffiliateAPIService = new AliExpressAffiliateAPIService();

