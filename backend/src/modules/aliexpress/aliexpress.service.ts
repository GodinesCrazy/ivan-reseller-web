/**
 * Servicio para integración con AliExpress Affiliate API
 * 
 * ⚠️ IMPORTANTE: AliExpress Affiliate API does NOT support OAuth interactive login.
 * The API works EXCLUSIVELY with:
 * - app_key
 * - app_secret
 * - sign (signature)
 * - timestamp (YYYYMMDDHHmmss)
 * 
 * All requests must be signed according to AliExpress TOP API specification.
 * No user login, authorization flow, or access_token is required.
 */

import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';
import type {
  AliExpressAffiliateLinkParams,
  AliExpressAffiliateLinkResponse,
  AliExpressProductSearchParams,
  AliExpressProductSearchResponse,
} from './aliexpress.types';

class AliExpressService {
  private appKey: string;
  private appSecret: string;
  private trackingId: string;
  private apiBaseUrl: string;
  private environment: 'production' | 'test';
  private axiosInstance: AxiosInstance;

  constructor() {
    // ✅ FASE 3: Leer EXCLUSIVAMENTE de process.env (Railway)
    this.appKey = (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim();
    this.appSecret = (process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '').trim();
    this.trackingId = (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim();
    this.apiBaseUrl = (process.env.ALIEXPRESS_API_BASE_URL || 'https://api-sg.aliexpress.com/sync').trim();
    this.environment = (process.env.ALIEXPRESS_ENV || 'production') as 'production' | 'test';
    
    // ✅ FASE 4: Logs de inicialización
    console.log('[ALIEXPRESS-AFFILIATE] Service initialized');
    console.log('[ALIEXPRESS-AFFILIATE] app_key present:', !!this.appKey && this.appKey.length > 0);
    console.log('[ALIEXPRESS-AFFILIATE] app_secret present:', !!this.appSecret && this.appSecret.length > 0);
    console.log('[ALIEXPRESS-AFFILIATE] tracking_id:', this.trackingId);
    console.log('[ALIEXPRESS-AFFILIATE] api_base_url:', this.apiBaseUrl);

    this.axiosInstance = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  /**
   * Genera la firma (signature) requerida por AliExpress TOP API
   * Formato: app_secret + sorted_params + app_secret
   * 
   * @param params - Parámetros de la API (sin 'sign')
   * @param signMethod - Método de firma: 'md5' o 'sha256'
   * @returns Firma en hexadecimal mayúsculas
   * 
   * ✅ PÚBLICO: Expuesto para health check y diagnóstico
   */
  public generateSignature(params: Record<string, any>, signMethod: 'md5' | 'sha256' = 'md5'): string {
    // Ordenar parámetros alfabéticamente (excluir 'sign')
    const sortedKeys = Object.keys(params).sort();
    const sortedParams: string[] = [];

    sortedKeys.forEach((key) => {
      if (key !== 'sign' && params[key] !== undefined && params[key] !== null) {
        sortedParams.push(`${key}${params[key]}`);
      }
    });

    // Formato correcto según AliExpress TOP API
    // app_secret + sorted_params + app_secret
    const signString = this.appSecret + sortedParams.join('') + this.appSecret;

    // Generar hash según sign_method
    if (signMethod === 'sha256') {
      return crypto.createHash('sha256').update(signString, 'utf8').digest('hex').toUpperCase();
    } else {
      return crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
    }
  }

  /**
   * Genera timestamp en formato AliExpress TOP API: YYYYMMDDHHmmss
   */
  private generateTimestamp(): string {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  }

  /**
   * Genera un link afiliado para un producto
   * NO requiere access_token - solo app_key, app_secret, sign, timestamp
   */
  async createAffiliateLink(params: AliExpressAffiliateLinkParams): Promise<AliExpressAffiliateLinkResponse> {
    if (!this.appKey || !this.appSecret) {
      throw new Error('ALIEXPRESS_AFFILIATE_APP_KEY y ALIEXPRESS_AFFILIATE_APP_SECRET deben estar configurados');
    }

    try {
      const trackingId = params.trackingId || this.trackingId;
      const timestamp = this.generateTimestamp();

      console.log('[ALIEXPRESS-AFFILIATE] Signing request');
      console.log('[ALIEXPRESS-AFFILIATE] app_key present:', true);
      console.log('[ALIEXPRESS-AFFILIATE] method: aliexpress.affiliate.link.generate');

      logger.info('[AliExpress Affiliate] Generando link afiliado', {
        productId: params.productId,
        trackingId,
        timestamp,
      });

      // Construir parámetros para la API de AliExpress (SIN access_token)
      const apiParams: Record<string, any> = {
        app_key: this.appKey,
        method: 'aliexpress.affiliate.link.generate',
        sign_method: 'md5',
        timestamp,
        format: 'json',
        v: '2.0',
        tracking_id: trackingId,
        source_values: params.productUrl || `https://www.aliexpress.com/item/${params.productId}.html`,
      };

      if (params.promotionName) {
        apiParams.promotion_name = params.promotionName;
      }

      // Generar firma
      const signature = this.generateSignature(apiParams, 'md5');
      apiParams.sign = signature;

      console.log('[ALIEXPRESS-AFFILIATE] sign generated:', signature.substring(0, 16) + '...');

      // Construir form data
      const formData = new URLSearchParams();
      Object.keys(apiParams).forEach(key => {
        const value = apiParams[key];
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });

      // Llamar a la API
      console.log('[ALIEXPRESS-AFFILIATE] API response received');
      const response = await axios.post(this.apiBaseUrl, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data.error_response) {
        const errorMsg = response.data.error_response.msg || 'Error de AliExpress API';
        const errorCode = response.data.error_response.code;
        logger.error('[AliExpress Affiliate] Error de API', {
          errorCode,
          errorMsg,
          response: response.data.error_response,
        });
        throw new Error(`AliExpress API Error [${errorCode}]: ${errorMsg}`);
      }

      const result = response.data.aliexpress_affiliate_link_generate_response?.result;
      if (!result || !result.promotion_link) {
        throw new Error('No se pudo generar el link afiliado - respuesta inválida');
      }

      logger.info('[AliExpress Affiliate] Link afiliado generado exitosamente', {
        productId: params.productId,
        trackingId,
        promotionUrl: result.promotion_link.substring(0, 50) + '...',
      });

      return {
        promotionUrl: result.promotion_link,
        trackingId,
        productId: params.productId,
        success: true,
      };
    } catch (error: any) {
      logger.error('[AliExpress Affiliate] Error al generar link afiliado', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });

      return {
        promotionUrl: '',
        trackingId: params.trackingId || this.trackingId,
        productId: params.productId,
        success: false,
        errorMessage: error.message,
      };
    }
  }

  /**
   * Busca productos en AliExpress
   * NO requiere access_token - solo app_key, app_secret, sign, timestamp
   */
  async searchProducts(params: AliExpressProductSearchParams): Promise<AliExpressProductSearchResponse> {
    if (!this.appKey || !this.appSecret) {
      throw new Error('ALIEXPRESS_AFFILIATE_APP_KEY y ALIEXPRESS_AFFILIATE_APP_SECRET deben estar configurados');
    }

    try {
      const timestamp = this.generateTimestamp();

      console.log('[ALIEXPRESS-AFFILIATE] Signing request');
      console.log('[ALIEXPRESS-AFFILIATE] app_key present:', true);
      console.log('[ALIEXPRESS-AFFILIATE] method: aliexpress.affiliate.product.query');

      const apiParams: Record<string, any> = {
        app_key: this.appKey,
        method: 'aliexpress.affiliate.product.query',
        sign_method: 'md5',
        timestamp,
        format: 'json',
        v: '2.0',
        keywords: params.keywords,
        page_no: params.pageNo || 1,
        page_size: params.pageSize || 20,
      };

      if (params.categoryId) {
        apiParams.category_id = params.categoryId;
      }
      if (params.minPrice) {
        apiParams.min_price = params.minPrice;
      }
      if (params.maxPrice) {
        apiParams.max_price = params.maxPrice;
      }
      if (params.sort) {
        apiParams.sort = params.sort;
      }

      // Generar firma
      const signature = this.generateSignature(apiParams, 'md5');
      apiParams.sign = signature;

      console.log('[ALIEXPRESS-AFFILIATE] sign generated:', signature.substring(0, 16) + '...');

      // Construir form data
      const formData = new URLSearchParams();
      Object.keys(apiParams).forEach(key => {
        const value = apiParams[key];
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });

      console.log('[ALIEXPRESS-AFFILIATE] API response received');
      const response = await axios.post(this.apiBaseUrl, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data.error_response) {
        const errorMsg = response.data.error_response.msg || 'Error de AliExpress API';
        const errorCode = response.data.error_response.code;
        logger.error('[AliExpress Affiliate] Error de API', {
          errorCode,
          errorMsg,
        });
        throw new Error(`AliExpress API Error [${errorCode}]: ${errorMsg}`);
      }

      // Extraer requestId de la respuesta (puede estar en diferentes ubicaciones)
      const requestId = 
        response.data.request_id || 
        response.data.requestId || 
        response.data.trace_id ||
        response.data.aliexpress_affiliate_product_query_response?.request_id ||
        response.data.aliexpress_affiliate_product_query_response?.requestId ||
        response.data.aliexpress_affiliate_product_query_response?.trace_id ||
        undefined;

      const result = response.data.aliexpress_affiliate_product_query_response?.result;
      if (!result) {
        return {
          products: [],
          totalResults: 0,
          pageNo: params.pageNo || 1,
          pageSize: params.pageSize || 20,
          hasMore: false,
          requestId,
        };
      }

      const products = (result.products?.product || []).map((p: any) => ({
        productId: p.product_id,
        productTitle: p.product_title,
        productUrl: p.product_url,
        productImageUrl: p.product_main_image_url,
        originalPrice: p.original_price,
        salePrice: p.sale_price,
        discount: p.discount,
        currency: p.currency_code,
        commissionRate: p.commission_rate,
        commission: p.commission,
        shopUrl: p.shop_url,
        shopName: p.shop_name,
      }));

      return {
        products,
        totalResults: result.total_results || 0,
        pageNo: params.pageNo || 1,
        pageSize: params.pageSize || 20,
        hasMore: (params.pageNo || 1) * (params.pageSize || 20) < (result.total_results || 0),
        requestId,
      };
    } catch (error: any) {
      logger.error('[AliExpress Affiliate] Error al buscar productos', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw error;
    }
  }
}

export default new AliExpressService();
