/**
 * Servicio para integración con AliExpress Affiliate API
 */

import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';
import prisma from '../../config/database';
import { encrypt, decrypt } from '../../utils/encryption';
import type {
  AliExpressOAuthTokenResponse,
  AliExpressTokenData,
  AliExpressAffiliateLinkParams,
  AliExpressAffiliateLinkResponse,
  AliExpressProductSearchParams,
  AliExpressProductSearchResponse,
} from './aliexpress.types';

class AliExpressService {
  private appKey: string;
  private appSecret: string;
  private callbackUrl: string;
  private trackingId: string;
  private apiBaseUrl: string;
  private environment: 'production' | 'test';
  private axiosInstance: AxiosInstance;

  constructor() {
    // Use process.env directly as fallback if env object doesn't have it
    // This ensures we read from Railway environment variables correctly
    this.appKey = env.ALIEXPRESS_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '';
    this.appSecret = env.ALIEXPRESS_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '';
    this.callbackUrl = env.ALIEXPRESS_CALLBACK_URL || process.env.ALIEXPRESS_CALLBACK_URL || 'https://www.ivanreseller.com/api/aliexpress/callback';
    this.trackingId = env.ALIEXPRESS_TRACKING_ID || process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller';
    this.apiBaseUrl = env.ALIEXPRESS_API_BASE_URL || process.env.ALIEXPRESS_API_BASE_URL || 'https://api-sg.aliexpress.com/sync';
    this.environment = (env.ALIEXPRESS_ENV || process.env.ALIEXPRESS_ENV || 'production') as 'production' | 'test';
    
    // Log presence (safe - no values)
    console.log('[AliExpress Service] ALIEXPRESS_APP_KEY present:', !!this.appKey && this.appKey.trim().length > 0);
    console.log('[AliExpress Service] ALIEXPRESS_APP_SECRET present:', !!this.appSecret && this.appSecret.trim().length > 0);

    this.axiosInstance = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Genera un state aleatorio para protección CSRF en OAuth
   */
  generateOAuthState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Valida el state recibido en el callback OAuth
   */
  validateOAuthState(state: string, storedState?: string): boolean {
    if (!state || !storedState) {
      return false;
    }
    // Comparación segura de strings (deben tener la misma longitud)
    if (state.length !== storedState.length) {
      return false;
    }
    try {
      return crypto.timingSafeEqual(Buffer.from(state), Buffer.from(storedState));
    } catch {
      return false;
    }
  }

  /**
   * Intercambia el código de autorización por un token de acceso
   */
  async exchangeCodeForToken(code: string): Promise<AliExpressTokenData> {
    if (!this.appKey || !this.appSecret) {
      throw new Error('ALIEXPRESS_APP_KEY y ALIEXPRESS_APP_SECRET deben estar configurados');
    }

    try {
      // Construir parámetros para el token request
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('client_id', this.appKey);
      params.append('client_secret', this.appSecret);
      params.append('redirect_uri', this.callbackUrl);

      logger.info('[AliExpress] Intercambiando code por token...', {
        appKey: this.appKey.substring(0, 8) + '...',
        callbackUrl: this.callbackUrl,
      });

      // Llamar a la API de AliExpress para obtener el token
      const response = await axios.post<AliExpressOAuthTokenResponse>(
        `${this.apiBaseUrl}/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokenData = response.data;
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

      logger.info('[AliExpress] Token obtenido exitosamente', {
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in,
        hasRefreshToken: !!tokenData.refresh_token,
      });

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
        tokenType: tokenData.token_type || 'Bearer',
        scope: tokenData.scope,
      };
    } catch (error: any) {
      logger.error('[AliExpress] Error al intercambiar code por token', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Error al obtener token de AliExpress: ${error.message}`);
    }
  }

  /**
   * Guarda el token de forma segura en la base de datos (encriptado)
   */
  async saveToken(tokenData: AliExpressTokenData, state?: string): Promise<void> {
    try {
      // Encriptar tokens antes de guardar
      const encryptedAccessToken = encrypt(tokenData.accessToken);
      const encryptedRefreshToken = tokenData.refreshToken
        ? encrypt(tokenData.refreshToken)
        : null;

      // Eliminar tokens antiguos (solo mantener uno activo)
      await prisma.aliExpressToken.deleteMany({});

      // Guardar nuevo token
      await prisma.aliExpressToken.create({
        data: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: tokenData.expiresAt,
          tokenType: tokenData.tokenType,
          scope: tokenData.scope,
          state: state || null,
        },
      });

      logger.info('[AliExpress] Token guardado exitosamente en base de datos');
    } catch (error: any) {
      logger.error('[AliExpress] Error al guardar token', {
        error: error.message,
      });
      throw new Error(`Error al guardar token: ${error.message}`);
    }
  }

