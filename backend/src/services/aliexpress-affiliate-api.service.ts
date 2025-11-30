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
    
    // ✅ CRÍTICO: Según la documentación de AliExpress, ambos endpoints funcionan para sandbox y production
    // El endpoint legacy es más estable y documentado, así que lo usamos siempre
    // Sin embargo, podríamos intentar el endpoint nuevo si el legacy falla
    this.endpoint = this.ENDPOINT_LEGACY;
    
    const logger = require('../config/logger').default;
    logger.info('[ALIEXPRESS-AFFILIATE-API] Credentials set', {
      endpoint: this.ENDPOINT_LEGACY,
      sandbox: credentials.sandbox,
      appKey: credentials.appKey ? `${credentials.appKey.substring(0, 6)}...` : 'missing',
      note: 'Using legacy endpoint (more stable). Both sandbox and production use the same endpoint in AliExpress TOP API.'
    });
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
    // ✅ MEJORADO: Formato de timestamp correcto para AliExpress TOP API
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    
    const commonParams = {
      method,
      app_key: this.credentials.appKey,
      timestamp, // Formato: YYYYMMDDHHmmss
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
      logger.info('[ALIEXPRESS-AFFILIATE-API] Making request', {
        method,
        endpoint: this.endpoint,
        timestamp: allParams.timestamp,
        app_key: allParams.app_key,
        params_count: Object.keys(allParams).length,
        timeout: '30000ms (axios) con Promise.race de 35s para fallback'
      });

      // ✅ MEJORADO: Usar URLSearchParams para enviar datos correctamente
      const formData = new URLSearchParams();
      Object.keys(allParams).forEach(key => {
        const value = allParams[key];
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });

      // ✅ CRÍTICO: Timeout aumentado a 30s para dar más tiempo a la API
      // Si falla por timeout, el sistema hará fallback a scraping nativo
      // Nota: El Promise.race en advanced-scraper tiene 35s, así que este timeout
      // debe ser menor para que el race funcione correctamente
      const response = await this.client.post(this.endpoint, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000, // ✅ Aumentado a 30s - AliExpress TOP API puede ser lenta
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
        page_size: Math.min(params.pageSize || 10, 20), // ✅ MEJORADO: Reducir pageSize a 10 para evitar timeouts
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

      // ✅ MEJORADO: Campos mínimos esenciales para respuesta rápida
      // Solo campos críticos para reducir tamaño de respuesta y tiempo de procesamiento
      apiParams.fields = 'product_id,product_title,product_main_image_url,product_small_image_urls,sale_price,original_price,currency';

      logger.info('[ALIEXPRESS-AFFILIATE-API] Request parameters prepared', {
        keywords: params.keywords,
        pageNo: params.pageNo || 1,
        pageSize: apiParams.page_size,
        targetCurrency: params.targetCurrency,
        shipToCountry: params.shipToCountry,
        endpoint: this.endpoint
      });

      const result = await this.makeRequest('aliexpress.affiliate.product.query', apiParams);

      // ✅ MEJORADO: Procesar respuesta con mejor manejo de imágenes
      const products = result.products?.product || [];
      
      logger.debug('[ALIEXPRESS-AFFILIATE-API] Processing API response', {
        productsCount: products.length,
        firstProductId: products[0]?.product_id,
        firstProductTitle: products[0]?.product_title?.substring(0, 50),
        hasMainImage: !!products[0]?.product_main_image_url,
        hasSmallImages: !!products[0]?.product_small_image_urls
      });
      
      return products.map((p: any) => {
        // ✅ MEJORADO: Normalizar productSmallImageUrls - puede venir como array, string o objeto
        let smallImages: string[] = [];
        if (p.product_small_image_urls) {
          if (Array.isArray(p.product_small_image_urls)) {
            smallImages = p.product_small_image_urls.filter(Boolean);
          } else if (Array.isArray(p.product_small_image_urls.string)) {
            smallImages = p.product_small_image_urls.string.filter(Boolean);
          } else if (typeof p.product_small_image_urls === 'string') {
            smallImages = [p.product_small_image_urls];
          } else if (p.product_small_image_urls.string) {
            smallImages = [p.product_small_image_urls.string].filter(Boolean);
          }
        }
        
        return {
          productId: String(p.product_id || ''),
          productTitle: p.product_title || '',
          productMainImageUrl: p.product_main_image_url || '',
          productSmallImageUrls: smallImages,
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
        };
      });
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

