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
import { generateTokenCreateSignatureHmacSystemInterface } from './aliexpress-signature.service';
import {
  normalizeAliExpressShippingMethods,
  summarizeAliExpressLogisticsForensics,
} from '../utils/aliexpress-logistics-normalizer';
import { normalizeAliExpressRawSkus } from '../utils/aliexpress-raw-sku-normalizer';
import {
  normalizeAliExpressFreightQuoteResult,
  type AliExpressFreightOption,
  type AliExpressFreightQuoteResult,
} from '../utils/aliexpress-freight-normalizer';
import { isAliExpressVideoOrNonStillImageUrl } from '../utils/aliexpress-listing-still-image-url';

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
  logisticsInfoDto?: Record<string, unknown>;
  shippingInfo?: {
    availableShippingMethods: ShippingMethod[];
    estimatedDeliveryDays?: number;
  };
  /**
   * 0–5 stars parsed from DS raw payload when present (Affiliate often omits scores).
   * Used as eBay US rating evidence in preventive validation.
   */
  sellerRatingFive?: number;
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

export interface BuyerFreightQuoteRequest {
  countryCode: string;
  productId: string;
  productNum: number;
  sendGoodsCountryCode: string;
  skuId?: string;
  price?: string;
  priceCurrency?: string;
}

export type AliExpressFreightRequestVariant =
  | 'top_session_gw'
  | 'top_session_eco'
  | 'sync_access_token';

export interface AliExpressFreightRequestForensics {
  variant: AliExpressFreightRequestVariant;
  endpoint: string;
  method: string;
  tokenParamName: 'session' | 'access_token';
  signMethod: 'md5' | 'hmac-sha256';
  timestampShape: 'top_gmt8' | 'compact_iso_like';
  timestampPreview: string;
  signedParamKeys: string[];
  dtoParamKey: string;
  dtoJsonLength: number;
  appKeyPrefix: string | null;
  appSecretFingerprint: string | null;
  appSecretLength: number;
  hasAccessToken: boolean;
  credentialSource: string | null;
  tokenSource: string | null;
  algorithmMatchesDeclared: boolean;
  canonicalParamMap: Array<{
    key: string;
    valuePreview: string;
    valueLength: number;
    isEmpty: boolean;
  }>;
  stringToSignPreview: string;
  stringToSignLength: number;
  signPreview: string | null;
}

export interface AliExpressFreightVariantProbeResult {
  variant: AliExpressFreightRequestVariant;
  ok: boolean;
  freightOptionsCount: number;
  rawOptionNodeCount: number;
  rawTopKeys: string[];
  selectedDiagnostics: AliExpressFreightRequestForensics;
  aliCode?: string | number | null;
  aliSubCode?: string | null;
  aliMsg?: string | null;
  errorMessage?: string | null;
}

export interface BuyerFreightQuoteResponse extends AliExpressFreightQuoteResult {
  options: AliExpressFreightOption[];
  requestForensics?: AliExpressFreightRequestForensics;
  variantAudit?: AliExpressFreightVariantProbeResult[];
}

