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
import logger from '../config/logger';
import type { AliExpressAffiliateCredentials } from '../types/api-credentials.types';
import { getToken, setToken, markNeedsReauth } from './aliexpress-token.store';
import { refreshAccessToken } from './aliexpress-oauth.service';
import { AffiliatePermissionMissingError } from '../errors/affiliate-permission-missing.error';
import crypto from 'crypto';
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
  /** Desde product.query / productdetail.get (envío real hacia ship_to_country). */
  shippingInfo?: {
    shipToCountry?: string;
    /** Días máximos si la API manda rango "7-15". */
    deliveryDaysMax?: number;
    shippingCost?: number;
    shippingCostCurrency?: string;
  };
}

/**
 * Días máximos desde shipping_info (número, "12", "7-15", "7–15", "12-20 days", textos con dígitos).
 * Toma el máximo de los números encontrados cuando hay varios (p. ej. rangos o "10 to 15").
 */
export function parseAffiliateDeliveryDaysMax(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const r = Math.round(raw);
    return r > 0 ? r : undefined;
  }
  const s = String(raw).trim();
  if (!s) return undefined;
  // Rango explícito: 7-15, 7–15 (en-dash), 7~15
  const rangeMatch = s.match(/(\d+)\s*[-–~]\s*(\d+)/);
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1], 10);
    const b = parseInt(rangeMatch[2], 10);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(a, b);
  }
  const nums = s.match(/\d+/g);
  if (nums?.length) {
    const vals = nums.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0);
    if (vals.length === 0) return undefined;
    // Cap razonable (evita años tipo 2025 en fechas mal parseadas)
    const capped = vals.map((n) => (n > 365 ? undefined : n)).filter((n): n is number => n != null);
    if (capped.length === 0) return undefined;
    return Math.max(...capped);
  }
  return undefined;
}

/** AliExpress a veces envuelve nodos como `{ string: "..." }` o `{ string: [ {...} ] }`. */
function unwrapAliExpressNode(raw: unknown): unknown {
  if (raw == null) return raw;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && raw !== null && 'string' in raw) {
    const inner = (raw as { string?: unknown }).string;
    if (Array.isArray(inner)) {
      if (inner.length === 1) return inner[0];
      return inner;
    }
    return inner ?? raw;
  }
  return raw;
}

type RawShippingRecord = Record<string, unknown>;

function pickShippingFromRecord(si: RawShippingRecord | null | undefined, productCurrency: string) {
  if (!si || typeof si !== 'object') return undefined;

  const shipTo =
    si.ship_to_country != null
      ? String(si.ship_to_country)
      : si.ship_to_country_code != null
        ? String(si.ship_to_country_code)
        : undefined;

  const deliveryRaw =
    si.delivery_days ??
    si.delivery_day ??
    si.estimated_delivery_days ??
    si.delivery_time ??
    si.delivery_time_desc ??
    si.delivery_desc ??
    si.max_delivery_days ??
    (si.min_delivery_days != null && si.max_delivery_days != null
      ? `${si.min_delivery_days}-${si.max_delivery_days}`
      : undefined);

  let deliveryMax = parseAffiliateDeliveryDaysMax(deliveryRaw);
  if ((deliveryMax == null || deliveryMax <= 0) && si.max_delivery_days != null) {
    deliveryMax = parseAffiliateDeliveryDaysMax(si.max_delivery_days);
  }
  if ((deliveryMax == null || deliveryMax <= 0) && si.min_delivery_days != null && si.max_delivery_days != null) {
    const a = Number(si.min_delivery_days);
    const b = Number(si.max_delivery_days);
    if (Number.isFinite(a) && Number.isFinite(b) && b > 0) deliveryMax = Math.max(a, b);
  }

  const scRaw = si.shipping_cost ?? si.delivery_cost ?? si.freight_cost ?? si.postage_fee;
  const sc = scRaw != null ? parseFloat(String(scRaw)) : NaN;
  const shipCostCur = String(
    si.shipping_cost_currency ?? si.shipping_currency ?? si.currency ?? productCurrency ?? 'USD'
  ).toUpperCase();

  const hasUseful =
    (deliveryMax != null && deliveryMax > 0) ||
    (Number.isFinite(sc) && sc > 0) ||
    (shipTo != null && shipTo.length > 0);

  if (!hasUseful) return undefined;

  return {
    shipToCountry: shipTo,
    deliveryDaysMax: deliveryMax != null && deliveryMax > 0 ? deliveryMax : undefined,
    shippingCost: Number.isFinite(sc) && sc > 0 ? sc : undefined,
    shippingCostCurrency: shipCostCur || String(productCurrency || 'USD').toUpperCase(),
  } satisfies NonNullable<AffiliateProduct['shippingInfo']>;
}

