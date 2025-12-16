/**
 * AliExpress Dropshipping API Service
 * 
 * Implementa la AliExpress Dropshipping API oficial
 * para obtener detalles de productos y crear órdenes automatizadas
 * 
 * @see https://developer.alibaba.com/help/en/portal
 * @see instalarAPi.txt - Documentación técnica de la API
 */

import crypto from 'crypto';
import logger from '../config/logger';
// ✅ PRODUCTION READY: Usar cliente HTTP centralizado con timeout
import { httpClient, type AxiosInstance } from '../config/http-client';
import type { AliExpressDropshippingCredentials } from '../types/api-credentials.types';

// Tipos de datos de la API
export interface DropshippingProductInfo {
  productId: string;
  productTitle: string;
  productImages: string[];
  salePrice: number;
  originalPrice: number;
  currency: string;
  stock: number;
  skus?: DropshippingSKU[];
  shippingInfo?: {
    availableShippingMethods: ShippingMethod[];
    estimatedDeliveryDays?: number;
  };
}

export interface DropshippingSKU {
  skuId: string;
  attributes: Record<string, string>; // e.g., { Color: 'Black', Size: 'M' }
  salePrice: number;
  stock: number;
  imageUrl?: string;
}

export interface ShippingMethod {
  methodId: string;
  methodName: string;
  cost: number;
  estimatedDays: number;
}

export interface PlaceOrderRequest {
  productId: string;
  skuId?: string;
  quantity: number;
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state?: string;
    zipCode: string;
    country: string; // ISO code: CL, US, etc.
    phoneNumber: string;
    email?: string;
  };
  shippingMethodId?: string;
  buyerMessage?: string;
}

export interface PlaceOrderResponse {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  currency: string;
  status: string; // e.g., 'WAIT_BUYER_PAY'
  estimatedDelivery?: string;
  paymentInfo?: {
    paymentUrl?: string;
    paymentDeadline?: string;
  };
}

export interface TrackingInfo {
  orderId: string;
  orderNumber: string;
  status: string;
  trackingNumber?: string;
  shippingCompany?: string;
  events: TrackingEvent[];
}

export interface TrackingEvent {
  date: string;
  status: string;
  description: string;
  location?: string;
}

export class AliExpressDropshippingAPIService {
  private client: AxiosInstance;
  private credentials: AliExpressDropshippingCredentials | null = null;

  // Endpoints base de la API
  private readonly ENDPOINT_LEGACY = 'https://gw.api.taobao.com/router/rest';
  private readonly ENDPOINT_NEW = 'https://api-sg.aliexpress.com/sync';
  
  private endpoint: string = this.ENDPOINT_LEGACY;