interface CalculateBuyerFreightOptions {
  forensicProbeAllVariants?: boolean;
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

/** ds.product.get returns galleries under ae_multimedia_info_dto; simplequery often omits product_images. */
/** Map evaluate_score / evaluate_rate style fields to 0–5 (same semantics as Affiliate preventive helper). */
export function extractSellerRatingFiveFromDsRawPayload(raw: unknown): number | undefined {
  const normPair = (a: unknown, b: unknown): number | undefined => {
    for (const rawV of [a, b]) {
      if (rawV == null || String(rawV).trim() === '') continue;
      const n = parseFloat(String(rawV).replace(/%/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) continue;
      if (n <= 5) return n;
      if (n <= 100) return n / 20;
    }
    return undefined;
  };
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  let x = normPair(o.evaluate_score, o.evaluate_rate);
  if (x != null) return x;
  const base = o.ae_item_base_info_dto;
  if (base && typeof base === 'object') {
    const b = base as Record<string, unknown>;
    x = normPair(b.evaluate_score, b.evaluate_rate);
    if (x != null) return x;
  }
  const store = o.ae_store_info;
  if (store && typeof store === 'object') {
    const s = store as Record<string, unknown>;
    x = normPair(s.store_rating ?? s.score, s.item_as_described_rating);
    if (x != null) return x;
  }
  return undefined;
}

function collectAliExpressDsProductImageUrls(multimediaRoot: unknown, skuRows: any[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const pushUrl = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const chunks = raw
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('http'));
    const toAdd = chunks.length ? chunks : raw.trim().startsWith('http') ? [raw.trim()] : [];
    for (const t of toAdd) {
      if (isAliExpressVideoOrNonStillImageUrl(t)) continue;
      if (!/ae-pic|alicdn|aliexpress-media|img\.alicdn/i.test(t)) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  };
  const walk = (node: unknown, depth: number) => {
    if (depth > 14 || node == null) return;
    if (typeof node === 'string') {
      pushUrl(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      for (const v of Object.values(node as Record<string, unknown>)) walk(v, depth + 1);
    }
  };
  walk(multimediaRoot, 0);
  if (skuRows?.length) {
    for (const s of skuRows) {
      if (!s || typeof s !== 'object') continue;
      const rec = s as Record<string, unknown>;
      for (const c of [
        rec.sku_image_url,
        rec.skuImageUrl,
        rec.image_url,
        rec.imageUrl,
        rec.ae_sku_property_image_path,
        rec.sku_property_image,
      ]) {
        pushUrl(c);
      }
    }
  }
  return out;
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
  private readonly FREIGHT_TOP_COMPAT_ENDPOINT = 'https://eco.taobao.com/router/rest';
  // Prefer api-sg: legacy often ETIMEDOUT from many networks; api-sg is the same API and more reachable.
  private endpoint: string = (process.env.ALIEXPRESS_DROPSHIPPING_USE_LEGACY_ENDPOINT === 'true' ? this.ENDPOINT_LEGACY : this.ENDPOINT_NEW);

  constructor() {
    // Timeout 90s per request to allow for slow AliExpress API (getProductInfo + placeOrder with retries need headroom)
    const requestTimeoutMs = Number(process.env.ALIEXPRESS_DROPSHIPPING_API_TIMEOUT_MS) || 90_000;
    this.client = axios.create({
      timeout: requestTimeoutMs,
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
    if (credentials.sandbox || process.env.ALIEXPRESS_DROPSHIPPING_USE_LEGACY_ENDPOINT !== 'true') {
      this.endpoint = this.ENDPOINT_NEW;
    } else {
      this.endpoint = this.ENDPOINT_LEGACY;
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

  private getTopTimestamp(): string {
    const now = new Date();
    const gmt8 = new Date(now.getTime() + 8 * 3600000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      gmt8.getUTCFullYear() +
      '-' +
      pad(gmt8.getUTCMonth() + 1) +
      '-' +
      pad(gmt8.getUTCDate()) +
      ' ' +
      pad(gmt8.getUTCHours()) +
      ':' +
      pad(gmt8.getUTCMinutes()) +
      ':' +
      pad(gmt8.getUTCSeconds())
    );
  }

  private getCompactTimestamp(): string {
    return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + '00';
  }

  private fingerprintSecret(secret: string | undefined): string | null {
    const value = String(secret || '').trim();
    if (!value) return null;
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12);
  }

  private previewSensitiveValue(key: string, value: string): string {
    if (!value) return '';
    if (key === 'access_token' || key === 'session') {
      if (value.length <= 10) return '<redacted_token>';
      return `${value.slice(0, 4)}...${value.slice(-4)}`;
    }
    if (key === 'sign') {
      return `${value.slice(0, 8)}...`;
    }
    if (key === 'param_aeop_freight_calculate_for_buyer_d_t_o') {
      return value.length > 180 ? `${value.slice(0, 180)}...` : value;
    }
    return value.length > 120 ? `${value.slice(0, 120)}...` : value;
  }

  private redactStringToSign(
    raw: string,
    appSecret: string,
    params: Record<string, string>,
  ): string {
    let redacted = raw;
    if (appSecret) {
      redacted = redacted.split(appSecret).join('<app_secret>');
    }
    for (const [key, value] of Object.entries(params)) {
      if (!value) continue;
      if (key === 'access_token') {
        redacted = redacted.split(value).join('<access_token>');
      } else if (key === 'session') {
        redacted = redacted.split(value).join('<session>');
      }
    }
    return redacted.length > 240 ? `${redacted.slice(0, 240)}...` : redacted;
  }

  private buildFreightCanonicalParamMap(params: Record<string, string>) {
    return Object.keys(params)
      .filter((key) => key !== 'sign')
      .sort()
      .map((key) => {
        const rawValue = String(params[key] ?? '');
        return {
          key,
          valuePreview: this.previewSensitiveValue(key, rawValue),
          valueLength: rawValue.length,
          isEmpty: rawValue.trim().length === 0,
        };
      });
  }

  private calculateTopHmacSha256Sign(params: Record<string, any>, appSecret: string): string {
    const sortedKeys = Object.keys(params)
      .filter((key) => key !== 'sign')
      .sort();
    const baseString = sortedKeys
      .map((key) => `${key}${params[key]}`)
      .join('');
    return crypto
      .createHmac('sha256', appSecret)
      .update(baseString, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  /** Retry on network errors (ETIMEDOUT, ECONNREFUSED, timeout). Max 3 attempts with 3s backoff.
   *  Additionally, failover endpoint legacy -> new when legacy host is unreachable.
   */
  private static isNetworkError(error: any): boolean {
    const msg = (error?.message || String(error)).toLowerCase();
    const code = (error?.code || '').toLowerCase();
    return (
      msg.includes('etimedout') ||
      msg.includes('econnrefused') ||
      msg.includes('timeout') ||
      msg.includes('network') ||
      code === 'etimedout' ||
      code === 'econnrefused' ||
      code === 'econnreset'
    );
  }

  /**
   * Realizar petición a la API con autenticación OAuth
   */
  private async makeRequest(
    method: string,
    params: Record<string, any>,
    options: { allowWithoutAccessToken?: boolean } = {},
  ): Promise<any> {
    if (!this.credentials) {
      throw new Error('AliExpress Dropshipping API credentials not configured');
    }

    if (!this.credentials.accessToken && !options.allowWithoutAccessToken) {
      throw new Error('AliExpress Dropshipping API access token not configured. OAuth authorization required.');
    }

    const useTopAppKeyOnly = !this.credentials.accessToken && options.allowWithoutAccessToken;
    const commonParams: Record<string, any> = {
      method,
      app_key: this.credentials.appKey,
      timestamp: useTopAppKeyOnly
        ? this.getTopTimestamp()
        : new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + '00',
      format: 'json',
      v: '2.0',
      sign_method: useTopAppKeyOnly ? 'hmac-sha256' : 'md5',
    };
    if (this.credentials.accessToken && !useTopAppKeyOnly) {
      commonParams.access_token = this.credentials.accessToken;
    }

    const allParams: Record<string, any> = { ...commonParams, ...params };
    const sign = useTopAppKeyOnly
      ? this.calculateTopHmacSha256Sign(allParams, this.credentials.appSecret)
      : this.calculateSign(allParams, this.credentials.appSecret, commonParams.sign_method as 'md5' | 'sha256');
    allParams.sign = sign;

    const maxAttempts = 3;
    const backoffMs = 3000;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.debug('[ALIEXPRESS-DROPSHIPPING-API] Making request', {
          method,
          attempt,
          maxAttempts,
          endpoint: this.endpoint,
          hasAccessToken: !!this.credentials.accessToken,
        });

        // AliExpress TOP expects urlencoded form body.
        const formBody = new URLSearchParams();
        for (const [k, v] of Object.entries(allParams)) {
          if (v === undefined || v === null) continue;
          formBody.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
        const shipToCountryTop = allParams.ship_to_country || allParams.shipToCountry || 'US';
        if (shipToCountryTop && String(shipToCountryTop).trim()) {
          formBody.set('ship_to_country', String(shipToCountryTop).trim());
        }
        if (method.toLowerCase().includes('placeorder')) {
          const dto = (allParams as any).param_place_order_request4_open_api_d_t_o;
          const hasShipToCountry = Object.prototype.hasOwnProperty.call(allParams, 'ship_to_country');
          const dtoIncludesShipToCountry = typeof dto === 'string' ? dto.includes('ship_to_country') : null;
          logger.info('[ALIEXPRESS-DROPSHIPPING-API] placeOrder payload debug', {
            hasShipToCountry,
            ship_to_country_value: shipToCountryTop,
            dtoIncludesShipToCountry,
            dtoType: typeof dto,
          });
        }

        const response = await this.client.post(this.endpoint, formBody.toString());

        if (response.data.error_response) {
          const error = response.data.error_response;
          logger.warn('[ALIEXPRESS-DROPSHIPPING-API] API error_response', {
            method,
            code: error.code,
            sub_code: error.sub_code,
            msg: error.msg,
            sub_msg: error.sub_msg,
          });

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

        let result =
          response.data[`${method.replace(/\./g, '_')}_response`] ||
          response.data.response?.result;

        if (!result && response.data && typeof response.data === 'object') {
          const firstResponseKey = Object.keys(response.data).find((key) => key.endsWith('_response'));
          if (firstResponseKey) {
            result = response.data[firstResponseKey];
          }
        }

        if (!result && response.data && typeof response.data === 'object') {
          result = response.data;
        }

        if (!result) {
          logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Unexpected response format', {
            method,
            responseData: response.data,
          });
          throw new Error('Unexpected response format from AliExpress Dropshipping API');
        }

      // Debug extraction correctness for product info methods.
      if (
        method.includes('offer.ds.product.simplequery') ||
        method.includes('dropshipping.product.info.get')
      ) {
        const resultAny = result as any;
        logger.info('[ALIEXPRESS-DROPSHIPPING-API] makeRequest product-info extraction debug', {
          method,
          responseTopKeys: response.data ? Object.keys(response.data).slice(0, 20) : [],
          resultTopKeys: resultAny && typeof resultAny === 'object' ? Object.keys(resultAny).slice(0, 20) : [],
          hasResultProduct: !!resultAny?.product,
          resultProductKeys:
            resultAny?.product && typeof resultAny.product === 'object'
              ? Object.keys(resultAny.product).slice(0, 20)
              : [],
          resultPreview:
            resultAny && typeof resultAny === 'object'
              ? JSON.stringify(resultAny).slice(0, 1200)
              : String(resultAny).slice(0, 1200),
        });
      }

        return result;
      } catch (error: any) {
        lastError = error;
        if (error.message === 'ACCESS_TOKEN_EXPIRED') {
          throw error;
        }

        const isNetworkErr =
          axios.isAxiosError(error) && AliExpressDropshippingAPIService.isNetworkError(error);
        if (isNetworkErr && attempt < maxAttempts) {
          // Failover: tu entorno falla TCP contra gw.api.taobao.com (legacy) pero api-sg funciona.
          if (this.endpoint === this.ENDPOINT_LEGACY) {
            logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Network error on legacy endpoint, switching to api-sg endpoint', {
              method,
              attempt,
              from: this.ENDPOINT_LEGACY,
              to: this.ENDPOINT_NEW,
              error: error?.message || String(error),
            });
            this.endpoint = this.ENDPOINT_NEW;
          }
          logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Network error, retrying', {
            method,
            attempt,
            nextAttempt: attempt + 1,
            error: error.message,
          });
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        if (axios.isAxiosError(error)) {
          logger.error('[ALIEXPRESS-DROPSHIPPING-API] Request failed', {
            method,
            attempt,
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

    throw lastError || new Error('AliExpress Dropshipping API request failed after retries');
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

      const shipToCountry = (params?.localCountry || 'US').trim().toUpperCase() || 'US';
      const apiParams: Record<string, any> = {
        product_id: productId,
        ship_to_country: shipToCountry,
        shipToCountry: shipToCountry,
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
      let product = result.product || result;
      // Some API versions return an incomplete object (only request_id/_trace_id) for the primary method.
      // In that case, fallback to the alternative product-info method.
      const hasProductFields = Boolean(
        (product as any)?.product_id ||
          (product as any)?.product_title ||
          (product as any)?.sale_price ||
          (product as any)?.stock ||
          (product as any)?.shipping_info
      );
      if (!hasProductFields) {
        logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Primary getProductInfo returned no product fields; trying aliexpress.ds.product.get', {
          productId,
        });
        result = await this.makeRequest('aliexpress.ds.product.get', apiParams);
        const resAny = result as any;
        product = resAny?.result ?? resAny?.product ?? result;
        const stillNoFields = !(product as any)?.product_id && !(product as any)?.product_title && !(product as any)?.sale_price;
        if (stillNoFields && typeof resAny === 'object') {
          const rr = resAny?.result;
          const aeSkus = rr?.ae_item_sku_info_dtos;
          logger.info('[ALIEXPRESS-DROPSHIPPING-API] ds.product.get result shape', {
            resultResultKeys: rr && typeof rr === 'object' ? Object.keys(rr).slice(0, 25) : null,
            ae_item_sku_info_dtosType: aeSkus == null ? null : Array.isArray(aeSkus) ? 'array' : typeof aeSkus,
            ae_item_sku_info_dtosKeys: aeSkus && typeof aeSkus === 'object' && !Array.isArray(aeSkus) ? Object.keys(aeSkus) : null,
          });
        }
      }
      const rawAny = product as any;
      const rawSkus: any = rawAny?.skus;
      const rawSku: any = rawAny?.sku;
      const rawSkuList: any = rawAny?.sku_list ?? rawAny?.skuList ?? rawAny?.skuListResponse;
      const aeSkuDtos: any = rawAny?.ae_item_sku_info_dtos;
      let aeSkuArray: any[] | undefined;
      if (Array.isArray(aeSkuDtos)) {
        aeSkuArray = aeSkuDtos;
      } else if (aeSkuDtos && typeof aeSkuDtos === 'object') {
        const inner =
          aeSkuDtos.ae_item_sku_info_d_t_o ??
          aeSkuDtos.ae_item_sku_info_dto ??
          aeSkuDtos.ae_item_sku_info_dtos ??
          aeSkuDtos.sku ??
          aeSkuDtos.data;
        aeSkuArray = Array.isArray(inner) ? inner : undefined;
        if (!aeSkuArray && typeof inner === 'object' && inner !== null) {
          const keys = Object.keys(inner);
          if (keys.length > 0) {
            const first = (inner as any)[keys[0]];
            aeSkuArray = Array.isArray(first) ? first : [inner];
          }
        }
      } else {
        aeSkuArray = undefined;
      }

      const skuArray: any[] | undefined = Array.isArray(rawSkus?.sku)
        ? rawSkus.sku
        : Array.isArray(rawSkus?.skus)
        ? rawSkus.skus
        : Array.isArray(rawSkus)
        ? rawSkus
        : Array.isArray(rawSkuList)
        ? rawSkuList
        : aeSkuArray?.length
        ? aeSkuArray
        : undefined;

      const baseInfo = rawAny?.ae_item_base_info_dto;
      if (baseInfo && typeof baseInfo === 'object') {
        (product as any).product_id = (product as any).product_id ?? baseInfo.product_id ?? baseInfo.productId;
        (product as any).product_title = (product as any).product_title ?? baseInfo.subject ?? baseInfo.product_title ?? baseInfo.title;
      }

      const normalizedShippingMethods = normalizeAliExpressShippingMethods(product as Record<string, unknown>);
      const logisticsForensics = summarizeAliExpressLogisticsForensics(product as Record<string, unknown>);

      logger.info('[ALIEXPRESS-DROPSHIPPING-API] getProductInfo product shape (skus)', {
        productKeys: Object.keys(rawAny || {}).slice(0, 20),
        hasSkus: !!rawSkus,
        hasAeSkuDtos: !!aeSkuArray?.length,
        skuArrayLength: skuArray?.length ?? null,
        hasClassicShippingInfo: logisticsForensics.hasClassicShippingInfo,
        hasLogisticsInfoDto: logisticsForensics.hasLogisticsInfoDto,
        logisticsInfoKeys: logisticsForensics.logisticsInfoKeys.slice(0, 20),
        normalizedShippingMethodCount: normalizedShippingMethods.length,
      });

      const normalizedSkus = normalizeAliExpressRawSkus(product as Record<string, unknown>).map((sku) => ({
        skuId: sku.skuId,
        salePrice: sku.salePrice,
        stock: sku.stock,
        attributes: sku.attributes || {},
      }));

      const legacyImages: string[] = Array.isArray((product as any).product_images?.string)
        ? (product as any).product_images.string.filter(
            (x: any) => typeof x === 'string' && x.startsWith('http') && !isAliExpressVideoOrNonStillImageUrl(x),
          )
        : (product as any).product_images && typeof (product as any).product_images === 'string'
          ? [(product as any).product_images].filter(
              (x: string) => x.startsWith('http') && !isAliExpressVideoOrNonStillImageUrl(x),
            )
          : [];
      const dsExtraImages = collectAliExpressDsProductImageUrls(
        rawAny?.ae_multimedia_info_dto,
        skuArray
      );
      const mergedProductImages: string[] = [];
      const imgSeen = new Set<string>();
      for (const u of [...legacyImages, ...dsExtraImages]) {
        if (!u || imgSeen.has(u) || isAliExpressVideoOrNonStillImageUrl(u)) continue;
        imgSeen.add(u);
        mergedProductImages.push(u);
      }

      return {
        productId: String((product as any).product_id || productId),
        productTitle: String((product as any).product_title || ''),
        productImages: mergedProductImages,
        salePrice: parseFloat(product.sale_price || product.price || '0'),
        originalPrice: parseFloat(product.original_price || product.list_price || '0'),
        currency: product.currency || 'USD',
        stock: parseInt(product.stock || product.available_stock || '0', 10),
        sellerRatingFive: extractSellerRatingFiveFromDsRawPayload(rawAny),
        logisticsInfoDto:
          rawAny?.logistics_info_dto && typeof rawAny.logistics_info_dto === 'object'
            ? (rawAny.logistics_info_dto as Record<string, unknown>)
            : undefined,
        skus:
          normalizedSkus.length > 0
            ? normalizedSkus
            : skuArray
            ? skuArray.map((s: any) => {
                const skuIdRaw = s.sku_id ?? s.skuId ?? s.sku ?? s.id ?? '';
                const skuId = String(skuIdRaw).trim();

                const stockRaw =
                  s.stock ??
                  s.available_stock ??
                  s.inventory ??
                  s.stock_quantity ??
                  s.sku_available_stock ??
                  '0';
                const stock = parseInt(String(stockRaw), 10);

                const salePriceRaw =
                  s.sale_price ??
                  s.salePrice ??
                  s.price ??
                  s.offer_sale_price?.value ??
                  s.offer_sale_price ??
                  '0';
                const salePrice = parseFloat(String(salePriceRaw));

                const rawSkuImg =
                  s.sku_image_url ??
                  s.skuImageUrl ??
                  s.image_url ??
                  s.imageUrl ??
                  s.ae_sku_property_image_path ??
                  s.sku_property_image;
                const skuImg =
                  typeof rawSkuImg === 'string' && rawSkuImg.trim() && !isAliExpressVideoOrNonStillImageUrl(rawSkuImg)
                    ? String(rawSkuImg).trim()
                    : undefined;

                return {
                  skuId,
                  attributes: s.attributes || s.attr || {},
                  salePrice: Number.isNaN(salePrice) ? 0 : salePrice,
                  stock: Number.isNaN(stock) ? 0 : stock,
                  imageUrl: skuImg,
                };
              })
            : undefined,
        shippingInfo:
          normalizedShippingMethods.length > 0
            ? {
                availableShippingMethods: normalizedShippingMethods,
                estimatedDeliveryDays: product.shipping_info?.estimated_days
                  ? parseInt(product.shipping_info.estimated_days, 10)
                  : undefined,
              }
            : undefined,
      };
    } catch (error: any) {
      logger.error('[ALIEXPRESS-DROPSHIPPING-API] Get product info failed', {
        error: error.message,
        productId,
      });
      throw error;
    }
  }

  private buildFreightDto(request: BuyerFreightQuoteRequest): Record<string, unknown> {
    const dto: Record<string, unknown> = {
      country_code: String(request.countryCode || '').trim().toUpperCase(),
      product_id: Number(request.productId),
      product_num: Number(request.productNum || 1),
      send_goods_country_code: String(request.sendGoodsCountryCode || 'CN').trim().toUpperCase() || 'CN',
    };

    if (request.skuId) dto.sku_id = String(request.skuId).trim();
    if (request.price) dto.price = String(request.price);
    if (request.priceCurrency) dto.price_currency = String(request.priceCurrency).toUpperCase();

    return dto;
  }

  private buildFreightVariantRequest(
    request: BuyerFreightQuoteRequest,
    variant: AliExpressFreightRequestVariant,
  ): {
    endpoint: string;
    params: Record<string, string>;
    diagnostics: AliExpressFreightRequestForensics;
  } {
    if (!this.credentials?.appKey || !this.credentials?.appSecret || !this.credentials?.accessToken) {
      throw new Error('AliExpress freight calculation requires appKey, appSecret and accessToken');
    }

    const dtoParamKey = 'param_aeop_freight_calculate_for_buyer_d_t_o';
    const dtoJson = JSON.stringify(this.buildFreightDto(request));
    const timestamp = variant === 'sync_access_token' ? this.getCompactTimestamp() : this.getTopTimestamp();
    const endpoint =
      variant === 'top_session_gw'
        ? this.ENDPOINT_LEGACY
        : variant === 'top_session_eco'
          ? this.FREIGHT_TOP_COMPAT_ENDPOINT
          : this.ENDPOINT_NEW;
    const params: Record<string, string> = {
      method: 'aliexpress.logistics.buyer.freight.calculate',
      app_key: String(this.credentials.appKey),
      timestamp,
      format: 'json',
      v: '2.0',
      sign_method: 'md5',
      [dtoParamKey]: dtoJson,
    };

    if (variant === 'sync_access_token') {
      params.access_token = String(this.credentials.accessToken);
    } else {
      params.session = String(this.credentials.accessToken);
    }

    const rawStringToSign = (() => {
      const sortedKeys = Object.keys(params).sort();
      const signString = sortedKeys.map((key) => `${key}${params[key]}`).join('');
      return `${String(this.credentials.appSecret)}${signString}${String(this.credentials.appSecret)}`;
    })();
    params.sign = this.calculateSign(params, String(this.credentials.appSecret), 'md5');

    const credentialMetadata = this.credentials as unknown as Record<string, unknown>;
    const credentialSource =
      String(credentialMetadata.credentialSource || '').trim() || null;
    const tokenSource =
      String(credentialMetadata.tokenSource || '').trim() || null;

    return {
      endpoint,
      params,
      diagnostics: {
        variant,
        endpoint,
        method: 'aliexpress.logistics.buyer.freight.calculate',
        tokenParamName: variant === 'sync_access_token' ? 'access_token' : 'session',
        signMethod: 'md5',
        timestampShape: variant === 'sync_access_token' ? 'compact_iso_like' : 'top_gmt8',
        timestampPreview: timestamp,
        signedParamKeys: Object.keys(params).filter((key) => key !== 'sign').sort(),
        dtoParamKey,
        dtoJsonLength: dtoJson.length,
        appKeyPrefix: String(this.credentials.appKey).trim()
          ? `${String(this.credentials.appKey).trim().slice(0, 6)}...`
          : null,
        appSecretFingerprint: this.fingerprintSecret(String(this.credentials.appSecret)),
        appSecretLength: String(this.credentials.appSecret).trim().length,
        hasAccessToken: Boolean(String(this.credentials.accessToken || '').trim()),
        credentialSource,
        tokenSource,
        algorithmMatchesDeclared: true,
        canonicalParamMap: this.buildFreightCanonicalParamMap(params),
        stringToSignPreview: this.redactStringToSign(
          rawStringToSign,
          String(this.credentials.appSecret),
          params,
        ),
        stringToSignLength: rawStringToSign.length,
        signPreview: params.sign ? this.previewSensitiveValue('sign', params.sign) : null,
      },
    };
  }

  private async executeFreightVariant(
    request: BuyerFreightQuoteRequest,
    variant: AliExpressFreightRequestVariant,
  ): Promise<BuyerFreightQuoteResponse> {
    const built = this.buildFreightVariantRequest(request, variant);
    const formBody = new URLSearchParams();
    for (const [key, value] of Object.entries(built.params)) {
      if (value === undefined || value === null || String(value).trim() === '') continue;
      formBody.append(key, String(value));
    }

    const response = await this.client.post(built.endpoint, formBody.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });

    if (response.data?.error_response) {
      const error = response.data.error_response;
      logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Freight API error_response', {
        variant,
        endpoint: built.endpoint,
        code: error.code,
        sub_code: error.sub_code,
        msg: error.msg,
        sub_msg: error.sub_msg,
        signMethod: built.diagnostics.signMethod,
        tokenParamName: built.diagnostics.tokenParamName,
        signedParamKeys: built.diagnostics.signedParamKeys,
        appKeyPrefix: built.diagnostics.appKeyPrefix,
        appSecretFingerprint: built.diagnostics.appSecretFingerprint,
        credentialSource: built.diagnostics.credentialSource,
        tokenSource: built.diagnostics.tokenSource,
        algorithmMatchesDeclared: built.diagnostics.algorithmMatchesDeclared,
        stringToSignPreview: built.diagnostics.stringToSignPreview,
      });
      const freightError = new Error(
        `AliExpress freight API error: ${error.msg || error.sub_msg || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`,
      );
      (freightError as any).aliCode = error.code ?? null;
      (freightError as any).aliSubCode = error.sub_code ?? null;
      (freightError as any).aliMsg = error.msg ?? error.sub_msg ?? null;
      (freightError as any).freightDiagnostics = built.diagnostics;
      throw freightError;
    }

    const result =
      response.data?.aliexpress_logistics_buyer_freight_calculate_response?.result ||
      response.data?.result ||
      response.data;
    const normalized = normalizeAliExpressFreightQuoteResult(result as Record<string, unknown>);

    logger.info('[ALIEXPRESS-DROPSHIPPING-API] Buyer freight calculation normalized', {
      productId: request.productId,
      countryCode: request.countryCode,
      sendGoodsCountryCode: request.sendGoodsCountryCode,
      variant,
      endpoint: built.endpoint,
      freightOptionsCount: normalized.options.length,
      rawTopKeys: normalized.rawTopKeys,
      rawOptionNodeCount: normalized.rawOptionNodeCount,
    });

    return {
      ...normalized,
      requestForensics: built.diagnostics,
    };
  }

  async probeBuyerFreightVariants(
    request: BuyerFreightQuoteRequest,
    variants: AliExpressFreightRequestVariant[] = ['sync_access_token', 'top_session_gw', 'top_session_eco'],
  ): Promise<AliExpressFreightVariantProbeResult[]> {
    const results: AliExpressFreightVariantProbeResult[] = [];

    for (const variant of variants) {
      try {
        const response = await this.executeFreightVariant(request, variant);
        results.push({
          variant,
          ok: true,
          freightOptionsCount: response.options.length,
          rawOptionNodeCount: response.rawOptionNodeCount,
          rawTopKeys: response.rawTopKeys,
          selectedDiagnostics: response.requestForensics!,
        });
      } catch (error: any) {
        const diagnostics =
          (error?.freightDiagnostics as AliExpressFreightRequestForensics | undefined) ||
          this.buildFreightVariantRequest(request, variant).diagnostics;
        results.push({
          variant,
          ok: false,
          freightOptionsCount: 0,
          rawOptionNodeCount: 0,
          rawTopKeys: [],
          selectedDiagnostics: diagnostics,
          aliCode: error?.aliCode ?? null,
          aliSubCode: error?.aliSubCode ?? null,
          aliMsg: error?.aliMsg ?? null,
          errorMessage: error?.message ?? 'unknown_freight_error',
        });
      }
    }

    return results;
  }

  async calculateBuyerFreight(
    request: BuyerFreightQuoteRequest,
    options: CalculateBuyerFreightOptions = {},
  ): Promise<BuyerFreightQuoteResponse> {
    const countryCode = String(request.countryCode || '').trim().toUpperCase();
    const productId = String(request.productId || '').trim();
    const sendGoodsCountryCode = String(request.sendGoodsCountryCode || 'CN').trim().toUpperCase() || 'CN';
    const productNum = Number(request.productNum || 1);

    if (!countryCode || !productId || !Number.isFinite(productNum) || productNum <= 0) {
      throw new Error('AliExpress freight calculation requires countryCode, productId and productNum > 0');
    }

    logger.info('[ALIEXPRESS-DROPSHIPPING-API] Calculating buyer freight', {
      productId,
      countryCode,
      sendGoodsCountryCode,
      productNum,
      hasSkuId: Boolean(request.skuId),
    });

    const normalizedRequest: BuyerFreightQuoteRequest = {
      ...request,
      countryCode,
      productId,
      productNum,
      sendGoodsCountryCode,
    };
    if (!options.forensicProbeAllVariants) {
      try {
        const syncResponse = await this.executeFreightVariant(normalizedRequest, 'sync_access_token');
        if (syncResponse.options.length > 0) {
          return {
            ...syncResponse,
            variantAudit: [
              {
                variant: 'sync_access_token',
                ok: true,
                freightOptionsCount: syncResponse.options.length,
                rawOptionNodeCount: syncResponse.rawOptionNodeCount,
                rawTopKeys: syncResponse.rawTopKeys,
                selectedDiagnostics: syncResponse.requestForensics!,
              },
            ],
          };
        }
      } catch (syncError: any) {
        logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Sync freight attempt failed, falling back to forensic probe variants', {
          productId,
          countryCode,
          aliCode: syncError?.aliCode ?? null,
          aliSubCode: syncError?.aliSubCode ?? null,
          aliMsg: syncError?.aliMsg ?? syncError?.message ?? null,
          freightDiagnostics: syncError?.freightDiagnostics ?? null,
        });
      }
    }

    const variantAudit = await this.probeBuyerFreightVariants(normalizedRequest);
    const firstSuccess = variantAudit.find((variant) => variant.ok && variant.freightOptionsCount > 0);

    if (firstSuccess) {
      const successful = await this.executeFreightVariant(normalizedRequest, firstSuccess.variant);
      return {
        ...successful,
        variantAudit,
      };
    }

    const primaryFailure =
      variantAudit.find((variant) => variant.variant === 'top_session_gw' && !variant.ok) ||
      variantAudit.find((variant) => !variant.ok) ||
      null;
    const freightError = new Error(
      primaryFailure?.errorMessage || 'AliExpress freight API error: no usable freight quote returned',
    );
    (freightError as any).aliCode = primaryFailure?.aliCode ?? null;
    (freightError as any).aliSubCode = primaryFailure?.aliSubCode ?? null;
    (freightError as any).aliMsg = primaryFailure?.aliMsg ?? null;
    (freightError as any).freightDiagnostics = primaryFailure?.selectedDiagnostics ?? null;
    (freightError as any).freightVariantAudit = variantAudit;
    throw freightError;
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

      const quantity = Number(request.quantity);
      if (Number.isNaN(quantity) || quantity < 1) {
        throw new Error(`Invalid quantity for placeOrder: ${String(request.quantity)}`);
      }

      const shipToCountry = (request.shippingAddress.country || 'US').trim().toUpperCase() || 'US';
      const apiParams: Record<string, any> = {
        product_id: request.productId,
        quantity,
        product_count: quantity,
        productCount: quantity,
        ship_to_country: shipToCountry,
        shipToCountry: shipToCountry,
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
      apiParams.receiver_country = shipToCountry;
      apiParams.receiver_phone = request.shippingAddress.phoneNumber;
      if (request.shippingAddress.email) {
        apiParams.receiver_email = request.shippingAddress.email;
      }

      // AliExpress requires a nested DTO parameter for the placeorder request.
      // Without this, AliExpress returns:
      // "The input parameter “param_place_order_request4_open_api_d_t_o” ... is not supplied (Code: MissingParameter)".
      const fullAddress = [
        apiParams.receiver_address,
        apiParams.receiver_address2,
      ]
        .filter((v) => v !== undefined && v !== null && String(v).trim().length > 0)
        .join(' ');

      const openApiDto: Record<string, any> = {
        product_id: apiParams.product_id,
        sku_id: apiParams.sku_id,
        quantity: apiParams.quantity,
        product_count: apiParams.quantity,
        productCount: apiParams.quantity,
        ship_to_country: apiParams.ship_to_country,
        shipToCountry: apiParams.ship_to_country,
        shipping_method_id: apiParams.shipping_method_id,
        buyer_message: apiParams.buyer_message,

        // Required by the API (MissingParameter: null#logistics_address)
        logistics_address: {
          address: fullAddress, // required
          city: apiParams.receiver_city,
          province: apiParams.receiver_state,
          postal_code: apiParams.receiver_zip,
          country: apiParams.receiver_country,

          full_name: apiParams.receiver_name,
          name: apiParams.receiver_name,
          phone: apiParams.receiver_phone,
          phone_number: apiParams.receiver_phone,
          email: apiParams.receiver_email,
        },

        // Required by the API (MissingParameter: product_items)
        product_items: [
          (() => {
            const item: Record<string, any> = {
              product_id: apiParams.product_id,
              quantity: apiParams.quantity,
              product_count: apiParams.quantity,
            };
            if (apiParams.sku_id != null && String(apiParams.sku_id).trim() !== '') {
              item.sku_id = apiParams.sku_id;
            }
            return item;
          })(),
        ],
      };
      for (const [k, v] of Object.entries(openApiDto)) {
        if (v === undefined || v === null) delete openApiDto[k];
      }
      apiParams.param_place_order_request4_open_api_d_t_o = JSON.stringify(openApiDto);

      logger.info('[ALIEXPRESS-DROPSHIPPING-API] Calling trade.buy.placeorder', {
        ship_to_country: apiParams.ship_to_country,
        hasDto: typeof apiParams.param_place_order_request4_open_api_d_t_o === 'string',
        dtoIncludesShipToCountry:
          typeof apiParams.param_place_order_request4_open_api_d_t_o === 'string'
            ? apiParams.param_place_order_request4_open_api_d_t_o.includes('ship_to_country')
            : null,
      });

      // El método puede variar según versión
      let result;
      try {
        result = await this.makeRequest('aliexpress.trade.buy.placeorder', apiParams);
      } catch (error: any) {
        const msg = error?.message || String(error);
        const shouldFallbackToAlternative =
          msg.includes('method not found') ||
          msg.includes('invalid method');

        if (shouldFallbackToAlternative) {
          logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Primary place order method failed, trying alternative');
          result = await this.makeRequest('aliexpress.dropshipping.order.create', apiParams);
        } else {
          throw error;
        }
      }

      const order = result.order || result;
      const orderIdRaw = order.order_id ?? order.orderId ?? order.order_id;
      const orderId = String(orderIdRaw || '');
      if (!orderId) {
        // If AliExpress rejected the payload, it may not return error_response,
        // so we must validate response structure ourselves.
        const safePreview =
          typeof order === 'object' ? JSON.stringify(order).slice(0, 800) : String(order).slice(0, 800);
        throw new Error(`AliExpress placeOrder response missing order_id. Preview: ${safePreview}`);
      }

      return {
        orderId,
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
   * Algoritmo: HMAC-SHA256(apiPath + sortedParams, appSecret), hex uppercase.
   * Per ae_sdk v0.6.0: sign_method=sha256, no redirect_uri, POST method.
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
    const appSecret = (clientSecret || this.credentials?.appSecret || '')
      .toString()
      .replace(/\s+/g, ' ')
      .replace(/[\uFEFF\u00A0]/g, '')
      .trim();

    if (!appKey || !appSecret) {
      throw new Error('AliExpress Dropshipping API App Key and App Secret are required for token exchange');
    }

    if (!code || code.trim().length === 0) {
      throw new Error('Authorization code is required');
    }

    const startTime = Date.now();
    const trimmedCode = code.trim();

    const ENDPOINTS = [
      { url: 'https://api-sg.aliexpress.com/rest/auth/token/create', signPath: '/auth/token/create' },
      { url: 'https://api-sg.aliexpress.com/rest/auth/token/security/create', signPath: '/auth/token/security/create' },
    ];

    const customEndpoint = (process.env.ALIEXPRESS_DROPSHIPPING_TOKEN_ENDPOINT || '').trim();
    if (customEndpoint) {
      const customSignPath = '/' + customEndpoint.replace(/^https?:\/\/[^/]+\/rest/, '').replace(/^\//, '');
      ENDPOINTS.unshift({ url: customEndpoint, signPath: customSignPath });
    }

    const parseTokenResponse = (obj: any) => {
      const getPayload = (o: any): Record<string, any> | null => {
        if (!o || typeof o !== 'object') return null;
        if (String(o.access_token || o.accessToken || '').trim()) return o;
        const inner = o.token_result ?? o.data ?? o.token_create_response;
        return inner ? getPayload(inner) : null;
      };
      const payload = getPayload(obj) ?? obj ?? {};
      return {
        accessToken: String(payload.access_token || payload.accessToken || '').trim(),
        refreshToken: String(payload.refresh_token || payload.refreshToken || '').trim(),
        expiresIn: Number(payload.expires_in || payload.expiresIn || 0) || 86400,
        refreshExpiresIn: Number(payload.refresh_expires_in || payload.refreshExpiresIn || 0) || 2592000,
      };
    };

    let lastError: any = null;

    for (const { url: tokenUrl, signPath } of ENDPOINTS) {
      const params: Record<string, string> = {
        app_key: appKey,
        code: trimmedCode,
        timestamp: Date.now().toString(),
        sign_method: 'sha256',
      };
      const sign = generateTokenCreateSignatureHmacSystemInterface(signPath, params, appSecret);
      params.sign = sign;

      const qs = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const fullUrl = `${tokenUrl}?${qs}`;
      const urlRedacted = fullUrl.replace(/code=[^&]+/, 'code=***').replace(/sign=[^&]+/, 'sign=***');

      const paramsSorted = Object.keys(params).filter((k) => k !== 'sign').sort();
      logger.info('[ALIEXPRESS-DROPSHIPPING-API] Token exchange attempt', {
        tokenExchangeStatus: 'started',
        endpoint: tokenUrl,
        signPath,
        paramsSorted,
        urlRedacted,
      });

      try {
        const response = await axios.post(fullUrl, null, {
          timeout: 15000,
          headers: { 'User-Agent': 'Ivan-Reseller/1.0' },
        });
        const rawData = response.data ?? response;

        logger.info('[ALIEXPRESS-DROPSHIPPING-API] Token exchange raw response', {
          endpoint: tokenUrl,
          signPath,
          status: response.status,
          hasData: !!rawData,
          dataKeys: rawData ? Object.keys(rawData) : [],
          code: rawData?.code,
          msg: rawData?.msg,
        });

        const errorResp = rawData?.error_response ?? rawData?.error_response_data ?? rawData?.error;
        if (errorResp && !rawData?.access_token && !rawData?.token_result?.access_token) {
          const aliCode = String(errorResp.code ?? errorResp.error_code ?? '').trim();
          const msg = String(errorResp.msg ?? errorResp.sub_msg ?? errorResp.error_msg ?? errorResp.message ?? '').trim();
          const requestId = rawData?.request_id ?? rawData?.data?.request_id ?? '';
          const err = new Error(`AliExpress OAuth error: ${msg || 'Unknown error'} (Code: ${aliCode})`);
          (err as any).aliexpressRequestId = requestId;
          (err as any).aliexpressResponse = rawData;
          (err as any).isIncompleteSignature = aliCode === 'IncompleteSignature' || aliCode === '15';
          throw err;
        }

        const { accessToken, refreshToken, expiresIn, refreshExpiresIn } = parseTokenResponse(rawData);

        if (!accessToken) {
          const aliCode = String(rawData?.code ?? '').trim();
          const aliMsg = String(rawData?.msg ?? rawData?.error_msg ?? '').trim();
          const isSignatureError = aliCode === 'IncompleteSignature' || aliMsg.includes('signature');
          let hint = aliCode || aliMsg ? ` AliExpress: ${aliMsg || aliCode}` : '';
          if (aliCode === 'ApiCallLimit') {
            hint += ' Espera unos minutos y vuelve a intentar.';
          }
          const requestId = rawData?.request_id ?? rawData?.data?.request_id ?? '';
          const err = new Error(`Invalid response: missing access_token.${hint}`);
          (err as any).aliexpressRequestId = requestId;
          (err as any).isIncompleteSignature = isSignatureError;
          throw err;
        }

        const elapsed = Date.now() - startTime;
        logger.info('[ALIEXPRESS-DROPSHIPPING-API] Token exchange successful', {
          tokenExchangeStatus: 'success',
          endpoint: tokenUrl,
          signPath,
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          expiresIn,
          refreshExpiresIn,
          elapsed,
        });

        return { accessToken, refreshToken, expiresIn, refreshExpiresIn };
      } catch (error: any) {
        lastError = error;
        const isSignatureError = error.isIncompleteSignature ||
          String(error.message || '').includes('IncompleteSignature') ||
          String(error.message || '').includes('signature');

        logger.warn('[ALIEXPRESS-DROPSHIPPING-API] Token exchange attempt failed', {
          endpoint: tokenUrl,
          signPath,
          error: error.message,
          isSignatureError,
          status: error.response?.status,
          responseData: error.response?.data,
        });

        if (isSignatureError) {
          logger.info('[ALIEXPRESS-DROPSHIPPING-API] Signature error, trying next endpoint...');
          continue;
        }
        break;
      }
    }

    const errorMessage =
      lastError?.response?.data?.error_description ??
      lastError?.response?.data?.error ??
      lastError?.message ??
      'Unknown error';

    logger.error('[ALIEXPRESS-DROPSHIPPING-API] Token exchange failed (all endpoints)', {
      tokenExchangeStatus: 'failed',
      error: errorMessage,
      endpointsTried: ENDPOINTS.map((e) => e.url),
    });

    const err = new Error(`AliExpress OAuth token exchange failed: ${errorMessage}`);
    (err as any).aliexpressRequestId = lastError?.aliexpressRequestId ?? lastError?.response?.data?.request_id;
    (err as any).aliexpressResponse = lastError?.response?.data ?? lastError?.aliexpressResponse;
    throw err;
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
   * Verifica que el access_token puede llamar APIs dropshipping reales.
   * `aliexpress.ds.account.get` devuelve InvalidApiPath en TOP actual — no usar.
   * Usa lectura de producto (mismo stack que fulfillment) con ID configurable.
   */
  async verifyOAuthTokenWithProductProbe(accessToken?: string): Promise<{
    ok: true;
    method: string;
    productId: string;
  }> {
    const token = accessToken || this.credentials?.accessToken;

    if (!token) {
      throw new Error('Access token is required for dropshipping verification');
    }

    const productId =
      (process.env.ALIEXPRESS_DROPSHIPPING_VERIFY_PRODUCT_ID || '').trim() || '1005009130509159';

    logger.info('[ALIEXPRESS-DROPSHIPPING-API] OAuth verify via read-only product probe', {
      hasAccessToken: !!token,
      productId,
    });

    const apiParams: Record<string, any> = {
      product_id: productId,
      ship_to_country: 'US',
      shipToCountry: 'US',
    };

    try {
      const result = await this.makeRequest('aliexpress.offer.ds.product.simplequery', apiParams);
      const product = (result as any)?.product || result;
      if (product && ((product as any).product_id || (product as any).product_title)) {
        logger.info('[ALIEXPRESS-DROPSHIPPING-API] Product probe OK (simplequery)', { productId });
        return { ok: true, method: 'aliexpress.offer.ds.product.simplequery', productId };
      }
    } catch (e1: any) {
      logger.warn('[ALIEXPRESS-DROPSHIPPING-API] simplequery probe failed, trying dropshipping.product.info.get', {
        message: e1?.message,
      });
    }

    try {
      await this.makeRequest('aliexpress.dropshipping.product.info.get', apiParams);
      logger.info('[ALIEXPRESS-DROPSHIPPING-API] Product probe OK (dropshipping.product.info.get)', { productId });
      return { ok: true, method: 'aliexpress.dropshipping.product.info.get', productId };
    } catch (e2: any) {
      logger.error('[ALIEXPRESS-DROPSHIPPING-API] Product probe failed', {
        productId,
        error: e2?.message || String(e2),
      });
      throw new Error(
        `Dropshipping token verification failed (product probes). Set ALIEXPRESS_DROPSHIPPING_VERIFY_PRODUCT_ID to a valid DS product. Last error: ${e2?.message || e2}`
      );
    }
  }

  /**
   * Compat: antes llamaba `aliexpress.ds.account.get` (InvalidApiPath). Ahora delega al product probe.
   */
  async getAccountInfo(accessToken?: string): Promise<any> {
    return this.verifyOAuthTokenWithProductProbe(accessToken);
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
