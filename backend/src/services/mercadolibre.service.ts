// @ts-nocheck
import { trace } from '../utils/boot-trace';
trace('loading mercadolibre.service');

import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import fs from 'fs/promises';
import path from 'path';
import { AppError } from '../middleware/error.middleware';
import { retryMarketplaceOperation } from '../utils/retry.util';
import { acquireMarketplaceRateLimit } from './marketplace-rate-limit.service';
import logger from '../config/logger';

export interface MercadoLibreCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  siteId: string; // MLM (México), MLA (Argentina), MLB (Brasil), etc.
}

export interface MLProduct {
  /** Phase 1.1: allows canonical publish flow verification; direct calls are blocked unless explicitly overridden. */
  __publishContext?: 'marketplace_service';
  title: string;
  description: string;
  categoryId: string;
  price: number;
  quantity: number;
  condition: string;
  images: string[];
  attributes?: Array<{
    id: string;
    value: string | number;
    value_id?: string;
  }>;
  shipping?: {
    mode: string;
    cost?: number;
    freeShipping?: boolean;
    /** Días de despacho declarados al comprador (handling_time en API ML). */
    handlingTime?: number;
    /** Mercado Envíos me2: "LxWxH_cm,weight_grams" (ej. 10x10x8,300) */
    dimensions?: string;
  };
}

/** Common typos from AliExpress/suppliers that break ML display (VIP67). */
const TITLE_TYPO_FIXES: [RegExp, string][] = [
  [/\bwirelesss\b/gi, 'wireless'],
  [/\bbluetoth\b/gi, 'bluetooth'],
  [/\bblutooth\b/gi, 'bluetooth'],
];

/**
 * ML policy: avoid "tipo X", "símil X", "réplica", "idéntico a", "igual a" for brands.
 * Replace with "compatible con X" or remove. Applied to title and description.
 */
const IP_POLICY_REPLACEMENTS: [RegExp, string][] = [
  [/\btipo\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bsímil\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bsimil\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bréplica\s+de\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\breplica\s+de\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bidéntico\s+a\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bidentico\s+a\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bigual\s+a\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bréplica\b/gi, ''],
  [/\breplica\b/gi, ''],
];