  constructor() {
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  /**
   * Configurar credenciales
   */
  setCredentials(credentials: AliExpressDropshippingCredentials): void {
    this.credentials = credentials;
    if (credentials.sandbox) {
      this.endpoint = this.ENDPOINT_NEW;
    }
  }

  /**
   * Calcular firma (sign) para autenticación
   */
  private calculateSign(params: Record<string, any>, appSecret: string, signMethod: 'md5' | 'sha256' = 'md5'): string {
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
   * Realizar petición a la API con autenticación OAuth
   */
  private async makeRequest(method: string, params: Record<string, any>): Promise<any> {
    if (!this.credentials) {
      throw new Error('AliExpress Dropshipping API credentials not configured');
    }

    if (!this.credentials.accessToken) {
      throw new Error('AliExpress Dropshipping API access token not configured. OAuth authorization required.');
    }

    const commonParams = {
      method,
      app_key: this.credentials.appKey,
      access_token: this.credentials.accessToken, // ✅ OAuth token requerido
      timestamp: new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + '00',
      format: 'json',
      v: '2.0',
      sign_method: 'md5',
    };

    const allParams: Record<string, any> = { ...commonParams, ...params };
    const sign = this.calculateSign(allParams, this.credentials.appSecret, commonParams.sign_method as 'md5' | 'sha256');
    allParams.sign = sign;

    try {
      logger.debug('[ALIEXPRESS-DROPSHIPPING-API] Making request', {
        method,
        endpoint: this.endpoint,
        hasAccessToken: !!this.credentials.accessToken,
      });

      const response = await this.client.post(this.endpoint, allParams, {
        params: allParams,
      });

      if (response.data.error_response) {
        const error = response.data.error_response;
        
        // Manejar token expirado
        if (error.code === '41' || error.code === '40001' || error.msg?.includes('Invalid session')) {
          logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Access token expired or invalid', {
            errorCode: error.code,
            errorMsg: error.msg,
          });
          throw new Error('ACCESS_TOKEN_EXPIRED');
        }
        
        throw new Error(`AliExpress Dropshipping API Error: ${error.msg || error.sub_msg || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
      }

      const result = response.data[`${method.replace(/\./g, '_')}_response`] || response.data.response?.result;
      
      if (!result) {
        logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Unexpected response format', {
          method,
          responseData: response.data,
        });
        throw new Error('Unexpected response format from AliExpress Dropshipping API');
      }

      return result;
    } catch (error: any) {
      if (error.message === 'ACCESS_TOKEN_EXPIRED') {
        throw error; // Re-lanzar error de token expirado
      }
      
      if (axios.isAxiosError(error)) {
        logger.error('[ALIEXPRESS-DROPSHIPPING-API] Request failed', {
          method,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        });
        throw new Error(`AliExpress Dropshipping API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Obtener información de producto para dropshipping
   * (Equivalente a AliexpressOfferDsProductSimplequeryRequest)
   */
  async getProductInfo(productId: string, params?: {
    localCountry?: string; // ISO code: CL, US, etc.
    localLanguage?: string; // en, es, etc.
  }): Promise<DropshippingProductInfo> {
    try {
      logger.info('[ALIEXPRESS-DROPSHIPPING-API] Getting product info', {
        productId,
        localCountry: params?.localCountry,
      });

      const apiParams: Record<string, any> = {
        product_id: productId,
      };

      if (params?.localCountry) apiParams.local_country = params.localCountry;
      if (params?.localLanguage) apiParams.local_language = params.localLanguage;

      // El método exacto puede variar según la versión de la API
      // Intentar métodos comunes
      let result;
      try {
        result = await this.makeRequest('aliexpress.offer.ds.product.simplequery', apiParams);
      } catch (error: any) {
        // Fallback a otro método posible
        if (error.message?.includes('method not found') || error.message?.includes('invalid method')) {
          logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Primary method failed, trying alternative', {
            productId,
          });
          result = await this.makeRequest('aliexpress.dropshipping.product.info.get', apiParams);
        } else {
          throw error;
        }
      }

      // Procesar respuesta
      const product = result.product || result;
      
      return {
        productId: String(product.product_id || productId),
        productTitle: product.product_title || '',
        productImages: Array.isArray(product.product_images?.string) 
          ? product.product_images.string 
          : (product.product_images ? [product.product_images] : []),
        salePrice: parseFloat(product.sale_price || product.price || '0'),
        originalPrice: parseFloat(product.original_price || product.list_price || '0'),
        currency: product.currency || 'USD',
        stock: parseInt(product.stock || product.available_stock || '0', 10),
        skus: product.skus?.sku ? product.skus.sku.map((s: any) => ({
          skuId: String(s.sku_id || ''),
          attributes: s.attributes || {},
          salePrice: parseFloat(s.sale_price || s.price || '0'),
          stock: parseInt(s.stock || '0', 10),
          imageUrl: s.image_url,
        })) : undefined,
        shippingInfo: product.shipping_info ? {
          availableShippingMethods: product.shipping_info.methods?.method?.map((m: any) => ({
            methodId: String(m.method_id || ''),
            methodName: m.method_name || '',
            cost: parseFloat(m.cost || '0'),
            estimatedDays: parseInt(m.estimated_days || '0', 10),
          })) || [],
          estimatedDeliveryDays: product.shipping_info.estimated_days 
            ? parseInt(product.shipping_info.estimated_days, 10) 
            : undefined,
        } : undefined,
      };
    } catch (error: any) {
      logger.error('[ALIEXPRESS-DROPSHIPPING-API] Get product info failed', {
        error: error.message,
        productId,
      });
      throw error;
    }
  }

  /**
   * Crear orden (Place Order)
   */
  async placeOrder(request: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    try {
      logger.info('[ALIEXPRESS-DROPSHIPPING-API] Placing order', {
        productId: request.productId,
        skuId: request.skuId,
        quantity: request.quantity,
        country: request.shippingAddress.country,
      });

      const apiParams: Record<string, any> = {
        product_id: request.productId,
        quantity: request.quantity,
      };

      if (request.skuId) apiParams.sku_id = request.skuId;
      if (request.shippingMethodId) apiParams.shipping_method_id = request.shippingMethodId;
      if (request.buyerMessage) apiParams.buyer_message = request.buyerMessage;

      // Dirección de envío
      apiParams.receiver_name = request.shippingAddress.fullName;
      apiParams.receiver_address = request.shippingAddress.addressLine1;
      if (request.shippingAddress.addressLine2) {
        apiParams.receiver_address2 = request.shippingAddress.addressLine2;
      }
      apiParams.receiver_city = request.shippingAddress.city;
      if (request.shippingAddress.state) {
        apiParams.receiver_state = request.shippingAddress.state;
      }
      apiParams.receiver_zip = request.shippingAddress.zipCode;
      apiParams.receiver_country = request.shippingAddress.country;
      apiParams.receiver_phone = request.shippingAddress.phoneNumber;
      if (request.shippingAddress.email) {
        apiParams.receiver_email = request.shippingAddress.email;
      }

      // El método puede variar según versión
      let result;
      try {
        result = await this.makeRequest('aliexpress.trade.buy.placeorder', apiParams);
      } catch (error: any) {
        if (error.message?.includes('method not found') || error.message?.includes('invalid method')) {
          logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Primary place order method failed, trying alternative');
          result = await this.makeRequest('aliexpress.dropshipping.order.create', apiParams);
        } else {
          throw error;
        }
      }

      const order = result.order || result;

      return {
        orderId: String(order.order_id || ''),
        orderNumber: String(order.order_number || order.order_sn || order.order_id || ''),
        totalAmount: parseFloat(order.total_amount || order.total_price || '0'),
        currency: order.currency || 'USD',
        status: order.status || 'WAIT_BUYER_PAY',
        estimatedDelivery: order.estimated_delivery,
        paymentInfo: order.payment_info ? {
          paymentUrl: order.payment_info.payment_url,
          paymentDeadline: order.payment_info.payment_deadline,
        } : undefined,
      };
    } catch (error: any) {
      logger.error('[ALIEXPRESS-DROPSHIPPING-API] Place order failed', {
        error: error.message,
        request: {
          productId: request.productId,
          quantity: request.quantity,
        },
      });
      throw error;
    }
  }

  /**
   * Obtener información de tracking (Get Tracking Info)
   */
  async getTrackingInfo(orderId: string): Promise<TrackingInfo | null> {
    try {
      logger.info('[ALIEXPRESS-DROPSHIPPING-API] Getting tracking info', {
        orderId,
      });

      const apiParams: Record<string, any> = {
        order_id: orderId,
      };

      let result;
      try {
        result = await this.makeRequest('aliexpress.trade.order.gettrackinginfo', apiParams);
      } catch (error: any) {
        if (error.message?.includes('method not found') || error.message?.includes('invalid method')) {
          logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Primary tracking method failed, trying alternative');
          result = await this.makeRequest('aliexpress.dropshipping.order.tracking.get', apiParams);
        } else {
          throw error;
        }
      }

      const tracking = result.tracking || result;

      if (!tracking) {
        return null;
      }

      return {
        orderId: String(tracking.order_id || orderId),
        orderNumber: String(tracking.order_number || tracking.order_sn || ''),
        status: tracking.status || 'UNKNOWN',
        trackingNumber: tracking.tracking_number,
        shippingCompany: tracking.shipping_company,
        events: Array.isArray(tracking.events?.event) 
          ? tracking.events.event.map((e: any) => ({
              date: e.date || '',
              status: e.status || '',
              description: e.description || '',
              location: e.location,
            }))
          : [],
      };
    } catch (error: any) {
      logger.error('[ALIEXPRESS-DROPSHIPPING-API] Get tracking info failed', {
        error: error.message,
        orderId,
      });
      return null;
    }
  }

  /**
   * 🔥 PASO 2: Generar URL de autorización OAuth
   * 
   * Genera la URL a la que el usuario debe ser redirigido para autorizar la aplicación.
   * 
   * @param redirectUri - URL de callback donde AliExpress redirigirá después de la autorización
   * @param state - Estado para validar la respuesta (opcional, se genera automáticamente si no se proporciona)
   * @param clientId - App Key (Client ID) de AliExpress
   */
  getAuthUrl(redirectUri: string, state?: string, clientId?: string): string {
    const appKey = clientId || this.credentials?.appKey;
    
    if (!appKey) {
      throw new Error('AliExpress Dropshipping API App Key (client_id) is required for OAuth authorization');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      force_auth: 'true',
      client_id: appKey,
      redirect_uri: redirectUri,
      state: state || 'ivanreseller',
    });

    const authUrl = `https://auth.aliexpress.com/oauth/authorize?${params.toString()}`;
    
    logger.info('[ALIEXPRESS-DROPSHIPPING-API] Generated OAuth authorization URL', {
      redirectUri,
      hasState: !!state,
      clientId: appKey.substring(0, 10) + '...',
    });

    return authUrl;
  }

  /**
   * 🔥 PASO 4: Intercambiar authorization code por access token y refresh token
   * 
   * Intercambia el código de autorización recibido en el callback por los tokens OAuth.
   * 
   * @param code - Authorization code recibido en el callback (expira en 10 minutos, solo se usa una vez)
   * @param redirectUri - Mismo redirect_uri usado en getAuthUrl
   * @param clientId - App Key (opcional, usa el configurado si no se proporciona)
   * @param clientSecret - App Secret (opcional, usa el configurado si no se proporciona)
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId?: string,
    clientSecret?: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }> {
    const appKey = clientId || this.credentials?.appKey;
    const appSecret = clientSecret || this.credentials?.appSecret;

    if (!appKey || !appSecret) {
      throw new Error('AliExpress Dropshipping API App Key and App Secret are required for token exchange');
    }

    if (!code || code.trim().length === 0) {
      throw new Error('Authorization code is required');
    }

    logger.info('[ALIEXPRESS-DROPSHIPPING-API] Exchanging authorization code for tokens', {
      codeLength: code.length,
      redirectUri,
      hasAppKey: !!appKey,
      hasAppSecret: !!appSecret,
    });

    try {
      const tokenUrl = 'https://auth.aliexpress.com/oauth/token';
      
      // ✅ PASO 4: Payload según documentación de AliExpress
      const payload = {
        grant_type: 'authorization_code',
        need_refresh_token: 'true',
        client_id: appKey,
        client_secret: appSecret,
        code: code,
        redirect_uri: redirectUri,
      };

      logger.debug('[ALIEXPRESS-DROPSHIPPING-API] Token exchange request', {
        tokenUrl,
        grantType: payload.grant_type,
        hasCode: !!payload.code,
        redirectUri: payload.redirect_uri,
      });

      // ✅ PRODUCTION READY: Usar cliente HTTP centralizado con timeout
      const response = await httpClient.post(tokenUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.data || !response.data.access_token) {
        logger.error('[ALIEXPRESS-DROPSHIPPING-API] Token exchange response missing access_token', {
          responseData: response.data,
        });
        throw new Error('Invalid response from AliExpress OAuth token endpoint: missing access_token');
      }

      logger.info('[ALIEXPRESS-DROPSHIPPING-API] Token exchange successful', {
        hasAccessToken: !!response.data.access_token,
        accessTokenLength: response.data.access_token?.length || 0,
        hasRefreshToken: !!response.data.refresh_token,
        refreshTokenLength: response.data.refresh_token?.length || 0,
        expiresIn: response.data.expires_in,
        refreshExpiresIn: response.data.refresh_expires_in,
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in || 86400, // Default: 24 horas
        refreshExpiresIn: response.data.refresh_expires_in || 2592000, // Default: 30 días
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.error_description || 
                          error.response?.data?.error || 
                          error.message || 
                          'Unknown error';
      
      logger.error('[ALIEXPRESS-DROPSHIPPING-API] Token exchange failed', {
        error: errorMessage,
        status: error.response?.status,
        responseData: error.response?.data,
      });

      throw new Error(`AliExpress OAuth token exchange failed: ${errorMessage}`);
    }
  }

  /**
   * Refrescar access token usando refresh token
   * 
   * Renueva el access_token cuando expire usando el refresh_token.
   * 
   * @param refreshToken - Refresh token guardado previamente
   * @param clientId - App Key (opcional)
   * @param clientSecret - App Secret (opcional)
   */
  async refreshAccessToken(
    refreshToken: string,
    clientId?: string,
    clientSecret?: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }> {
    const appKey = clientId || this.credentials?.appKey;
    const appSecret = clientSecret || this.credentials?.appSecret;

    if (!appKey || !appSecret) {
      throw new Error('AliExpress Dropshipping API App Key and App Secret are required for token refresh');
    }

    if (!refreshToken || refreshToken.trim().length === 0) {
      throw new Error('Refresh token is required');
    }

    logger.info('[ALIEXPRESS-DROPSHIPPING-API] Refreshing access token', {
      hasRefreshToken: !!refreshToken,
      refreshTokenLength: refreshToken.length,
    });

    try {
      const tokenUrl = 'https://auth.aliexpress.com/oauth/token';
      
      const payload = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: appKey,
        client_secret: appSecret,
      };

      // ✅ PRODUCTION READY: Usar cliente HTTP centralizado con timeout
      const response = await httpClient.post(tokenUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.data || !response.data.access_token) {
        logger.error('[ALIEXPRESS-DROPSHIPPING-API] Token refresh response missing access_token', {
          responseData: response.data,
        });
        throw new Error('Invalid response from AliExpress OAuth token endpoint: missing access_token');
      }

      logger.info('[ALIEXPRESS-DROPSHIPPING-API] Token refresh successful', {
        hasAccessToken: !!response.data.access_token,
        hasRefreshToken: !!response.data.refresh_token,
        expiresIn: response.data.expires_in,
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken, // Usar el nuevo o mantener el anterior
        expiresIn: response.data.expires_in || 86400,
        refreshExpiresIn: response.data.refresh_expires_in || 2592000,
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.error_description || 
                          error.response?.data?.error || 
                          error.message || 
                          'Unknown error';
      
      logger.error('[ALIEXPRESS-DROPSHIPPING-API] Token refresh failed', {
        error: errorMessage,
        status: error.response?.status,
        responseData: error.response?.data,
      });

      throw new Error(`AliExpress OAuth token refresh failed: ${errorMessage}`);
    }
  }

  /**
   * 🔥 PASO 6: Obtener información de cuenta de AliExpress
   * 
   * Llamada de prueba para verificar que el access_token funciona correctamente.
   * 
   * @param accessToken - Access token a verificar (opcional, usa el configurado si no se proporciona)
   */
  async getAccountInfo(accessToken?: string): Promise<any> {
    const token = accessToken || this.credentials?.accessToken;
    
    if (!token) {
      throw new Error('Access token is required to get account info');
    }

    logger.info('[ALIEXPRESS-DROPSHIPPING-API] Getting account info', {
      hasAccessToken: !!token,
    });

    try {
      // Usar el método aliexpress.ds.account.get según documentación
      const result = await this.makeRequest('aliexpress.ds.account.get', {});
      
      logger.info('[ALIEXPRESS-DROPSHIPPING-API] Account info retrieved successfully', {
        hasResult: !!result,
      });

      return result;
    } catch (error: any) {
      logger.error('[ALIEXPRESS-DROPSHIPPING-API] Get account info failed', {
        error: error.message,
      });
      throw error;
    }
  }
}

// Exportar instancia singleton
export const aliexpressDropshippingAPIService = new AliExpressDropshippingAPIService();