/**
 * Normaliza `shipping_info` de product.query / productdetail.get (objeto, array de métodos, o nodo `{ string: ... }`).
 */
export function normalizeAffiliateApiShippingInfo(
  raw: unknown,
  productCurrency: string
): AffiliateProduct['shippingInfo'] | undefined {
  const node = unwrapAliExpressNode(raw);
  if (node == null) return undefined;

  if (Array.isArray(node)) {
    let merged: AffiliateProduct['shippingInfo'] | undefined;
    for (const item of node) {
      const rec =
        typeof item === 'object' && item != null ? (item as RawShippingRecord) : null;
      const one = pickShippingFromRecord(rec, productCurrency);
      if (!one) continue;
      if (!merged) {
        merged = { ...one };
        continue;
      }
      if (one.deliveryDaysMax != null) {
        merged.deliveryDaysMax = Math.max(merged.deliveryDaysMax ?? 0, one.deliveryDaysMax);
      }
      if (one.shippingCost != null && one.shippingCost > 0 && !(merged.shippingCost != null && merged.shippingCost > 0)) {
        merged.shippingCost = one.shippingCost;
        merged.shippingCostCurrency = one.shippingCostCurrency;
      }
      if (!merged.shipToCountry && one.shipToCountry) merged.shipToCountry = one.shipToCountry;
    }
    return merged;
  }

  if (typeof node === 'object') {
    return pickShippingFromRecord(node as RawShippingRecord, productCurrency);
  }
  return undefined;
}

