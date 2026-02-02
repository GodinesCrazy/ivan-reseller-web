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
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

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
      endpoint: this.ENDPOINT_LEGACY,
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
   * ✅ NUEVO: Cargar access token desde base de datos
   */
  async loadTokenFromDatabase(): Promise<void> {
    try {
      const { prisma } = await import('../config/database');
      const tokenRecord = await prisma.aliExpressToken.findUnique({
        where: { id: 'global' },
      });

      if (tokenRecord && tokenRecord.expiresAt > new Date()) {
        this.accessToken = tokenRecord.accessToken;
        this.tokenExpiresAt = tokenRecord.expiresAt;
        logger.info('[ALIEXPRESS-AUTH] Token loaded from database', {
          expiresAt: tokenRecord.expiresAt.toISOString(),
          tokenPreview: `${tokenRecord.accessToken.substring(0, 10)}...`,
        });
      } else if (tokenRecord) {
        logger.warn('[ALIEXPRESS-AUTH] Token in database is expired', {
          expiresAt: tokenRecord.expiresAt.toISOString(),
        });
      } else {
        logger.info('[ALIEXPRESS-AUTH] No token found in database');
      }
    } catch (error: any) {
      logger.error('[ALIEXPRESS-AUTH] Failed to load token from database', {
        error: error.message,
      });
    }
  }

  /**
   * ✅ NUEVO: Obtener access token válido (verificar expiración)
   */
  async getAccessToken(): Promise<string | null> {
    // Si hay token y no está expirado, retornarlo
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }
    
    // Intentar cargar desde base de datos
    await this.loadTokenFromDatabase();
    
    // Si ahora hay token válido, retornarlo
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }
    
    // Si está expirado o no hay token, intentar obtenerlo desde el servicio principal
    // Note: AliExpress Affiliate API doesn't use OAuth tokens - uses signature-based auth
    // El token se maneja internamente si está disponible, pero no es requerido para Affiliate API
    if (this.credentials) {
      try {
        // Affiliate API no usa OAuth - usa signature auth con app_key/app_secret
        // El token se maneja internamente si está disponible, pero no es requerido
        logger.debug('[ALIEXPRESS-AUTH] Affiliate API usa signature auth (no OAuth)');
      } catch (error: any) {
        logger.warn('[ALIEXPRESS-AUTH] Note: Affiliate API usa signature auth', {
          error: error.message
        });
      }
    }
    
    // Retornar token si existe (puede ser null - Affiliate API no lo requiere)
    return this.accessToken;
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

    // ✅ CRÍTICO: Obtener access token OAuth si está disponible
    const accessToken = await this.getAccessToken();
    if (accessToken) {
      params.access_token = accessToken;
      logger.info('[ALIEXPRESS-AUTH] Using OAuth access token', {
        tokenPreview: `${accessToken.substring(0, 10)}...`,
        method
      });
    } else {
      logger.warn('[ALIEXPRESS-AUTH] No OAuth token available - using app_key only', {
        method,
        note: 'Some API methods may require OAuth token. Use /api/aliexpress/auth to authenticate.'
      });
    }

    // Parámetros comunes para todas las peticiones
    // ✅ MEJORADO: Formato de timestamp correcto para AliExpress TOP API
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    
    const commonParams: Record<string, any> = {
      method,
      app_key: this.credentials.appKey,
      timestamp, // Formato: YYYYMMDDHHmmss
      format: 'json',
      v: '2.0',
      sign_method: 'md5',
    };

    // ✅ CRÍTICO: Agregar access_token a commonParams si existe (debe estar en la firma)
    if (accessToken) {
      commonParams.access_token = accessToken;
    }

    // Combinar parámetros comunes con específicos
    const allParams: Record<string, any> = { ...commonParams, ...params };

    // ✅ CRÍTICO: Calcular firma ANTES de agregar sign (sign no debe estar en el cálculo)
    const sign = this.calculateSign(allParams, this.credentials.appSecret, commonParams.sign_method as 'md5' | 'sha256');
    allParams.sign = sign;

    // Agregar trackingId si está disponible
    if (this.credentials.trackingId && !allParams.tracking_id) {
      allParams.tracking_id = this.credentials.trackingId;
    }

    const requestStartTime = Date.now();
    
    // ✅ LOG OBLIGATORIO: ANTES de la llamada HTTP
    const requestPayloadSize = JSON.stringify(allParams).length;
    logger.info('[ALIEXPRESS-AFFILIATE-API] Request →', {
      endpoint: this.endpoint,
      method: method,
      httpMethod: 'POST',
      query: params.keywords || 'N/A',
      timestamp: allParams.timestamp,
      app_key: allParams.app_key?.substring(0, 8) + '...',
      params_count: Object.keys(allParams).length,
      payloadSize: `${requestPayloadSize} bytes`,
      timeout: '30000ms (axios)',
      hasCredentials: !!this.credentials,
      credentialsSandbox: this.credentials?.sandbox
    });

    try {
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

      const elapsedMs = Date.now() - requestStartTime;

      // La respuesta de TOP API viene en formato: { response: { result: { ... } } }
      if (response.data.error_response) {
        const error = response.data.error_response;
        const errorCode = error.code || 'UNKNOWN';
        const errorMsg = error.msg || error.sub_msg || 'Unknown error';
        
        // ✅ LOG OBLIGATORIO: Error de la API
        logger.error('[ALIEXPRESS-AFFILIATE-API] Error ←', {
          status: response.status,
          code: errorCode,
          message: errorMsg,
          elapsedMs: `${elapsedMs}ms`,
          endpoint: this.endpoint,
          method: method,
          errorType: 'api_error_response'
        });
        
        throw new Error(`AliExpress API Error: ${errorMsg} (Code: ${errorCode})`);
      }

      const result = response.data[`${method.replace(/\./g, '_')}_response`] || response.data.response?.result;
      
      if (!result) {
        // ✅ LOG OBLIGATORIO: Formato inesperado
        logger.error('[ALIEXPRESS-AFFILIATE-API] Error ←', {
          status: response.status,
          code: 'UNEXPECTED_FORMAT',
          message: 'Unexpected response format from AliExpress API',
          elapsedMs: `${elapsedMs}ms`,
          endpoint: this.endpoint,
          method: method,
          errorType: 'unexpected_response_format',
          responseKeys: Object.keys(response.data || {})
        });
        throw new Error('Unexpected response format from AliExpress API');
      }

      // ✅ LOG OBLIGATORIO: Éxito
      const resultSize = JSON.stringify(result).length;
      logger.info('[ALIEXPRESS-AFFILIATE-API] Success ←', {
        status: response.status,
        elapsedMs: `${elapsedMs}ms`,
        endpoint: this.endpoint,
        method: method,
        resultSize: `${resultSize} bytes`,
        hasData: !!result
      });

      return result;
    } catch (error: any) {
      const elapsedMs = Date.now() - requestStartTime;
      
      if (axios.isAxiosError(error)) {
        const httpStatus = error.response?.status;
        const statusText = error.response?.statusText;
        const errorData = error.response?.data;
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
        const isNetworkError = error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT';
        
        // ✅ LOG OBLIGATORIO: Error HTTP detallado
        logger.error('[ALIEXPRESS-AFFILIATE-API] Error ←', {
          status: httpStatus || 'NO_STATUS',
          statusText: statusText || 'NO_STATUS_TEXT',
          code: error.code || 'UNKNOWN',
          message: error.message,
          elapsedMs: `${elapsedMs}ms`,
          endpoint: this.endpoint,
          method: method,
          errorType: isTimeout ? 'timeout' : isNetworkError ? 'network_error' : 'http_error',
          isTimeout,
          isNetworkError,
          errorResponseData: errorData ? (typeof errorData === 'object' ? JSON.stringify(errorData).substring(0, 200) : String(errorData).substring(0, 200)) : undefined
        });
        
        // Clasificar el error para mejor manejo
        if (isTimeout) {
          throw new Error(`AliExpress API timeout after ${elapsedMs}ms: ${error.message}`);
        } else if (isNetworkError) {
          throw new Error(`AliExpress API network error: ${error.message}`);
        } else if (httpStatus === 401 || httpStatus === 403) {
          throw new Error(`AliExpress API authentication error (${httpStatus}): ${errorData?.msg || error.message}`);
        } else if (httpStatus === 429) {
          throw new Error(`AliExpress API rate limit exceeded (429): ${errorData?.msg || error.message}`);
        } else {
          throw new Error(`AliExpress API request failed (${httpStatus || 'NO_STATUS'}): ${error.message}`);
        }
      }
      
      // ✅ LOG OBLIGATORIO: Error no-HTTP
      logger.error('[ALIEXPRESS-AFFILIATE-API] Error ←', {
        status: 'NO_HTTP_RESPONSE',
        code: error?.code || 'UNKNOWN',
        message: error?.message || String(error),
        elapsedMs: `${elapsedMs}ms`,
        endpoint: this.endpoint,
        method: method,
        errorType: 'non_http_error',
        stack: error?.stack?.substring(0, 500)
      });
      
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

