/**
 * AliExpress Dropshipping API Service
 * 
 * Implementa la AliExpress Dropshipping API oficial
 * para obtener detalles de productos y crear órdenes automatizadas
 * 
 * @see https://developer.alibaba.com/help/en/portal
 * @see instalarAPi.txt - Documentación técnica de la API
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import logger from '../config/logger';
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

    const allParams = { ...commonParams, ...params };
    const sign = this.calculateSign(allParams, this.credentials.appSecret, commonParams.sign_method);
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
}

// Exportar instancia singleton
export const aliexpressDropshippingAPIService = new AliExpressDropshippingAPIService();