export interface AffiliateProductDetail extends AffiliateProduct {
  description?: string;
  categoryId?: string;
  categoryName?: string;
  shippingInfo?: {
    shipToCountry?: string;
    /** @deprecated usar deliveryDaysMax; se mantiene por compat. */
    deliveryDays?: number;
    deliveryDaysMax?: number;
    shippingCost?: number;
    shippingCostCurrency?: string;
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

/**
 * Normaliza product_small_image_urls de la API (puede venir como { string: [] }, { string: "url" } o array).
 * Asegura que siempre devolvemos string[] con URLs válidas.
 */
function normalizeSmallImageUrls(raw: any): string[] {
  if (!raw) return [];
  const arr: string[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((x: any) => { if (typeof x === 'string' && x.startsWith('http')) arr.push(x); });
    return arr;
  }
  const inner = raw.string;
  if (Array.isArray(inner)) {
    inner.forEach((x: any) => { if (typeof x === 'string' && x.startsWith('http')) arr.push(x); });
    return arr;
  }
  if (typeof inner === 'string' && inner.startsWith('http')) arr.push(inner);
  return arr;
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
    const affiliateKey = (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || '').trim();
    const affiliateSecret = (process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || '').trim();
    const legacyKey = (process.env.ALIEXPRESS_APP_KEY || '').trim();
    const legacySecret = (process.env.ALIEXPRESS_APP_SECRET || '').trim();
    const dsKey = (process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '').trim();
    const dsSecret = (process.env.ALIEXPRESS_DROPSHIPPING_APP_SECRET || '').trim();
    const rawKey = affiliateKey || (!dsKey ? legacyKey : '');
    const rawSecret = affiliateSecret || (!dsSecret ? legacySecret : '');
    if ((!affiliateKey || !affiliateSecret) && (legacyKey || legacySecret)) {
      logger.warn('[ALIEXPRESS-AFFILIATE] Using legacy ALIEXPRESS_APP_* vars. Configure ALIEXPRESS_AFFILIATE_APP_* for strict isolation.');
    }
    this.appKey = rawKey && rawKey !== 'PUT_YOUR_APP_KEY_HERE' ? rawKey : '';
    this.appSecret = rawSecret && rawSecret !== 'PUT_YOUR_APP_SECRET_HERE' ? rawSecret : '';
    this.trackingId = (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim();
    if (!this.appKey || !this.appSecret) {
      console.log('[ALIEXPRESS-AFFILIATE] Not configured (ALIEXPRESS_AFFILIATE_APP_KEY/APP_SECRET missing). Server will start; AliExpress features will use fallbacks.');
    } else {
      console.log('[AUTOPILOT] Affiliate API credentials loaded');
      console.log('[AUTOPILOT] Using APP_KEY mode');
      console.log('[ALIEXPRESS-AFFILIATE] TRACKING ID:', this.trackingId || 'MISSING');
    }
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

  /** Indica si la API está configurada (APP_KEY y APP_SECRET presentes). */
  isConfigured(): boolean {
    return !!(this.getEffectiveAppKey() && this.getEffectiveAppSecret());
  }

  private getEffectiveAppKey(): string {
    return (this.credentials?.appKey || this.appKey || '').trim();
  }

  private getEffectiveAppSecret(): string {
    return (this.credentials?.appSecret || this.appSecret || '').trim();
  }

  /** Skip tracking_id when invalid (causes 402). User must set valid ALIEXPRESS_TRACKING_ID in portals.aliexpress.com. */
  private getEffectiveTrackingId(): string {
    const t = (this.trackingId || '').trim();
    if (!t || t === 'ivanreseller_web' || t === 'ivanreseller') return '';
    return t;
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

  /** AliExpress SYNC: YYYY-MM-DD HH:mm:ss in GMT+8 (required by AliExpress TOP API). */
  private getTimestamp(): string {
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

  /**
   * TOP API HMAC-SHA256: sign = HMAC-SHA256(app_secret, sorted_key1+value1+key2+value2+...).
   * sign_method must be 'hmac-sha256' for this.
   */
  private generateSignature(params: Record<string, string>): string {
    const appSecret = this.getEffectiveAppSecret();
    const sortedKeys = Object.keys(params)
      .filter((k) => k !== 'sign')
      .sort();
    const baseString = sortedKeys.map((k) => k + params[k]).join('');
    return crypto
      .createHmac('sha256', appSecret)
      .update(baseString, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Build params, sign with HMAC-SHA256. POST to sync endpoint.
   */
  private async makeRequest(method: string, requestParams: Record<string, any>): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('ALIEXPRESS_API_NOT_CONFIGURED');
    }
    const appKey = this.getEffectiveAppKey();
    const params: Record<string, string> = {
      app_key: String(appKey),
      method: String(method),
      format: 'json',
      sign_method: 'hmac-sha256',
      timestamp: String(this.getTimestamp()),
      v: '2.0',
    };
    Object.entries(requestParams || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params[key] = String(value);
      }
    });
    params.sign = this.generateSignature(params);

    const response = await this.client.post(
      'https://api-sg.aliexpress.com/sync',
      new URLSearchParams(params).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
      }
    );
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
        fields:
          'product_id,product_title,product_main_image_url,product_small_image_urls,sale_price,original_price,target_sale_price,target_sale_price_currency,product_detail_url,promotion_link,commission_rate,currency,evaluate_score,evaluate_rate,volume,shipping_info',
      };
      if (params.targetCurrency) requestParams.target_currency = params.targetCurrency;
      if (params.targetLanguage) requestParams.target_language = params.targetLanguage;
      if (params.shipToCountry) requestParams.ship_to_country = params.shipToCountry;
      const effectiveTrackingId = this.getEffectiveTrackingId();
      if (effectiveTrackingId) requestParams.tracking_id = effectiveTrackingId;

      const data = await this.makeRequest('aliexpress.affiliate.product.query', requestParams);

      if (data?.error_response) {
        const err = data.error_response;
        const msg = err.msg || err.error_msg || err.sub_msg || 'Unknown error';
        const code = err.code || err.error_code || 'UNKNOWN';
        throw new Error(`ALIEXPRESS_API_ERROR: ${msg} (Code: ${code})`);
      }

      // AliExpress API returns product as single object when 1 result, array when multiple
      const resp = data?.aliexpress_affiliate_product_query_response;
      const result = resp?.resp_result?.result ?? resp?.result;
      const rawProduct = result?.products?.product ?? data?.result?.products?.product;
      const products = Array.isArray(rawProduct)
        ? rawProduct
        : rawProduct && typeof rawProduct === 'object'
          ? [rawProduct]
          : [];

      if (products.length === 0) {
        console.log('[AUTOPILOT] Affiliate empty');
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
        const shippingInfo = normalizeAffiliateApiShippingInfo(p.shipping_info, currency);
        return {
          productId: String(p.product_id || ''),
          productTitle: p.product_title || '',
          productMainImageUrl: p.product_main_image_url || '',
          productSmallImageUrls: normalizeSmallImageUrls(p.product_small_image_urls),
          salePrice: price,
          originalPrice: parseFloat(p.original_price || '0'),
          discount: parseFloat(p.discount || '0'),
          evaluateScore:
            p.evaluate_score != null && String(p.evaluate_score).trim() !== ''
              ? parseFloat(String(p.evaluate_score).replace(/%/g, ''))
              : undefined,
          evaluateRate:
            p.evaluate_rate != null && String(p.evaluate_rate).trim() !== ''
              ? parseFloat(String(p.evaluate_rate).replace(/%/g, ''))
              : undefined,
          volume: p.volume != null ? parseInt(String(p.volume), 10) : undefined,
          productDetailUrl: p.product_detail_url,
          promotionLink: p.promotion_link,
          currency,
          commissionRate: Number.isFinite(commissionRate) ? commissionRate : undefined,
          estimatedProfit,
          shippingInfo,
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
        productSmallImageUrls: normalizeSmallImageUrls(p.product_small_image_urls),
        salePrice: parseFloat(p.sale_price || '0'),
        originalPrice: parseFloat(p.original_price || '0'),
        discount: parseFloat(p.discount || '0'),
        evaluateScore: (() => {
          if (p.evaluate_score == null || String(p.evaluate_score).trim() === '') return undefined;
          const n = parseFloat(String(p.evaluate_score).replace(/%/g, ''));
          return Number.isFinite(n) ? n : undefined;
        })(),
        evaluateRate: (() => {
          if (p.evaluate_rate == null || String(p.evaluate_rate).trim() === '') return undefined;
          const n = parseFloat(String(p.evaluate_rate).replace(/%/g, ''));
          return Number.isFinite(n) ? n : undefined;
        })(),
        volume: (() => {
          if (p.volume == null || String(p.volume).trim() === '') return undefined;
          const n = parseInt(String(p.volume), 10);
          return Number.isFinite(n) ? n : undefined;
        })(),
        storeName: p.store_name,
        storeUrl: p.store_url,
        productDetailUrl: p.product_detail_url,
        promotionLink: p.promotion_link,
        currency: p.currency || 'USD',
        commissionRate: p.commission_rate ? parseFloat(p.commission_rate) : undefined,
        description: p.description,
        categoryId: p.category_id,
        categoryName: p.category_name,
        shippingInfo: (() => {
          const sh = normalizeAffiliateApiShippingInfo(p.shipping_info, p.currency || 'USD');
          if (!sh) return undefined;
          return {
            shipToCountry: sh.shipToCountry,
            deliveryDays: sh.deliveryDaysMax,
            deliveryDaysMax: sh.deliveryDaysMax,
            shippingCost: sh.shippingCost,
            shippingCostCurrency: sh.shippingCostCurrency,
          };
        })(),
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
   * Si product.query no trae shipping_info completo, rellena con productdetail.get (coste y plazo reales hacia ship_to).
   */
  async enrichProductsWithDetailShipping(
    products: AffiliateProduct[],
    opts?: { shipToCountry?: string; targetCurrency?: string; targetLanguage?: string }
  ): Promise<void> {
    if (!products?.length) return;
    const shipTo = String(opts?.shipToCountry || 'US').trim().toUpperCase() || 'US';
    const needsDeliveryDays = (p: AffiliateProduct) => {
      const d = p.shippingInfo?.deliveryDaysMax;
      return d == null || !Number.isFinite(Number(d)) || Number(d) <= 0;
    };
    const needsShippingCost = (p: AffiliateProduct) => !(Number(p.shippingInfo?.shippingCost) > 0);
    const needsSupplierMetrics = (p: AffiliateProduct) => {
      const sc = p.evaluateScore != null ? Number(p.evaluateScore) : NaN;
      const rt = p.evaluateRate != null ? Number(p.evaluateRate) : NaN;
      const hasScore = Number.isFinite(sc) && sc > 0;
      const hasRate = Number.isFinite(rt) && rt > 0;
      return !hasScore && !hasRate;
    };

    const mergeDetailBatch = (
      chunk: AffiliateProduct[],
      details: AffiliateProductDetail[],
      effectiveShipTo: string,
      updateCost: boolean
    ) => {
      const byId = new Map(details.map((d) => [d.productId, d]));
      for (const p of chunk) {
        const d = byId.get(p.productId);
        if (d) {
          if (
            (p.evaluateScore == null || !Number.isFinite(Number(p.evaluateScore))) &&
            d.evaluateScore != null &&
            Number.isFinite(Number(d.evaluateScore))
          ) {
            p.evaluateScore = d.evaluateScore;
          }
          if (
            (p.evaluateRate == null || !Number.isFinite(Number(p.evaluateRate))) &&
            d.evaluateRate != null &&
            Number.isFinite(Number(d.evaluateRate))
          ) {
            p.evaluateRate = d.evaluateRate;
          }
          if (
            (p.volume == null || !Number.isFinite(Number(p.volume)) || Number(p.volume) < 0) &&
            d.volume != null &&
            Number.isFinite(Number(d.volume))
          ) {
            p.volume = d.volume;
          }
        }
        const dsi = d?.shippingInfo;
        if (!dsi) continue;
        const dMax = dsi.deliveryDaysMax ?? dsi.deliveryDays;
        const sc = dsi.shippingCost != null ? Number(dsi.shippingCost) : NaN;
        const nextCost =
          updateCost && Number.isFinite(sc) && sc > 0 ? sc : p.shippingInfo?.shippingCost;
        const nextCostCur =
          updateCost && Number.isFinite(sc) && sc > 0
            ? dsi.shippingCostCurrency || d.currency || p.shippingInfo?.shippingCostCurrency || p.currency || 'USD'
            : p.shippingInfo?.shippingCostCurrency || p.currency || 'USD';
        p.shippingInfo = {
          ...p.shippingInfo,
          shipToCountry: dsi.shipToCountry || p.shippingInfo?.shipToCountry || effectiveShipTo,
          deliveryDaysMax:
            dMax != null && Number.isFinite(dMax) && dMax > 0 ? dMax : p.shippingInfo?.deliveryDaysMax,
          shippingCost: nextCost,
          shippingCostCurrency: nextCostCur,
        };
      }
    };

    const runEnrichBatches = async (list: AffiliateProduct[], effectiveShipTo: string, updateCost: boolean) => {
      const chunkSize = 10;
      for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list.slice(i, i + chunkSize);
        const ids = chunk.map((p) => p.productId).filter(Boolean).join(',');
        if (!ids) continue;
        try {
          const details = await this.getProductDetails({
            productIds: ids,
            shipToCountry: effectiveShipTo,
            targetCurrency: opts?.targetCurrency,
            targetLanguage: opts?.targetLanguage,
          });
          mergeDetailBatch(chunk, details, effectiveShipTo, updateCost);
        } catch (e: any) {
          logger.warn('[ALIEXPRESS-AFFILIATE-API] enrichProductsWithDetailShipping failed', {
            error: e?.message || String(e),
            batchSize: chunk.length,
            shipTo: effectiveShipTo,
          });
        }
      }
    };

    const need = products.filter(
      (p) =>
        p.productId &&
        (needsShippingCost(p) || needsDeliveryDays(p) || needsSupplierMetrics(p))
    );
    if (need.length === 0) return;

    await runEnrichBatches(need, shipTo, true);

    // Muchos listados solo devuelven plazo al cotizar hacia US; no pisar coste ya resuelto para otro país.
    const stillNoDays = products.filter((p) => p.productId && needsDeliveryDays(p));
    if (stillNoDays.length > 0 && shipTo !== 'US') {
      logger.info('[ALIEXPRESS-AFFILIATE-API] enrich: retry productdetail.get with ship_to US for delivery days', {
        count: stillNoDays.length,
        originalShipTo: shipTo,
      });
      await runEnrichBatches(stillNoDays, 'US', false);
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
        estimatedDays: p.shippingInfo.deliveryDaysMax ?? p.shippingInfo.deliveryDays,
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
