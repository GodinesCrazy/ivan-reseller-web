/**
 * AliExpress Dropshipping API Service
 * 
 * Implementa la AliExpress Dropshipping API oficial
 * para obtener detalles de productos y crear órdenes automatizadas
 * 
 * @see https://developer.alibaba.com/help/en/portal
 * @see instalarAPi.txt - Documentación técnica de la API
 */

import { trace } from '../utils/boot-trace';
trace('loading aliexpress-dropshipping-api.service');

import crypto from 'crypto';
import logger from '../config/logger';
import axios, { type AxiosInstance } from 'axios';
// ✅ PRODUCTION READY: Usar cliente HTTP centralizado con timeout
import { httpClient } from '../config/http-client';
import type { AliExpressDropshippingCredentials } from '../types/api-credentials.types';
import { generateTopSignature } from './aliexpress-signature.service';

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
  private readonly TOKEN_CREATE_ENDPOINT =
    (process.env.ALIEXPRESS_DROPSHIPPING_TOKEN_ENDPOINT || '').trim() ||
    'https://api-sg.aliexpress.com/rest/auth/token/create';

  // Endpoints base de la API
  private readonly ENDPOINT_LEGACY = 'https://gw.api.taobao.com/router/rest';
  private readonly ENDPOINT_NEW = 'https://api-sg.aliexpress.com/sync';
  
  private endpoint: string = this.ENDPOINT_LEGACY;

  constructor() {
    // ✅ FIX: Usar axios directamente (ya importado)
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

    const authUrl = `https://api-sg.aliexpress.com/oauth/authorize?${params.toString()}`;
    
    logger.info('[ALIEXPRESS-DROPSHIPPING-API] Generated OAuth authorization URL', {
      redirectUri,
      hasState: !!state,
      clientId: appKey.substring(0, 10) + '...',
    });

    return authUrl;
  }

  /**
   * Intercambiar authorization code por access token y refresh token.
   * AliExpress Open Platform TOP: GET /rest/auth/token/create, params app_key, code, timestamp, sign_method, format, v, sign.
   * redirect_uri MUST NOT be sent. Signature: appSecret + sorted_key_value_pairs + appSecret, SHA256, UPPERCASE hex.
   */
  async exchangeCodeForToken(
    code: string,
    _redirectUri: string,
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

    const startTime = Date.now();
    const tokenUrl = this.TOKEN_CREATE_ENDPOINT;

    const params: Record<string, string> = {
      app_key: appKey,
      code: code.trim(),
      timestamp: Date.now().toString(),
      sign_method: 'sha256',
      format: 'json',
      v: '2.0',
    };

    const sign = generateTopSignature(params, appSecret);
    params.sign = sign;

    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const fullUrl = `${tokenUrl}?${qs}`;
    const urlRedacted = fullUrl.replace(/code=[^&]+/, 'code=***').replace(/sign=[^&]+/, 'sign=***');

    logger.info('[ALIEXPRESS-DROPSHIPPING-API] Token exchange', {
      tokenExchangeStatus: 'started',
      endpoint: tokenUrl,
      paramsSorted: Object.keys(params).filter((k) => k !== 'sign').sort(),
      urlRedacted,
    });

    if (process.env.NODE_ENV !== 'production') {
      logger.debug('[ALIEXPRESS-DROPSHIPPING-API] Token params', {
        params: { ...params, code: '***', sign: params.sign.substring(0, 16) + '...' },
      });
    }

    try {
      const response = await httpClient.get(fullUrl, { timeout: 15000 });

      const rawData = response.data ?? response;
      const errorResp = rawData?.error_response ?? rawData?.error_response_data ?? rawData?.error;
      if (errorResp) {
        const code = String(errorResp.code ?? errorResp.error_code ?? '').trim();
        const msg = String(errorResp.msg ?? errorResp.sub_msg ?? errorResp.error_msg ?? errorResp.message ?? '').trim();
        const hint = code ? ` (Code: ${code})` : '';
        logger.error('[ALIEXPRESS-DROPSHIPPING-API] AliExpress returned error_response', {
          code,
          msg,
          fullError: errorResp,
        });
        throw new Error(`AliExpress OAuth error: ${msg || 'Unknown error'}${hint}`);
      }

      const getPayload = (obj: any): Record<string, any> | null => {
        if (!obj || typeof obj !== 'object') return null;
        if (String(obj.access_token || obj.accessToken || '').trim()) return obj;
        const inner = obj.token_result ?? obj.data ?? obj.token_create_response;
        return inner ? getPayload(inner) : null;
      };
      const payload = getPayload(rawData) ?? rawData ?? {};

      const accessToken = String(payload.access_token || payload.accessToken || '').trim();
      const refreshToken = String(payload.refresh_token || payload.refreshToken || '').trim();
      const expiresIn = Number(payload.expires_in || payload.expiresIn || 0) || 86400;
      const refreshExpiresIn = Number(payload.refresh_expires_in || payload.refreshExpiresIn || 0) || 2592000;

      if (!accessToken) {
        const aliCode = String(payload.code ?? rawData?.code ?? '').trim();
        const aliMsg = String(payload.msg ?? rawData?.msg ?? payload.error_msg ?? rawData?.error_msg ?? '').trim();
        let hint = aliCode || aliMsg ? ` AliExpress: ${aliMsg || aliCode}` : '';
        if (aliCode === 'ApiCallLimit') {
          hint += ' Espera unos minutos y vuelve a intentar.';
        } else if (aliCode === 'IncompleteSignature') {
          hint += ` Usa el algoritmo TOP: appSecret + params + appSecret, sin path en la firma.`;
        }
        const requestId = rawData?.request_id ?? rawData?.data?.request_id ?? '';
        const err = new Error(`Invalid response: missing access_token.${hint}`);
        (err as any).aliexpressRequestId = requestId;
        throw err;
      }

      const elapsed = Date.now() - startTime;
      logger.info('[ALIEXPRESS-DROPSHIPPING-API] Token exchange successful', {
        tokenExchangeStatus: 'success',
        endpoint: tokenUrl,
        method: 'GET',
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        expiresIn,
        refreshExpiresIn,
        elapsed,
      });

      return { accessToken, refreshToken, expiresIn, refreshExpiresIn };
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        error.message ||
        'Unknown error';

      logger.error('[ALIEXPRESS-DROPSHIPPING-API] Token exchange failed', {
        tokenExchangeStatus: 'failed',
        endpoint: tokenUrl,
        error: errorMessage,
        status: error.response?.status,
        responseData: error.response?.data,
        urlRedacted,
      });

      const err = new Error(`AliExpress OAuth token exchange failed: ${errorMessage}`);
      (err as any).aliexpressRequestId = error?.aliexpressRequestId ?? error?.response?.data?.request_id;
      (err as any).aliexpressResponse = error?.response?.data ?? error?.aliexpressResponse;
      throw err;
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

    const tokenUrl = this.TOKEN_CREATE_ENDPOINT;
    try {
      
      const payload = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: appKey,
        client_secret: appSecret,
      });
      const requestHeaders = {
        'Content-Type': 'application/x-www-form-urlencoded',
      } as const;

      // ✅ PRODUCTION READY: Usar cliente HTTP centralizado con timeout
      const response = await httpClient.post(tokenUrl, payload.toString(), {
        headers: requestHeaders,
      });

      if (!response.data || !response.data.access_token) {
        logger.error('[ALIEXPRESS-DROPSHIPPING-API] Token refresh response missing access_token', {
          responseData: response.data,
        });
        throw new Error('Invalid response from AliExpress OAuth token endpoint: missing access_token');
      }

      logger.info('[ALIEXPRESS-DROPSHIPPING-API] Token refresh successful', {
        endpoint: tokenUrl,
        method: 'POST',
        contentType: requestHeaders['Content-Type'],
        statusCode: response.status,
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
        endpoint: tokenUrl,
        method: 'POST',
        contentType: 'application/x-www-form-urlencoded',
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

export async function refreshAliExpressDropshippingToken(
  userId: number,
  environment: 'sandbox' | 'production',
  options?: { minTtlMs?: number }
): Promise<{ refreshed: boolean; credentials: Record<string, any> | null }> {
  const minTtlMs = options?.minTtlMs ?? 60_000;
  const { CredentialsManager, clearCredentialsCache } = await import('./credentials-manager.service');

  const currentCreds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', environment);
  if (!currentCreds) return { refreshed: false, credentials: null };

  const accessToken = String((currentCreds as any).accessToken || '').trim();
  const refreshToken = String((currentCreds as any).refreshToken || '').trim();
  const appKey = String((currentCreds as any).appKey || '').trim();
  const appSecret = String((currentCreds as any).appSecret || '').trim();
  const expiresAtRaw = (currentCreds as any).accessTokenExpiresAt;
  const expiresAtMs = expiresAtRaw ? new Date(expiresAtRaw).getTime() : 0;
  const isExpiredOrNearExpiry = !expiresAtMs || expiresAtMs <= Date.now() + minTtlMs;

  if (!isExpiredOrNearExpiry) {
    return { refreshed: false, credentials: currentCreds };
  }

  if (!refreshToken || !appKey || !appSecret) {
    logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Token refresh skipped: missing required fields', {
      userId,
      environment,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      hasAppKey: !!appKey,
      hasAppSecret: !!appSecret,
      expiresAtRaw: expiresAtRaw || null,
    });
    return { refreshed: false, credentials: currentCreds };
  }

  logger.info('[ALIEXPRESS-DROPSHIPPING-API] Refreshing expired dropshipping token', {
    userId,
    environment,
    expiresAtRaw,
  });

  const refreshed = await aliexpressDropshippingAPIService.refreshAccessToken(refreshToken, appKey, appSecret);
  const updatedCreds = {
    ...currentCreds,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
    refreshTokenExpiresAt: refreshed.refreshExpiresIn
      ? new Date(Date.now() + refreshed.refreshExpiresIn * 1000).toISOString()
      : (currentCreds as any).refreshTokenExpiresAt || null,
    updatedAt: new Date().toISOString(),
  };

  await CredentialsManager.saveCredentials(userId, 'aliexpress-dropshipping', updatedCreds, environment);
  clearCredentialsCache(userId, 'aliexpress-dropshipping', environment);

  const persisted = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', environment);
  const persistedAccessToken = String((persisted as any)?.accessToken || '').trim();
  const persistedRefreshToken = String((persisted as any)?.refreshToken || '').trim();
  if (!persistedAccessToken || !persistedRefreshToken) {
    throw new Error('AliExpress Dropshipping token refresh persistence validation failed');
  }

  logger.info('[ALIEXPRESS-DROPSHIPPING-API] Dropshipping token refresh persisted', {
    userId,
    environment,
    hasPersistedAccessToken: !!persistedAccessToken,
    hasPersistedRefreshToken: !!persistedRefreshToken,
  });

  return { refreshed: true, credentials: persisted };
}

// Exportar instancia singleton
export const aliexpressDropshippingAPIService = new AliExpressDropshippingAPIService();