  /**
   * Obtiene el token activo de la base de datos (desencriptado)
   */
  async getActiveToken(): Promise<AliExpressTokenData | null> {
    try {
      const tokenRecord = await prisma.aliExpressToken.findFirst({
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!tokenRecord) {
        return null;
      }

      // Verificar si el token está expirado
      if (tokenRecord.expiresAt < new Date()) {
        logger.warn('[AliExpress] Token expirado, se requiere refresh');
        return null;
      }

      // Desencriptar tokens
      const accessToken = decrypt(tokenRecord.accessToken);
      const refreshToken = tokenRecord.refreshToken
        ? decrypt(tokenRecord.refreshToken)
        : undefined;

      return {
        accessToken,
        refreshToken,
        expiresAt: tokenRecord.expiresAt,
        tokenType: tokenRecord.tokenType,
        scope: tokenRecord.scope || undefined,
      };
    } catch (error: any) {
      logger.error('[AliExpress] Error al obtener token', {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Refresca el token de acceso usando el refresh token
   */
  async refreshToken(): Promise<AliExpressTokenData> {
    const currentToken = await this.getActiveToken();
    if (!currentToken?.refreshToken) {
      throw new Error('No hay refresh token disponible');
    }

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', currentToken.refreshToken);
      params.append('client_id', this.appKey);
      params.append('client_secret', this.appSecret);

      const response = await axios.post<AliExpressOAuthTokenResponse>(
        `${this.apiBaseUrl}/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokenData = response.data;
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

      const newTokenData: AliExpressTokenData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || currentToken.refreshToken,
        expiresAt,
        tokenType: tokenData.token_type || 'Bearer',
        scope: tokenData.scope,
      };

      await this.saveToken(newTokenData);

      logger.info('[AliExpress] Token refrescado exitosamente');
      return newTokenData;
    } catch (error: any) {
      logger.error('[AliExpress] Error al refrescar token', {
        error: error.message,
        status: error.response?.status,
      });
      throw new Error(`Error al refrescar token: ${error.message}`);
    }
  }

  /**
   * Obtiene un token válido (activo o refrescado si es necesario)
   */
  async getValidToken(): Promise<string> {
    let tokenData = await this.getActiveToken();

    // Si no hay token o está expirado, intentar refrescar
    if (!tokenData || tokenData.expiresAt < new Date()) {
      if (tokenData?.refreshToken) {
        logger.info('[AliExpress] Token expirado, refrescando...');
        try {
          tokenData = await this.refreshToken();
        } catch (refreshError: any) {
          logger.error('[AliExpress] Error al refrescar token', {
            error: refreshError.message,
          });
          throw new Error('No hay token válido disponible. Se requiere autenticación OAuth.');
        }
      } else {
        throw new Error('No hay token válido disponible. Se requiere autenticación OAuth.');
      }
    }

    return tokenData.accessToken;
  }

  /**
   * Genera un link afiliado para un producto
   */
  async createAffiliateLink(params: AliExpressAffiliateLinkParams): Promise<AliExpressAffiliateLinkResponse> {
    if (!this.appKey || !this.appSecret) {
      throw new Error('ALIEXPRESS_APP_KEY y ALIEXPRESS_APP_SECRET deben estar configurados');
    }

    try {
      const accessToken = await this.getValidToken();
      const trackingId = params.trackingId || this.trackingId;

      logger.info('[AliExpress] Generando link afiliado', {
        productId: params.productId,
        trackingId,
      });

      // ✅ CORREGIDO: Formato de timestamp correcto para AliExpress TOP API
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

      // Construir parámetros para la API de AliExpress
      const apiParams: any = {
        app_key: this.appKey,
        access_token: accessToken,
        method: 'aliexpress.affiliate.link.generate',
        sign_method: 'md5', // ✅ CORREGIDO: Usar MD5 por defecto
        timestamp, // ✅ CORREGIDO: Formato YYYYMMDDHHmmss
        format: 'json',
        v: '2.0',
        tracking_id: trackingId,
        source_values: params.productUrl || `https://www.aliexpress.com/item/${params.productId}.html`,
      };

      if (params.promotionName) {
        apiParams.promotion_name = params.promotionName;
      }

      // ✅ CORREGIDO: Pasar sign_method al método de firma
      const signature = this.generateSignature(apiParams, apiParams.sign_method);
      apiParams.sign = signature;

      // ✅ CORREGIDO: Usar application/x-www-form-urlencoded como en el otro servicio
      const formData = new URLSearchParams();
      Object.keys(apiParams).forEach(key => {
        const value = apiParams[key];
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });

      // Llamar a la API
      const response = await axios.post(this.apiBaseUrl, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data.error_response) {
        throw new Error(response.data.error_response.msg || 'Error de AliExpress API');
      }

      const result = response.data.aliexpress_affiliate_link_generate_response?.result;
      if (!result || !result.promotion_link) {
        throw new Error('No se pudo generar el link afiliado');
      }

      logger.info('[AliExpress] Link afiliado generado exitosamente', {
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
      logger.error('[AliExpress] Error al generar link afiliado', {
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
   * Genera la firma (signature) requerida por AliExpress API
   * ✅ CORREGIDO: Formato correcto según documentación AliExpress TOP API
   * Formato: app_secret + sorted_params + app_secret
   */
  private generateSignature(params: any, signMethod: 'md5' | 'sha256' = 'md5'): string {
    // Ordenar parámetros alfabéticamente (excluir 'sign')
    const sortedKeys = Object.keys(params).sort();
    const sortedParams: string[] = [];

    sortedKeys.forEach((key) => {
      if (key !== 'sign' && params[key] !== undefined && params[key] !== null) {
        sortedParams.push(`${key}${params[key]}`);
      }
    });

    // ✅ CORREGIDO: Formato correcto según AliExpress TOP API
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
   * Busca productos en AliExpress
   */
  async searchProducts(params: AliExpressProductSearchParams): Promise<AliExpressProductSearchResponse> {
    if (!this.appKey || !this.appSecret) {
      throw new Error('ALIEXPRESS_APP_KEY y ALIEXPRESS_APP_SECRET deben estar configurados');
    }

    try {
      const accessToken = await this.getValidToken();

      // ✅ CORREGIDO: Formato de timestamp correcto para AliExpress TOP API
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

      const apiParams: any = {
        app_key: this.appKey,
        access_token: accessToken,
        method: 'aliexpress.affiliate.product.query',
        sign_method: 'md5', // ✅ CORREGIDO: Usar MD5 por defecto (más compatible)
        timestamp, // ✅ CORREGIDO: Formato YYYYMMDDHHmmss (no ISO)
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

      // ✅ CORREGIDO: Pasar sign_method al método de firma
      const signature = this.generateSignature(apiParams, apiParams.sign_method);
      apiParams.sign = signature;

      // ✅ CORREGIDO: Usar application/x-www-form-urlencoded
      const formData = new URLSearchParams();
      Object.keys(apiParams).forEach(key => {
        const value = apiParams[key];
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });

      const response = await axios.post(this.apiBaseUrl, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data.error_response) {
        throw new Error(response.data.error_response.msg || 'Error de AliExpress API');
      }

      const result = response.data.aliexpress_affiliate_product_query_response?.result;
      if (!result) {
        return {
          products: [],
          totalResults: 0,
          pageNo: params.pageNo || 1,
          pageSize: params.pageSize || 20,
          hasMore: false,
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
      };
    } catch (error: any) {
      logger.error('[AliExpress] Error al buscar productos', {
        error: error.message,
        status: error.response?.status,
      });
      throw error;
    }
  }
}

export default new AliExpressService();

