/**
 * AliExpress Affiliate API Service
 * 
 * Implementa la AliExpress Affiliate API (AliExpress Portals API) oficial
 * para extraer datos de productos, precios, imágenes y costos de envío
 * 
 * @see https://developer.alibaba.com/help/en/portal
 * @see instalarAPi.txt - Documentación técnica de la API
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import logger from '../config/logger';
import type { AliExpressAffiliateCredentials } from '../types/api-credentials.types';

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

  // Endpoints base de la API
  private readonly ENDPOINT_LEGACY = 'https://gw.api.taobao.com/router/rest';
  private readonly ENDPOINT_NEW = 'https://api-sg.aliexpress.com/sync';
  
  // Usar endpoint legacy por defecto (más documentado y estable)
  private endpoint: string = this.ENDPOINT_LEGACY;

  constructor() {
    this.client = axios.create({
      timeout: 60000, // ✅ MEJORADO: Aumentado a 60s para evitar timeouts en llamadas lentas
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  /**
   * Configurar credenciales
   */
  setCredentials(credentials: AliExpressAffiliateCredentials): void {
    this.credentials = credentials;
    // Usar endpoint nuevo si está en sandbox
    if (credentials.sandbox) {
      this.endpoint = this.ENDPOINT_NEW;
    }
  }

  /**
   * Calcular firma (sign) para autenticación
   * Algoritmo: MD5 o SHA256 según sign_method
   */
  private calculateSign(params: Record<string, any>, appSecret: string, signMethod: 'md5' | 'sha256' = 'md5'): string {
    // Ordenar parámetros alfabéticamente
    const sortedKeys = Object.keys(params).sort();
    const signString = sortedKeys
      .map(key => `${key}${params[key]}`)
      .join('');
    
    const fullSignString = `${appSecret}${signString}${appSecret}`;
    
    if (signMethod === 'sha256') {
      return crypto.createHash('sha256').update(fullSignString, 'utf8').digest('hex').toUpperCase();
    } else {
      return crypto.createHash('md5').update(fullSignString, 'utf8').digest('hex').toUpperCase();
    }
  }

  /**
   * Realizar petición a la API con autenticación
   */
  private async makeRequest(method: string, params: Record<string, any>): Promise<any> {
    if (!this.credentials) {
      throw new Error('AliExpress Affiliate API credentials not configured');
    }

    // Parámetros comunes para todas las peticiones
    const commonParams = {
      method,
      app_key: this.credentials.appKey,
      timestamp: new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + '00', // Formato: YYYYMMDDHHmmss00
      format: 'json',
      v: '2.0',
      sign_method: 'md5',
    };

    // Combinar parámetros comunes con específicos
    const allParams: Record<string, any> = { ...commonParams, ...params };

    // Calcular firma
    const sign = this.calculateSign(allParams, this.credentials.appSecret, commonParams.sign_method as 'md5' | 'sha256');
    allParams.sign = sign;

    // Agregar trackingId si está disponible
    if (this.credentials.trackingId && !allParams.tracking_id) {
      allParams.tracking_id = this.credentials.trackingId;
    }

    try {
      logger.debug('[ALIEXPRESS-AFFILIATE-API] Making request', {
        method,
        endpoint: this.endpoint,
        params: { ...allParams, app_secret: '[REDACTED]' },
      });

      const response = await this.client.post(this.endpoint, allParams, {
        params: allParams, // También enviar como query params por compatibilidad
      });

      // La respuesta de TOP API viene en formato: { response: { result: { ... } } }
      if (response.data.error_response) {
        const error = response.data.error_response;
        throw new Error(`AliExpress API Error: ${error.msg || error.sub_msg || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
      }

      const result = response.data[`${method.replace(/\./g, '_')}_response`] || response.data.response?.result;
      
      if (!result) {
        logger.warn('[ALIEXPRESS-AFFILIATE-API] Unexpected response format', {
          method,
          responseData: response.data,
        });
        throw new Error('Unexpected response format from AliExpress API');
      }

      return result;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        logger.error('[ALIEXPRESS-AFFILIATE-API] Request failed', {
          method,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        });
        throw new Error(`AliExpress API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Buscar productos (aliexpress.affiliate.product.query)
   */
  async searchProducts(params: ProductSearchParams): Promise<AffiliateProduct[]> {
    try {
      logger.info('[ALIEXPRESS-AFFILIATE-API] Searching products', {
        keywords: params.keywords,
        pageNo: params.pageNo || 1,
        pageSize: params.pageSize || 20,
      });

      const apiParams: Record<string, any> = {
        keywords: params.keywords,
        page_no: params.pageNo || 1,
        page_size: Math.min(params.pageSize || 20, 50), // Máximo 50 por página
      };

      if (params.categoryIds) apiParams.category_ids = params.categoryIds;
      if (params.minSalePrice) apiParams.min_sale_price = params.minSalePrice;
      if (params.maxSalePrice) apiParams.max_sale_price = params.maxSalePrice;
      if (params.sort) apiParams.sort = params.sort;
      if (params.targetCurrency) apiParams.target_currency = params.targetCurrency;
      if (params.targetLanguage) apiParams.target_language = params.targetLanguage;
      if (params.shipToCountry) apiParams.ship_to_country = params.shipToCountry;
      if (params.deliveryDays) apiParams.delivery_days = params.deliveryDays;
      if (params.trackingId) apiParams.tracking_id = params.trackingId;

      // Campos a solicitar
      apiParams.fields = 'product_id,product_title,product_main_image_url,product_small_image_urls,sale_price,original_price,discount,evaluate_score,evaluate_rate,volume,store_name,store_url,product_detail_url,promotion_link,commission_rate';

      const result = await this.makeRequest('aliexpress.affiliate.product.query', apiParams);

      // Procesar respuesta
      const products = result.products?.product || [];
      
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
      }));
    } catch (error: any) {
      logger.error('[ALIEXPRESS-AFFILIATE-API] Search products failed', {
        error: error.message,
        params,
      });
      throw error;
    }
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

      // Campos a solicitar
      apiParams.fields = 'product_id,product_title,product_main_image_url,product_small_image_urls,sale_price,original_price,discount,evaluate_score,evaluate_rate,volume,store_name,store_url,product_detail_url,promotion_link,commission_rate,description,category_id,category_name,shipping_info';

      const result = await this.makeRequest('aliexpress.affiliate.productdetail.get', apiParams);

      // Procesar respuesta
      const products = Array.isArray(result.products?.product) 
        ? result.products.product 
        : (result.product ? [result.product] : []);

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

      const apiParams: Record<string, any> = {
        product_id: productId,
      };

      if (params?.shipToCountry) apiParams.ship_to_country = params.shipToCountry;
      if (params?.targetCurrency) apiParams.target_currency = params.targetCurrency;
      if (params?.targetLanguage) apiParams.target_language = params.targetLanguage;

      const result = await this.makeRequest('aliexpress.affiliate.product.sku.detail.get', apiParams);

      // Procesar respuesta
      const skus = result.skus?.sku || [];
      
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
   * Convertir producto de Affiliate API a formato ScrapedProduct para compatibilidad
   */
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