function applyIPPolicySanitization(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let s = text;
  for (const [re, replacement] of IP_POLICY_REPLACEMENTS) {
    s = s.replace(re, replacement);
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** Patterns that indicate IP policy violation (read-only check). */
const IP_VIOLATION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\btipo\s+[A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+/gi, label: 'tipo [marca]' },
  { pattern: /\bsímil\s+[A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+/gi, label: 'símil [marca]' },
  { pattern: /\bsimil\s+[A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+/gi, label: 'simil [marca]' },
  { pattern: /\bréplica\s+de\s+[A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+/gi, label: 'réplica de [marca]' },
  { pattern: /\breplica\s+de\s+[A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+/gi, label: 'replica de [marca]' },
  { pattern: /\bidéntico\s+a\s+[A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+/gi, label: 'idéntico a [marca]' },
  { pattern: /\bidentico\s+a\s+[A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+/gi, label: 'identico a [marca]' },
  { pattern: /\bigual\s+a\s+[A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+/gi, label: 'igual a [marca]' },
  { pattern: /\bréplica\b/gi, label: 'réplica' },
  { pattern: /\breplica\b/gi, label: 'replica' },
];

/**
 * Check if title and description comply with ML IP policy (no "tipo X", "símil", "réplica", etc.).
 * Exported for compliance verification.
 */
export function checkMLCompliance(title: string, description: string): { compliant: boolean; violations: string[] } {
  const violations: string[] = [];
  const text = `${title || ''} ${description || ''}`;
  for (const { pattern, label } of IP_VIOLATION_PATTERNS) {
    if (text.match(pattern)) violations.push(label);
  }
  return { compliant: violations.length === 0, violations: [...new Set(violations)] };
}

/**
 * Sanitize title for MercadoLibre: fix typos, apply IP policy, remove invalid chars. ML allows 60 chars.
 * Exported for use in repair/update flows.
 */
export function sanitizeTitleForML(title: string): string {
  if (!title || typeof title !== 'string') return 'Producto';
  let s = title.trim();
  for (const [re, replacement] of TITLE_TYPO_FIXES) {
    s = s.replace(re, replacement);
  }
  s = applyIPPolicySanitization(s);
  s = s.replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ.,\-\/()]/gi, '').trim();
  if (s.length > 60) s = s.substring(0, 57) + '...';
  return s || 'Producto';
}

const ML_DESCRIPTION_MAX = 5000;

/**
 * Sanitize description for MercadoLibre: strip HTML, apply IP policy, limit length, remove control chars.
 * Exported for use in repair/update flows.
 */
export function sanitizeDescriptionForML(desc: string): string {
  if (!desc || typeof desc !== 'string') return 'Producto de calidad.';
  let s = desc
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .trim();
  s = applyIPPolicySanitization(s);
  if (s.length > ML_DESCRIPTION_MAX) s = s.substring(0, ML_DESCRIPTION_MAX - 3) + '...';
  return s || 'Producto de calidad.';
}

export interface MLListingResponse {
  success: boolean;
  itemId?: string;
  permalink?: string;
  status?: string;
  error?: string;
}

export interface MLItemPicture {
  id?: string;
  url?: string;
  secure_url?: string;
  max_size?: string;
}

export interface MLItemSnapshot {
  id?: string;
  category_id?: string;
  title?: string;
  status?: string;
  sub_status?: string[];
  health?: number;
  permalink?: string;
  pictures?: MLItemPicture[];
}

export class MercadoLibreService {
  private credentials: MercadoLibreCredentials;
  private apiClient: AxiosInstance;
  private baseUrl = 'https://api.mercadolibre.com';

  /**
   * Public site search — no user OAuth required. Used for opportunity competition / comparable pricing.
   * https://api.mercadolibre.com/sites/{SITE_ID}/search?q=
   */
  static async searchSiteCatalogPublic(params: {
    siteId: string;
    q: string;
    limit?: number;
  }): Promise<
    Array<{
      id: string;
      title: string;
      price: number;
      currency_id: string;
      permalink: string;
      seller_id?: number;
      shipping?: { free_shipping?: boolean };
    }>
  > {
    const site = params.siteId || 'MLM';
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
    await acquireMarketplaceRateLimit('mercadolibre');
    const q = new URLSearchParams();
    q.set('q', params.q);
    q.set('limit', String(limit));
    const { data } = await axios.get(`${MercadoLibreService.publicBaseUrl}/sites/${encodeURIComponent(site)}/search?${q.toString()}`, {
      timeout: 25000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'IvanReseller-Backend/1.0 (+https://www.ivanreseller.com)',
      },
    });
    const results = (data?.results || []) as any[];
    return results.map((r) => ({
      id: String(r.id),
      title: r.title,
      price: Number(r.price) || 0,
      currency_id: r.currency_id || '',
      permalink: r.permalink || '',
      seller_id: r.seller?.id,
      shipping: r.shipping,
    }));
  }

  private static readonly publicBaseUrl = 'https://api.mercadolibre.com';

  constructor(credentials: MercadoLibreCredentials) {
    this.credentials = {
      ...credentials,
      siteId: credentials.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
    };
    
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Phase 1: Per-marketplace rate limit
    this.apiClient.interceptors.request.use(async (config) => {
      await acquireMarketplaceRateLimit('mercadolibre');
      return config;
    });
    // Add request interceptor for authentication
    this.apiClient.interceptors.request.use((config) => {
      if (this.credentials.accessToken) {
        config.headers['Authorization'] = `Bearer ${this.credentials.accessToken}`;
      }
      return config;
    });
  }

  private isRemoteImageInput(input: string): boolean {
    return /^https?:\/\//i.test(String(input || '').trim());
  }

  private getLocalImageContentType(inputPath: string): string {
    switch (path.extname(inputPath).toLowerCase()) {
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.jpeg':
      case '.jpg':
      default:
        return 'image/jpeg';
    }
  }

  /**
   * Get MercadoLibre authentication URL for OAuth flow
   */
  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.credentials.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
    });

    const authDomain = this.getAuthDomain(this.credentials.siteId);
    return `https://auth.${authDomain}/authorization?${params.toString()}`;
  }

  private getAuthDomain(siteId: string): string {
    const domains: Record<string, string> = {
      MLC: 'mercadolibre.cl',
      MLM: 'mercadolibre.com.mx',
      MLA: 'mercadolibre.com.ar',
      MLB: 'mercadolivre.com.br',
      MCO: 'mercadolibre.com.co',
      MLU: 'mercadolibre.com.uy',
      MPE: 'mercadolibre.com.pe',
      MEC: 'mercadolibre.com.ec',
    };
    return domains[siteId] || 'mercadolibre.com.ar';
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken: string;
    userId: string;
    expiresIn: number;
  }> {
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('client_id', this.credentials.clientId);
      params.append('client_secret', this.credentials.clientSecret);
      params.append('code', code);
      params.append('redirect_uri', redirectUri);

      const response = await axios.post(
        `${this.baseUrl}/oauth/token`,
        params.toString(),
        {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
        }
      );

      if (!response.data || !response.data.access_token) {
        throw new Error('Invalid token exchange response: missing access_token');
      }

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        userId: response.data.user_id,
        expiresIn: response.data.expires_in,
      };
    } catch (error: any) {
      const mlData = error.response?.data;
      const mlStatus = error.response?.status;
      const detail = mlData?.message || mlData?.error_description || mlData?.error || error.message;
      logger.error('[MercadoLibre] Token exchange failed', {
        status: mlStatus,
        responseData: JSON.stringify(mlData),
        detail,
        clientIdLen: this.credentials.clientId?.length,
        clientIdHasWhitespace: /\s/.test(this.credentials.clientId || ''),
        secretLen: this.credentials.clientSecret?.length,
        secretHasWhitespace: /\s/.test(this.credentials.clientSecret || ''),
      });
      throw new AppError(`MercadoLibre OAuth error: ${detail}`, 400);
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<{ accessToken: string; expiresIn: number }> {
    if (!this.credentials.refreshToken) {
      throw new AppError('No refresh token available', 400);
    }

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('client_id', this.credentials.clientId);
      params.append('client_secret', this.credentials.clientSecret);
      params.append('refresh_token', this.credentials.refreshToken!);

      const result = await retryMarketplaceOperation(
        () => axios.post(`${this.baseUrl}/oauth/token`, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
        }),
        'mercadolibre',
        {
          maxRetries: 3,
          initialDelay: 1500,
          onRetry: (attempt, error, delay) => {
            logger.warn(`Retrying refreshAccessToken for MercadoLibre (attempt ${attempt})`, {
              error: error.message,
              delay,
            });
          },
        }
      );

      if (!result.success || !result.data) {
        throw new AppError(`Failed to refresh token after retries: ${result.error?.message || 'Unknown error'}`, 401);
      }

      const response = result.data;
      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error: any) {
      throw new AppError(`MercadoLibre token refresh error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Download an image from a URL and upload it to ML's Picture API.
   * Phase 2: Runs image pipeline (resize min 1200x1200, normalize format) before upload.
   * Returns the ML-hosted picture ID, or null if the upload fails.
   */
  async uploadImage(imageUrl: string): Promise<string | null> {
    try {
      let buffer: Buffer;
      let contentType = 'image/jpeg';
      if (this.isRemoteImageInput(imageUrl)) {
        const imgResp = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          maxContentLength: 10 * 1024 * 1024,
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
        });
        buffer = Buffer.from(imgResp.data);
        contentType = imgResp.headers['content-type'] || 'image/jpeg';
      } else {
        buffer = await fs.readFile(imageUrl);
        contentType = this.getLocalImageContentType(imageUrl);
      }

      // Phase 2: Image pipeline — resize (min 1200x1200), normalize to JPEG
      try {
        const { processBuffer } = await import('./image-pipeline.service');
        const processed = await processBuffer(buffer, contentType);
        buffer = processed.buffer;
      } catch (pipeErr: any) {
        logger.warn('[MercadoLibre] Image pipeline failed, using original', {
          imageUrl: imageUrl.substring(0, 80),
          error: pipeErr?.message,
        });
      }

      const MIN_IMAGE_BYTES = 15 * 1024; // 15KB minimum for a quality product photo
      if (buffer.length < MIN_IMAGE_BYTES) {
        logger.warn('[MercadoLibre] Image below quality threshold, skipping', {
          imageUrl: imageUrl.substring(0, 120),
          bytes: buffer.length,
          minRequired: MIN_IMAGE_BYTES,
        });
        return null;
      }

      const form = new FormData();
      form.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

      const uploadResp = await axios.post(
        `${this.baseUrl}/pictures/items/upload`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${this.credentials.accessToken}`,
          },
          timeout: 30000,
          maxContentLength: 10 * 1024 * 1024,
        },
      );

      const pictureId = uploadResp.data?.id;
      const maxSize = uploadResp.data?.max_size;
      if (!pictureId) {
        logger.warn('[MercadoLibre] Upload response missing picture id', { imageUrl });
        return null;
      }

      if (maxSize) {
        const [w, h] = String(maxSize).split('x').map(Number);
        if ((w && w < 600) || (h && h < 600)) {
          logger.warn('[MercadoLibre] Uploaded image has low resolution, ML may reject it', {
            pictureId, maxSize, bytes: buffer.length,
          });
        }
        if ((w && w < 1200) || (h && h < 1200)) {
          logger.warn('[MercadoLibre] Cover image below 1200x1200 recommended by ML', { pictureId, maxSize });
        }
      }

      logger.info('[MercadoLibre] Image uploaded successfully', { pictureId, maxSize, bytes: buffer.length });
      return pictureId;
    } catch (err: any) {
      logger.warn('[MercadoLibre] Image upload failed', {
        imageUrl: imageUrl.substring(0, 120),
        error: err.response?.data?.message || err.message,
        status: err.response?.status,
      });
      return null;
    }
  }

  /**
   * Upload multiple images to ML. Returns array of successfully uploaded picture IDs.
   */
  async uploadImages(imageUrls: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const url of imageUrls) {
      const id = await this.uploadImage(url);
      if (id) ids.push(id);
    }
    return ids;
  }

  /**
   * Validate listing before publish. Returns { valid: boolean, errors?: string[] }.
   * Optional: call before createListing to surface ML validation issues.
   */
  async validateListing(data: Record<string, any>): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const response = await this.apiClient.post('/items/validate', data, {
        validateStatus: (s) => s === 204 || s >= 400,
      });
      if (response.status === 204) {
        return { valid: true };
      }
      const body = response.data;
      const errors: string[] = [];
      if (body?.message) errors.push(body.message);
      if (body?.error) errors.push(body.error);
      (body?.cause || []).forEach((c: any) => {
        if (c?.message) errors.push(`${c.code || ''}: ${c.message}`);
      });
      return { valid: false, errors: errors.length ? errors : [JSON.stringify(body)] };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      return { valid: false, errors: [msg] };
    }
  }

  /**
   * Resolve attributes to ML API format: use value_id when attribute has predefined values.
   */
  private async resolveAttributesForML(
    attrs: Array<{ id: string; value: string | number; value_id?: string }>,
    categoryId: string
  ): Promise<Array<{ id: string; value_id?: string; value_name?: string }>> {
    let catAttrs: any[] = [];
    try {
      catAttrs = await this.getCategoryAttributes(categoryId);
    } catch {
      return attrs.map((a) => ({ id: a.id, value_name: String(a.value) }));
    }
    const catMap = new Map<string, any>(catAttrs.map((a) => [a.id, a]));
    const result: Array<{ id: string; value_id?: string; value_name?: string }> = [];
    for (const attr of attrs) {
      if (attr.value_id) {
        result.push({ id: attr.id, value_id: attr.value_id });
        continue;
      }
      const catAttr = catMap.get(attr.id);
      const valStr = String(attr.value).trim().toLowerCase();
      if (catAttr?.values && Array.isArray(catAttr.values) && catAttr.values.length > 0) {
        const match = catAttr.values.find(
          (v: any) => String(v.name || '').trim().toLowerCase() === valStr
        );
        if (match?.id) {
          result.push({ id: attr.id, value_id: String(match.id) });
          continue;
        }
        const first = catAttr.values[0];
        if (first?.id) {
          result.push({ id: attr.id, value_id: String(first.id) });
          continue;
        }
      }
      result.push({ id: attr.id, value_name: String(attr.value) });
    }
    return result;
  }

  /**
   * Create MercadoLibre listing
   */
  async createListing(product: MLProduct): Promise<MLListingResponse> {
    if (!this.credentials.accessToken || !this.credentials.userId) {
      throw new AppError('MercadoLibre authentication required', 401);
    }

    const directCreateAllowed = process.env.ML_ALLOW_DIRECT_CREATE_LISTING === 'true';
    const isCanonicalPublish = product.__publishContext === 'marketplace_service';
    if (!directCreateAllowed && !isCanonicalPublish) {
      throw new AppError(
        'MercadoLibre direct createListing path is blocked in Phase 1.1. Use canonical MarketplaceService publish flow, or set ML_ALLOW_DIRECT_CREATE_LISTING=true for controlled emergency scripts.',
        423,
      );
    }

    // Phase 1 remediation: for MLC/me2 flows, physical package dimensions are mandatory and must be real.
    const normalizedShippingMode = String(product.shipping?.mode || '').trim().toLowerCase();
    const requiresStrictPackageTruth = this.credentials.siteId === 'MLC' || normalizedShippingMode === 'me2';
    if (requiresStrictPackageTruth) {
      const dimensions = String(product.shipping?.dimensions || '').trim();
      if (!dimensions) {
        throw new AppError(
          'MercadoLibre publish blocked: shipping.dimensions is required (format LxWxH,grams) for MLC/me2.',
          400,
        );
      }
      const parsed = dimensions.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/i);
      if (!parsed) {
        throw new AppError(
          'MercadoLibre publish blocked: shipping.dimensions must use real package format LxWxH,grams (e.g. 12x10x8,350).',
          400,
        );
      }
      const dims = parsed.slice(1).map((n) => Number(n));
      if (dims.some((n) => !Number.isFinite(n) || n <= 0)) {
        throw new AppError(
          'MercadoLibre publish blocked: shipping.dimensions values must be positive and non-zero.',
          400,
        );
      }
    }

    // Pre-upload images to ML to avoid AliExpress CDN anti-hotlinking blocks
    const uploadedIds = await this.uploadImages(product.images);

    if (uploadedIds.length === 0) {
      throw new AppError(
        `Cannot publish to MercadoLibre: none of the ${product.images.length} product images met quality requirements (min 15KB). Add higher resolution images to this product.`,
        400,
      );
    }
    if (uploadedIds.length === 1) {
      logger.warn('[MercadoLibre] Only 1 image uploaded — ML listings perform better with 3+ images', {
        originalCount: product.images.length,
      });
    }

    const pictures = uploadedIds.map(id => ({ id }));
    logger.info('[MercadoLibre] Using pre-uploaded images', { count: uploadedIds.length });

    const sanitizedTitle = sanitizeTitleForML(product.title);
    const sanitizedDesc = sanitizeDescriptionForML(product.description);

    const listingData: Record<string, any> = {
      title: sanitizedTitle,
      category_id: product.categoryId,
      price: product.price,
      currency_id: this.getSiteCurrency(this.credentials.siteId),
      available_quantity: product.quantity,
      condition: product.condition,
      buying_mode: 'buy_it_now',
      description: {
        plain_text: sanitizedDesc,
      },
      pictures,
    };

    if (product.attributes && product.attributes.length > 0) {
      listingData.attributes = await this.resolveAttributesForML(
        product.attributes,
        product.categoryId
      );
    }

    if (product.shipping && product.shipping.mode !== 'not_specified') {
      const shippingPayload: Record<string, unknown> = {
        mode: product.shipping.mode || 'not_specified',
        free_shipping: product.shipping.freeShipping || false,
      };
      if (typeof product.shipping.handlingTime === 'number' && product.shipping.handlingTime > 0) {
        shippingPayload.handling_time = product.shipping.handlingTime;
      }
      if (product.shipping.dimensions && String(product.shipping.dimensions).trim().length > 0) {
        shippingPayload.dimensions = String(product.shipping.dimensions).trim();
      }
      listingData.shipping = shippingPayload;
    } else if (this.credentials.siteId === 'MLC') {
      throw new AppError(
        'MercadoLibre publish blocked: shipping.mode cannot be not_specified for MLC. Provide explicit me2 shipping data.',
        400,
      );
    }

    const listingTypes = ['gold_special', 'gold_pro', 'free'];
    const validation = await this.validateListing({ ...listingData, listing_type_id: listingTypes[0] });
    if (!validation.valid && validation.errors?.length) {
      logger.warn('[MercadoLibre] Pre-validation reported issues', { errors: validation.errors });
    }
    let lastError: any = null;

    for (const listingType of listingTypes) {
      listingData.listing_type_id = listingType;

      logger.info('[MercadoLibre] createListing attempt', {
        title: listingData.title?.substring(0, 60),
        category_id: listingData.category_id,
        price: listingData.price,
        currency_id: listingData.currency_id,
        listing_type_id: listingType,
        pictureCount: listingData.pictures?.length,
        attributeCount: listingData.attributes?.length || 0,
        siteId: this.credentials.siteId,
      });

      try {
        const response = await this.apiClient.post('/items', listingData);
        const itemId = response.data.id;

        // MLC: ML silently reverts me2→not_specified during POST for some categories
        // (warning: shipping.lost_me2_by_catalog). The listing is immediately active
        // which means a follow-up PUT to set me2 also fails ("Cannot update item
        // [status:active]"). This is a hard ML platform limitation — shipping.mode
        // cannot be changed on active listings via API.
        //
        // Mitigation in effect:
        //  1. The listing description includes explicit international shipping info (20-30 days)
        //  2. The buyer sees "Entrega a acordar con el vendedor" instead of the me2 ETA
        //  3. The account has mandatory_settings.mode=me2; listings with not_specified
        //     may be flagged by ML's automated compliance scan → forbidden
        //
        // Status flag: SHIPPING_TRUTH_NOT_ENFORCED_ON_ML
        // Recommended action: contact ML support for account-level me2 exemption for
        // international dropshipping, or switch to not_specified as official mode.
        if (this.credentials.siteId === 'MLC') {
          const handlingTime = (product.shipping as any)?.handlingTime ?? 0;
          const dimStr =
            product.shipping?.dimensions && String(product.shipping.dimensions).trim().length > 0
              ? String(product.shipping.dimensions).trim()
              : undefined;
          try {
            await this.apiClient.put(`/items/${itemId}`, {
              shipping: {
                mode: 'me2',
                free_shipping: product.shipping?.freeShipping ?? false,
                ...(handlingTime > 0 ? { handling_time: handlingTime } : {}),
                ...(dimStr ? { dimensions: dimStr } : {}),
                local_pick_up: false,
              },
            });
            logger.info('[MercadoLibre] me2 shipping enforced post-creation', { itemId, handlingTime });
          } catch (shippingErr: any) {
            const shippingErrMsg = shippingErr?.response?.data?.message || shippingErr?.message;
            logger.warn('[MercadoLibre] SHIPPING_TRUTH_NOT_ENFORCED_ON_ML — me2 could not be set post-creation', {
              itemId,
              handlingTime,
              error: shippingErrMsg,
              impact: 'Listing will show not_specified shipping; description contains ETA info',
              action: 'Monitor for under_review:forbidden triggered by ML compliance scan',
            });
          }
        }

        const verified = await this.getItemStatus(itemId);
        if (verified && verified.status !== 'active') {
          logger.warn('[MercadoLibre] Listing created but not active', {
            itemId,
            status: verified.status,
            sub_status: verified.sub_status,
            health: verified.health,
          });
        }

        return {
          success: true,
          itemId,
          permalink: verified?.permalink || response.data.permalink,
          status: verified?.status || response.data.status,
        };
      } catch (err: any) {
        lastError = err;
        const causes = (err.response?.data?.cause || []).map((c: any) => c.code).join(',');
        const isListingTypeError = causes.includes('listing_type') ||
          err.response?.data?.message?.includes('listing_type');

        if (!isListingTypeError) {
          break;
        }
        logger.warn(`[MercadoLibre] listing_type_id ${listingType} rejected, trying next`, { causes });
      }
    }

    const mlData = lastError?.response?.data;
    const causeMessages = (mlData?.cause || []).map((c: any) => `${c.code}: ${c.message}`).join('; ');
    const errorMessage = causeMessages || mlData?.message || mlData?.error || lastError?.message;
    logger.error('[MercadoLibre] createListing failed (all listing types)', {
      status: lastError?.response?.status,
      message: mlData?.message,
      cause: JSON.stringify(mlData?.cause),
      fullResponse: JSON.stringify(mlData),
    });
    throw new AppError(`MercadoLibre listing error: ${errorMessage}`, 400);
  }

  /**
   * Get full item details from ML API (category_id, title, etc.). For repair flow.
   */
  async getItem(itemId: string): Promise<MLItemSnapshot | null> {
    try {
      const response = await this.apiClient.get(`/items/${itemId}`);
      return {
        id: response.data?.id,
        category_id: response.data?.category_id,
        title: response.data?.title,
        status: response.data?.status,
        sub_status: response.data?.sub_status,
        health: response.data?.health,
        permalink: response.data?.permalink,
        pictures: Array.isArray(response.data?.pictures)
          ? response.data.pictures.map((picture: any) => ({
              id: picture?.id,
              url: picture?.url,
              secure_url: picture?.secure_url,
              max_size: picture?.max_size,
            }))
          : [],
      };
    } catch (err: any) {
      logger.warn('[MercadoLibre] getItem failed', {
        itemId,
        error: err.response?.data?.message || err.message,
      });
      return null;
    }
  }

  /**
   * Get item title and description from ML API for compliance check.
   */
  async getItemForCompliance(itemId: string): Promise<{ title: string; description: string } | null> {
    try {
      const response = await this.apiClient.get(`/items/${itemId}`);
      const data = response.data;
      const title = typeof data?.title === 'string' ? data.title : '';
      const descRaw = data?.description;
      const description =
        typeof descRaw === 'string'
          ? descRaw
          : descRaw?.plain_text != null
            ? String(descRaw.plain_text)
            : '';
      return { title, description };
    } catch (err: any) {
      logger.warn('[MercadoLibre] getItemForCompliance failed', {
        itemId,
        error: err.response?.data?.message || err.message,
      });
      return null;
    }
  }

  /**
   * Verify listing status after creation.
   * Returns the item status from ML API, or null if the check fails.
   */
  async getItemStatus(itemId: string): Promise<{ status: string; sub_status?: string[]; health?: number; permalink?: string } | null> {
    try {
      const response = await this.apiClient.get(`/items/${itemId}`);
      return {
        status: response.data.status,
        sub_status: response.data.sub_status,
        health: response.data.health,
        permalink: response.data.permalink,
      };
    } catch (err: any) {
      logger.warn('[MercadoLibre] getItemStatus failed', {
        itemId,
        error: err.response?.data?.message || err.message,
      });
      return null;
    }
  }

  /**
   * Replace item pictures with newly uploaded approved assets.
   * Returns the verified item snapshot after the update.
   */
  async replaceListingPictures(itemId: string, imageInputs: string[]): Promise<MLItemSnapshot> {
    if (!itemId || !String(itemId).trim()) {
      throw new AppError('MercadoLibre item ID is required to replace pictures', 400);
    }

    const normalizedInputs = Array.from(
      new Set(
        (imageInputs || [])
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((value) => value.trim())
      )
    );

    if (normalizedInputs.length === 0) {
      throw new AppError('At least one approved image is required to replace MercadoLibre pictures', 400);
    }

    const beforeSnap = await this.getItem(itemId);
    const priorStatus = beforeSnap?.status ? String(beforeSnap.status).toLowerCase() : '';
    if (priorStatus && priorStatus !== 'active') {
      try {
        await this.apiClient.put(`/items/${itemId}`, { status: 'active' });
        logger.info('[MercadoLibre] Listing status set active before picture replace', {
          itemId,
          priorStatus: beforeSnap?.status,
        });
      } catch (activateErr: any) {
        const mlMsg = activateErr.response?.data?.message || activateErr.message;
        throw new AppError(
          `Cannot replace MercadoLibre pictures while listing status is "${beforeSnap?.status}". ` +
            `Reactivation via API failed: ${mlMsg}. Resolve moderation / policy holds in Mercado Libre seller center, then retry.`,
          409
        );
      }
      const afterActivate = await this.getItem(itemId);
      const st = afterActivate?.status ? String(afterActivate.status).toLowerCase() : '';
      if (st !== 'active') {
        throw new AppError(
          `Listing could not be switched to active for picture update (status after: ${afterActivate?.status}). ` +
            `See seller center for moderation or account restrictions.`,
          409
        );
      }
    }

    const uploadedIds = await this.uploadImages(normalizedInputs);
    if (uploadedIds.length === 0) {
      throw new AppError('MercadoLibre picture replacement failed: no images were uploaded successfully', 400);
    }

    await this.apiClient.put(`/items/${itemId}`, {
      pictures: uploadedIds.map((id) => ({ id })),
    });

    const verified = await this.getItem(itemId);
    if (!verified) {
      throw new AppError('MercadoLibre picture replacement completed but verification failed', 400);
    }

    return verified;
  }

  /**
   * Attempt to reactivate a listing after a repair/update flow.
   */
  async activateListing(itemId: string): Promise<MLItemSnapshot> {
    if (!itemId || !String(itemId).trim()) {
      throw new AppError('MercadoLibre item ID is required to activate listing', 400);
    }

    await this.apiClient.put(`/items/${itemId}`, {
      status: 'active',
    });

    const verified = await this.getItem(itemId);
    if (!verified) {
      throw new AppError('MercadoLibre activate listing completed but verification failed', 400);
    }

    return verified;
  }

  /**
   * Get categories for site
   */
  async getCategories(siteId?: string): Promise<any[]> {
    const site = siteId || this.credentials.siteId;
    
    try {
      const result = await retryMarketplaceOperation(
        () => this.apiClient.get(`/sites/${site}/categories`),
        'mercadolibre',
        {
          maxRetries: 2,
          onRetry: (attempt, error, delay) => {
            logger.warn(`Retrying getCategories for MercadoLibre (attempt ${attempt})`, {
              site,
              error: error.message,
              delay,
            });
          },
        }
      );

      if (!result.success || !result.data) {
        throw new AppError(`Failed to get categories after retries: ${result.error?.message || 'Unknown error'}`, 400);
      }

      const response = result.data;
      return response.data;
    } catch (error: any) {
      throw new AppError(`MercadoLibre categories error: ${error.message}`, 400);
    }
  }

  /**
   * Predict category for a product
   * @param title - Product title
   * @param description - Optional description (first 150 chars used to improve matching)
   * @param siteId - Optional site ID
   */
  async predictCategory(title: string, description?: string, siteId?: string): Promise<string> {
    const site = siteId || this.credentials.siteId;
    let q = String(title || '').trim();
    if (description && typeof description === 'string') {
      const clean = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean) {
        q = `${q} ${clean.substring(0, 150)}`;
      }
    }

    try {
      const response = await axios.get(
        `https://api.mercadolibre.com/sites/${site}/domain_discovery/search`,
        { params: { q }, timeout: 10000 }
      );
      if (Array.isArray(response.data) && response.data.length > 0) {
        const categoryId = response.data[0].category_id;
        logger.info('[MercadoLibre] Category predicted via domain_discovery', { title: title.substring(0, 50), categoryId, site });
        return categoryId;
      }
    } catch (e: any) {
      logger.debug('[MercadoLibre] domain_discovery failed, trying category_predictor', { error: e.message });
    }

    try {
      const response = await this.apiClient.get(`/sites/${site}/category_predictor/predict`, {
        params: { title: q },
      });
      if (response.data?.length > 0) {
        return response.data[0].id;
      }
    } catch (error: any) {
      logger.warn('[MercadoLibre] category_predictor failed', { error: error.message, site });
    }

    const defaultCategories: Record<string, string> = {
      MLC: 'MLC1000', MLA: 'MLA1000', MLB: 'MLB1000', MLM: 'MLM1000',
    };
    return defaultCategories[site] || `${site}1000`;
  }

  /**
   * Get category attributes
   */
  async getCategoryAttributes(categoryId: string): Promise<any[]> {
    try {
      const response = await this.apiClient.get(`/categories/${categoryId}/attributes`);
      return response.data;
    } catch (error: any) {
      throw new AppError(`MercadoLibre category attributes error: ${error.message}`, 400);
    }
  }

  /**
   * Get order by ID (for webhook processing - orders_v2 sends data.id = order ID)
   */
  async getOrder(orderId: string): Promise<{
    id: string;
    order_items: Array<{ item: { id: string }; unit_price: number }>;
    total_amount: number;
    shipping?: { receiver_address?: any };
    buyer?: { id?: number; nickname?: string; email?: string };
  }> {
    if (!this.credentials.accessToken) {
      throw new AppError('MercadoLibre access token required to fetch order', 401);
    }
    try {
      const response = await this.apiClient.get(`/orders/${orderId}`);
      return response.data;
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message;
      throw new AppError(`MercadoLibre getOrder error: ${msg}`, error.response?.status || 400);
    }
  }

  /**
   * Search recent orders for the authenticated seller.
   * Used as a polling fallback when webhooks are not configured.
   */
  async searchRecentOrders(limit: number = 20): Promise<Array<{
    id: string;
    status: string;
    total_amount: number;
    currency_id: string;
    order_items: Array<{ item: { id: string; title: string }; quantity: number; unit_price: number }>;
    buyer: { id: number; nickname: string; email?: string };
    shipping?: { receiver_address?: any };
    date_created: string;
  }>> {
    if (!this.credentials.accessToken || !this.credentials.userId) {
      throw new AppError('MercadoLibre authentication required to search orders', 401);
    }
    try {
      const response = await this.apiClient.get('/orders/search', {
        params: {
          seller: this.credentials.userId,
          sort: 'date_desc',
          limit: Math.min(limit, 50),
        },
      });
      return response.data?.results || [];
    } catch (error: any) {
      logger.warn('[MercadoLibre] searchRecentOrders failed', {
        error: error.response?.data?.message || error.message,
        status: error.response?.status,
      });
      return [];
    }
  }

  /**
   * Notify Mercado Libre that a shipment has been shipped (seller_notifications).
   * Used when order is fulfilled by supplier (e.g. AliExpress) so buyer sees tracking.
   * Requires shipment_id from order (GET /orders/{id} returns shipping.id).
   */
  async notifyShipmentShipped(shipmentId: number | string, trackingNumber: string): Promise<void> {
    if (!this.credentials.accessToken) {
      throw new AppError('MercadoLibre access token required', 401);
    }
    const tracking = String(trackingNumber || '').trim();
    if (!tracking) {
      throw new AppError('trackingNumber is required', 400);
    }
    try {
      await this.apiClient.post(`/shipments/${shipmentId}/seller_notifications`, {
        tracking_number: tracking,
        status: 'shipped',
        substatus: null,
      });
      logger.info('[MercadoLibre] Shipment notification sent', { shipmentId, trackingPrefix: tracking.slice(0, 8) + '***' });
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message;
      throw new AppError(`MercadoLibre notifyShipmentShipped error: ${msg}`, error.response?.status || 400);
    }
  }

  /**
   * Update listing quantity
   */
  async updateListingQuantity(itemId: string, quantity: number): Promise<void> {
    try {
      await this.apiClient.put(`/items/${itemId}`, {
        available_quantity: quantity,
      });
    } catch (error: any) {
      throw new AppError(`MercadoLibre quantity update error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Update listing price
   */
  async updateListingPrice(itemId: string, price: number): Promise<void> {
    try {
      await this.apiClient.put(`/items/${itemId}`, {
        price,
      });
    } catch (error: any) {
      throw new AppError(`MercadoLibre price update error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Full update of listing: title, description, attributes. Used for repair flow.
   * Does NOT update pictures (would require re-upload).
   */
  async updateListing(
    itemId: string,
    updates: {
      title?: string;
      description?: string;
      attributes?: Array<{ id: string; value: string | number; value_id?: string }>;
      categoryId?: string;
    }
  ): Promise<{ success: boolean; permalink?: string }> {
    try {
      const payload: Record<string, any> = {};
      if (updates.title !== undefined) {
        payload.title = sanitizeTitleForML(updates.title);
      }
      if (updates.description !== undefined) {
        payload.description = { plain_text: sanitizeDescriptionForML(updates.description) };
      }
      if (updates.categoryId) {
        payload.category_id = updates.categoryId;
      }
      let categoryId = updates.categoryId;
      if (updates.attributes && updates.attributes.length > 0) {
        if (!categoryId) {
          const itemRes = await this.apiClient.get(`/items/${itemId}`);
          categoryId = itemRes.data?.category_id || '';
        }
        payload.attributes = await this.resolveAttributesForML(updates.attributes, categoryId);
      }
      if (Object.keys(payload).length === 0) {
        return { success: true };
      }
      await this.apiClient.put(`/items/${itemId}`, payload);
      const verified = await this.getItemStatus(itemId);
      return {
        success: true,
        permalink: verified?.permalink,
      };
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message;
      logger.error('[MercadoLibre] updateListing failed', { itemId, error: msg });
      throw new AppError(`MercadoLibre update listing error: ${msg}`, 400);
    }
  }

  /**
   * Pause/Close listing
   */
  async pauseListing(itemId: string): Promise<void> {
    try {
      await this.apiClient.put(`/items/${itemId}`, {
        status: 'paused',
      });
    } catch (error: any) {
      throw new AppError(`MercadoLibre pause listing error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Close listing
   */
  async closeListing(itemId: string): Promise<void> {
    try {
      await this.apiClient.put(`/items/${itemId}`, {
        status: 'closed',
      });
    } catch (error: any) {
      throw new AppError(`MercadoLibre close listing error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Get user information
   */
  async getAuthenticatedUserProfile(): Promise<{
    id?: string | number;
    nickname?: string;
    site_id?: string;
    seller_experience?: string;
    tags?: unknown;
    status?: unknown;
  }> {
    try {
      const meResponse = await this.apiClient.get('/users/me');
      return meResponse.data || {};
    } catch (meError: any) {
      if (!this.credentials.userId) {
        throw new AppError(
          `MercadoLibre authenticated profile error: ${meError.response?.data?.message || meError.message}`,
          400
        );
      }
      try {
        const fallbackResponse = await this.apiClient.get(`/users/${this.credentials.userId}`);
        return fallbackResponse.data || {};
      } catch (fallbackError: any) {
        throw new AppError(
          `MercadoLibre authenticated profile error: ${fallbackError.response?.data?.message || fallbackError.message}`,
          400
        );
      }
    }
  }

  /**
   * Get user information
   */
  async getUserInfo(): Promise<any> {
    if (!this.credentials.userId) {
      throw new AppError('User ID required', 400);
    }

    try {
      const response = await this.apiClient.get(`/users/${this.credentials.userId}`);
      return response.data;
    } catch (error: any) {
      throw new AppError(`MercadoLibre user info error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Get count of active listings from ML API (one request, uses paging.total).
   */
  async getActiveListingsCount(): Promise<number | null> {
    if (!this.credentials.userId) return null;
    try {
      const response = await this.apiClient.get(`/users/${this.credentials.userId}/items/search`, {
        params: { limit: 1, offset: 0, status: 'active' },
      });
      const total = response.data?.paging?.total;
      if (typeof total === 'number' && Number.isFinite(total)) return total;
      if (typeof total === 'string') {
        const n = parseInt(total, 10);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Phase 18: Get item visits (impressions) from MercadoLibre.
   * GET /users/{user_id}/items_visits?ids=id1,id2 (batch, max ~20 per request).
   * Returns map itemId -> visits (total in period).
   */
  async getItemVisits(itemIds: string[]): Promise<Record<string, number>> {
    if (!this.credentials.userId || !itemIds?.length) return {};
    const unique = [...new Set(itemIds.filter((id) => typeof id === 'string' && id.trim()))];
    if (unique.length === 0) return {};
    const result: Record<string, number> = {};
    const batchSize = 20;
    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      try {
        const response = await this.apiClient.get(
          `/users/${this.credentials.userId}/items_visits`,
          { params: { ids: batch.join(',') } }
        );
        const data = response.data || {};
        for (const id of batch) {
          const v = data[id];
          result[id] = typeof v === 'object' && v != null && typeof v.visits === 'number' ? v.visits : 0;
        }
      } catch (err: any) {
        logger.warn('[MercadoLibre] getItemVisits batch failed', {
          batch: batch.length,
          error: err.response?.data?.message || err.message,
        });
        for (const id of batch) result[id] = 0;
      }
    }
    return result;
  }

  /**
   * Get user's listings
   */
  async getUserListings(status?: string, limit: number = 50): Promise<any[]> {
    if (!this.credentials.userId) {
      throw new AppError('User ID required', 400);
    }

    try {
      const params: any = { limit };
      if (status) {
        params.status = status;
      }

      const response = await this.apiClient.get(`/users/${this.credentials.userId}/items/search`, {
        params,
      });

      return response.data.results || [];
    } catch (error: any) {
      throw new AppError(`MercadoLibre listings error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Get ALL user item IDs from Mercado Libre API (paginated).
   * Used by ml-close-all-from-api to close every publication in ML, including those not in our DB.
   * Standard offset pagination works for up to 1000 items; for more, uses search_type=scan.
   */
  async getAllUserItemIds(): Promise<string[]> {
    if (!this.credentials.userId) {
      throw new AppError('User ID required', 400);
    }

    const allIds: string[] = [];
    const limit = 50;
    const maxItems = 3000; // safety cap

    try {
      const firstResponse = await this.apiClient.get(
        `/users/${this.credentials.userId}/items/search`,
        { params: { limit, offset: 0 } }
      );
      const paging = firstResponse.data?.paging || {};
      const total = paging.total ?? 0;
      const firstResults: string[] = firstResponse.data?.results || [];

      if (total <= 1000) {
        for (const id of firstResults) {
          if (typeof id === 'string' && id.trim()) allIds.push(id.trim());
        }
        // Standard offset pagination (ML API limit: offset max 1000)
        let offset = limit;
        while (allIds.length < maxItems && offset < total) {
          const response = await this.apiClient.get(
            `/users/${this.credentials.userId}/items/search`,
            { params: { limit, offset } }
          );
          const results: string[] = response.data?.results || [];
          for (const id of results) {
            if (typeof id === 'string' && id.trim()) allIds.push(id.trim());
          }
          if (results.length < limit) break;
          offset += limit;
          await new Promise((r) => setTimeout(r, 150));
        }
      } else {
        // >1000 items: use search_type=scan (ML API bypasses 1000 offset limit)
        try {
          const scanInit = await this.apiClient.get(
            `/users/${this.credentials.userId}/items/search`,
            { params: { search_type: 'scan' } }
          );
          let scrollId: string | undefined = scanInit.data?.scroll_id;
          if (!scrollId) {
            throw new Error('search_type=scan did not return scroll_id');
          }
          while (scrollId && allIds.length < maxItems) {
            const scanResp = await this.apiClient.get(
              `/users/${this.credentials.userId}/items/search`,
              { params: { search_type: 'scan', scroll_id: scrollId } }
            );
            const batch: string[] = scanResp.data?.results || [];
            for (const id of batch) {
              if (typeof id === 'string' && id.trim()) allIds.push(id.trim());
            }
            scrollId = scanResp.data?.scroll_id;
            if (batch.length === 0) break;
            await new Promise((r) => setTimeout(r, 150));
          }
        } catch (scanErr: any) {
          logger.warn('[MercadoLibre] search_type=scan failed, returning first 1000 via offset', {
            error: scanErr?.message || String(scanErr),
            total,
          });
          for (const id of firstResults) {
            if (typeof id === 'string' && id.trim()) allIds.push(id.trim());
          }
          let offset = limit;
          while (allIds.length < Math.min(1000, maxItems) && offset < 1000) {
            const resp = await this.apiClient.get(
              `/users/${this.credentials.userId}/items/search`,
              { params: { limit, offset } }
            );
            const batch: string[] = resp.data?.results || [];
            for (const id of batch) {
              if (typeof id === 'string' && id.trim()) allIds.push(id.trim());
            }
            if (batch.length < limit) break;
            offset += limit;
            await new Promise((r) => setTimeout(r, 150));
          }
        }
      }

      logger.info('[MercadoLibre] getAllUserItemIds', {
        userId: this.credentials.userId,
        totalItems: allIds.length,
        totalFromApi: total,
      });
      return allIds;
    } catch (error: any) {
      throw new AppError(
        `MercadoLibre getAllUserItemIds error: ${error.response?.data?.message || error.message}`,
        400
      );
    }
  }

  /**
   * Get currency for site
   */
  getSiteCurrency(siteId: string): string {
    const currencies: { [key: string]: string } = {
      MLA: 'ARS', // Argentina
      MLB: 'BRL', // Brazil
      MLC: 'CLP', // Chile
      MCO: 'COP', // Colombia
      MCR: 'CRC', // Costa Rica
      MEC: 'USD', // Ecuador
      MLM: 'MXN', // Mexico
      MLU: 'UYU', // Uruguay
      MLV: 'VES', // Venezuela
      MPA: 'USD', // Panama
      MPE: 'PEN', // Peru
      MPT: 'USD', // Portugal
      MRD: 'DOP', // Dominican Republic
    };

    return currencies[siteId] || currencies[process.env.MERCADOLIBRE_SITE_ID || 'MLC'] || 'CLP';
  }

  /**
   * Test connection with current credentials
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getUserInfo();
      return { success: true, message: 'MercadoLibre connection successful' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Search similar products (for pricing reference)
   */
  async searchSimilarProducts(query: string, categoryId?: string, limit: number = 10): Promise<any[]> {
    try {
      const params: any = {
        q: query,
        limit,
        site: this.credentials.siteId,
      };

      if (categoryId) {
        params.category = categoryId;
      }

      const response = await this.apiClient.get('/sites/search', { params });
      return response.data.results || [];
    } catch (error: any) {
      throw new AppError(`MercadoLibre search error: ${error.message}`, 400);
    }
  }

  /**
   * Search products by keywords using MercadoLibre public search API
   * Example: GET /sites/MLM/search?q=term
   */
  async searchProducts(params: { siteId: string; q: string; limit?: number; offset?: number }): Promise<Array<{
    id: string;
    title: string;
    price: number;
    currency_id: string;
    permalink: string;
    seller_id?: number;
    shipping?: { free_shipping?: boolean };
  }>> {
    const site = params.siteId || this.credentials.siteId || 'MLM';
    const q = new URLSearchParams();
    q.set('q', params.q);
    if (params.limit) q.set('limit', String(Math.min(Math.max(params.limit, 1), 50)));
    if (params.offset) q.set('offset', String(params.offset));

    const { data } = await this.apiClient.get(`/sites/${site}/search?${q.toString()}`);
    const results = (data?.results || []) as any[];
    return results.map((r) => ({
      id: r.id,
      title: r.title,
      price: r.price,
      currency_id: r.currency_id,
      permalink: r.permalink,
      seller_id: r.seller?.id,
      shipping: r.shipping,
    }));
  }
  /**
   * Poll for recent orders from MercadoLibre.
   * Used as a fallback when webhooks are not configured.
   */
  async searchRecentOrders(limit: number = 20): Promise<Array<{
    id: string;
    status: string;
    totalAmount: number;
    currencyId: string;
    items: Array<{ itemId: string; title: string; quantity: number; unitPrice: number }>;
    buyer: { id: number; nickname: string };
    shippingAddress?: any;
    dateCreated: string;
  }>> {
    if (!this.credentials.accessToken || !this.credentials.userId) {
      throw new AppError('MercadoLibre authentication required for order polling', 401);
    }

    try {
      const response = await this.apiClient.get(`/orders/search`, {
        params: {
          seller: this.credentials.userId,
          sort: 'date_desc',
          limit: Math.min(limit, 50),
        },
        timeout: 15000,
      });

      const results = response.data?.results || [];
      return results.map((o: any) => ({
        id: String(o.id),
        status: o.status,
        totalAmount: o.total_amount,
        currencyId: o.currency_id,
        items: (o.order_items || []).map((oi: any) => ({
          itemId: oi.item?.id,
          title: oi.item?.title,
          quantity: oi.quantity,
          unitPrice: oi.unit_price,
        })),
        buyer: {
          id: o.buyer?.id,
          nickname: o.buyer?.nickname || '',
        },
        shippingAddress: o.shipping?.receiver_address,
        dateCreated: o.date_created,
      }));
    } catch (err: any) {
      logger.warn('[MercadoLibre] searchRecentOrders failed', {
        error: err.response?.data?.message || err.message,
        status: err.response?.status,
      });
      return [];
    }
  }
}

export default MercadoLibreService;
