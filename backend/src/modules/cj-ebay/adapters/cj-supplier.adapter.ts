/**
 * CJ supplier port implementation (FASE 3B).
 * Uses official API 2.0 paths only (see cj-supplier.client.ts header).
 * Does not import AliExpress, orderFulfillmentService, or MarketplaceService.publishToEbay.
 */

import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { CredentialsManager } from '../../../services/credentials-manager.service';
import { CJ_EBAY_API_CREDENTIAL_NAME } from '../cj-ebay.constants';
import {
  CjSupplierHttpClient,
  asRecord,
  readListOrArray,
  type CjAccessTokenPayload,
} from './cj-supplier.client';
import { CjSupplierError } from './cj-supplier.errors';
import {
  buildOfficialFreightCalculatePayload,
  normalizeFreightCalculateData,
  CJ_FREIGHT_CALCULATE_PATH,
  type CjShippingQuoteNormalized,
} from './cj-freight-calculate.official';
import {
  CJ_SHOPPING_CREATE_ORDER_V2_PATH,
  CJ_SHOPPING_GET_ORDER_DETAIL_PATH,
  CJ_SHOPPING_CONFIRM_ORDER_PATH,
  CJ_SHOPPING_PAY_BALANCE_PATH,
} from './cj-shopping-order.official';
import type {
  ICjSupplierAdapter,
  CjSearchQuery,
  CjProductSummary,
  CjProductDetail,
  CjVariantDetail,
  CjShippingQuoteInput,
  CjShippingQuoteResult,
  CjQuoteShippingToUsRealInput,
  CjCreateOrderInput,
  CjCreateOrderResult,
  CjOrderStatusResult,
  CjTrackingResult,
  CjConfirmOrderResult,
  CjPayBalanceResult,
} from './cj-supplier.adapter.interface';

/** CJ documents QPS ≈ 1; stay slightly above 1s between calls. */
const CJ_MIN_INTERVAL_MS = 1100;

/** Nombres en inglés para `shippingCountry` cuando el origen es ISO2 (doc requiere país + código). */
const ISO2_COUNTRY_NAME: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  BE: 'Belgium',
  MX: 'Mexico',
  BR: 'Brazil',
  JP: 'Japan',
  CN: 'China',
  NZ: 'New Zealand',
  IE: 'Ireland',
  AT: 'Austria',
  PL: 'Poland',
  SE: 'Sweden',
  NO: 'Norway',
  CH: 'Switzerland',
  PT: 'Portugal',
};

function toShippingCountry(raw: string): { code: string; name: string } {
  const t = String(raw || '').trim();
  if (!t) {
    throw new CjSupplierError('shipping country is empty', { code: 'CJ_INVALID_SKU' });
  }
  if (/^[A-Za-z]{2}$/.test(t)) {
    const code = t.toUpperCase();
    return { code, name: (ISO2_COUNTRY_NAME[code] || code).slice(0, 50) };
  }
  const lower = t.toLowerCase();
  for (const [code, name] of Object.entries(ISO2_COUNTRY_NAME)) {
    if (name.toLowerCase() === lower || code.toLowerCase() === lower) {
      return { code, name: name.slice(0, 50) };
    }
  }
  if (lower === 'usa' || lower === 'united states of america') {
    return { code: 'US', name: 'United States' };
  }
  throw new CjSupplierError(
    `Unrecognized country "${raw}"; use ISO 3166-1 alpha-2 (e.g. US) per CJ doc`,
    { code: 'CJ_INVALID_SKU' }
  );
}

const tokenMem = new Map<
  string,
  { accessToken: string; refreshToken: string; expiresAtMs: number }
>();

function expiryFromCjDate(s?: string): number {
  if (!s) return Date.now() + 13 * 24 * 60 * 60 * 1000;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : Date.now() + 13 * 24 * 60 * 60 * 1000;
}

function parseTokenPayload(data: unknown): CjAccessTokenPayload {
  const o = asRecord(data);
  if (!o) {
    throw new CjSupplierError('Empty CJ token payload', { code: 'CJ_UNKNOWN' });
  }
  const accessToken = String(o.accessToken || '').trim();
  const refreshToken = String(o.refreshToken || '').trim();
  if (!accessToken) {
    throw new CjSupplierError('CJ token response missing accessToken', { code: 'CJ_UNKNOWN' });
  }
  return {
    accessToken,
    refreshToken,
    accessTokenExpiryDate: typeof o.accessTokenExpiryDate === 'string' ? o.accessTokenExpiryDate : undefined,
    refreshTokenExpiryDate: typeof o.refreshTokenExpiryDate === 'string' ? o.refreshTokenExpiryDate : undefined,
    openId: typeof o.openId === 'number' ? o.openId : undefined,
  };
}

/** Parse list price from CJ listV2 (string ranges like "0.55 -- 7.18" → low bound). */
function parseCjListPriceUsd(row: Record<string, unknown>): number | undefined {
  const raw = row.nowPrice ?? row.discountPrice ?? row.sellPrice;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    const m = s.match(/([\d.]+)/);
    if (m) {
      const n = parseFloat(m[1]!);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }
  }
  return undefined;
}

function rowToSummary(row: Record<string, unknown>): CjProductSummary | null {
  const pid = String(row.pid || row.id || '').trim();
  if (!pid) return null;
  const title =
    String(row.productNameEn || row.productName || row.nameEn || row.name || '').trim() || '(no title)';
  const imgRaw = row.productImage ?? row.bigImage ?? row.productImageEn;
  const mainImageUrl =
    typeof imgRaw === 'string' ? imgRaw.split(',')[0]?.trim() || undefined : undefined;
  const listPriceUsd = parseCjListPriceUsd(row);
  // CJ listV2 may include total inventory across all variants.
  // Try multiple field names; treat missing as `undefined` (unknown), not zero.
  const invRaw = row.inventoryNum ?? row.inventory ?? row.inventoryQuantity ?? row.stock;
  const inventoryTotal =
    invRaw !== undefined && invRaw !== null
      ? (() => {
          const n = Number(invRaw);
          return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
        })()
      : undefined;
  return { cjProductId: pid, title, mainImageUrl, listPriceUsd, inventoryTotal };
}

/** `product/listV2` returns `{ content: [{ productList: [...] }] }` per CJ Open API 2.0 docs. */
function readListV2ProductRows(data: unknown): Record<string, unknown>[] {
  const d = asRecord(data);
  if (!d) return [];
  const content = d.content;
  if (Array.isArray(content)) {
    const out: Record<string, unknown>[] = [];
    for (const item of content) {
      const pl = asRecord(item)?.productList;
      if (Array.isArray(pl)) {
        for (const p of pl) {
          const r = asRecord(p);
          if (r) out.push(r);
        }
      }
    }
    if (out.length > 0) return out;
  }
  return readListOrArray(data);
}

function parseVariantRow(v: Record<string, unknown>): CjVariantDetail | null {
  const vid = String(v.vid || '').trim();
  const sku = String(v.variantSku || '').trim() || vid;
  if (!sku && !vid) return null;
  const price = Number(v.variantSellPrice ?? 0);
  const unitCostUsd = Number.isFinite(price) ? price : 0;
  // CJ uses several field names for stock depending on API version / endpoint.
  // storageNum is documented; inventoryNum / inventory / stock / quantity are observed aliases.
  const stockRaw = Number(
    v.storageNum ?? v.inventoryNum ?? v.inventory ?? v.stock ?? v.quantity ?? 0,
  );
  const stock = Number.isFinite(stockRaw) && stockRaw >= 0 ? Math.floor(stockRaw) : 0;
  const attributes: Record<string, string> = {};
  const vn = v.variantNameEn ?? v.variantName;
  if (typeof vn === 'string' && vn.trim()) attributes.label = vn.trim();
  return {
    cjSku: sku || vid,
    cjVid: vid || undefined,
    attributes,
    unitCostUsd,
    stock,
  };
}

/**
 * Extract a stock number from a CJ `product/stock/queryByVid` response.
 * CJ returns `data` as either a single object or an array depending on API version.
 * Tries multiple field names used across CJ API versions.
 */
function extractCjStockNum(data: unknown, vidHint: string): number {
  const readNum = (r: Record<string, unknown>): number => {
    const n = Number(r.storageNum ?? r.inventoryNum ?? r.inventory ?? r.stock ?? r.quantity ?? 0);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  };
  if (Array.isArray(data)) {
    // Some CJ endpoints return an array in data; try to find the matching entry by vid
    for (const item of data) {
      const r = asRecord(item);
      if (!r) continue;
      const itemVid = String(r.vid || r.variantSku || '').trim();
      if (!itemVid || itemVid === vidHint || data.length === 1) {
        return readNum(r);
      }
    }
    return 0;
  }
  const r = asRecord(data);
  return r ? readNum(r) : 0;
}

function normalizedToLegacyQuote(q: CjShippingQuoteNormalized): CjShippingQuoteResult {
  const d = q.estimatedDays;
  return {
    amountUsd: q.cost,
    currency: 'USD',
    serviceName: q.method,
    carrier: q.method,
    estimatedMinDays: d ?? undefined,
    estimatedMaxDays: d ?? undefined,
    confidence: d != null ? 'known' : 'unknown',
  };
}

export class CjSupplierAdapter implements ICjSupplierAdapter {
  readonly supplierId = 'cjdropshipping' as const;

  private readonly client = new CjSupplierHttpClient();
  private readonly cacheKey: string;
  private lastCallAt = 0;

  constructor(
    private readonly userId: number,
    private readonly environment: 'sandbox' | 'production' = 'production'
  ) {
    this.cacheKey = `${userId}:${environment}`;
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = CJ_MIN_INTERVAL_MS - (now - this.lastCallAt);
    if (this.lastCallAt > 0 && wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastCallAt = Date.now();
  }

  private async ensureAccessToken(): Promise<string> {
    const mem = tokenMem.get(this.cacheKey);
    if (mem && mem.expiresAtMs > Date.now() + 60_000) {
      return mem.accessToken;
    }

    const creds = await CredentialsManager.getCredentials(
      this.userId,
      CJ_EBAY_API_CREDENTIAL_NAME,
      this.environment
    );
    const apiKey = String(creds?.apiKey || '').trim();
    if (!apiKey) {
      throw new CjSupplierError(
        'Missing CJ apiKey: save ApiCredential with apiName "cj-dropshipping" and JSON { "apiKey": "..." } or set env CJ_API_KEY (or CJ_DROPSHIPPING_API_KEY)',
        { code: 'CJ_AUTH_INVALID' }
      );
    }

    const bumpMem = (t: CjAccessTokenPayload) => {
      const exp = expiryFromCjDate(t.accessTokenExpiryDate);
      tokenMem.set(this.cacheKey, {
        accessToken: t.accessToken,
        refreshToken: (t.refreshToken || mem?.refreshToken || '').trim(),
        expiresAtMs: exp,
      });
      return t.accessToken;
    };

    const refresh = async (rt: string) => {
      await this.throttle();
      const raw = await this.client.postUnauthenticated('authentication/refreshAccessToken', {
        refreshToken: rt,
      });
      return parseTokenPayload(raw);
    };

    const login = async () => {
      await this.throttle();
      const raw = await this.client.postUnauthenticated('authentication/getAccessToken', { apiKey });
      return parseTokenPayload(raw);
    };

    if (mem?.refreshToken) {
      try {
        const t = await refresh(mem.refreshToken);
        return bumpMem(t);
      } catch {
        tokenMem.delete(this.cacheKey);
      }
    }

    const storedRt = String(creds?.refreshToken || '').trim();
    const storedAt = String(creds?.accessToken || '').trim();
    const storedExp = creds?.accessTokenExpiryDate
      ? new Date(String(creds.accessTokenExpiryDate)).getTime()
      : 0;
    if (storedAt && storedExp > Date.now() + 60_000) {
      tokenMem.set(this.cacheKey, {
        accessToken: storedAt,
        refreshToken: storedRt || mem?.refreshToken || '',
        expiresAtMs: storedExp,
      });
      return storedAt;
    }

    if (storedRt) {
      try {
        const t = await refresh(storedRt);
        return bumpMem(t);
      } catch {
        /* use apiKey */
      }
    }

    const t = await login();
    return bumpMem(t);
  }

  /**
   * CJ QPS ≈ 1/s; 429 responses get exponential backoff and limited retries (see env CJ_429_*).
   */
  private async with429Retry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const maxRetries = env.CJ_429_MAX_RETRIES;
    const baseMs = env.CJ_429_BASE_BACKOFF_MS;
    let last: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        if (
          e instanceof CjSupplierError &&
          e.code === 'CJ_RATE_LIMIT' &&
          attempt < maxRetries
        ) {
          const delayMs = baseMs * 2 ** attempt;
          logger.warn('[cj-supplier.adapter] rate limited (429), backing off', {
            label,
            attempt,
            delayMs,
          });
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw e;
      }
    }
    throw last;
  }

  private async authed(subPath: string, body: Record<string, unknown> = {}): Promise<unknown> {
    return this.with429Retry(`POST ${subPath}`, async () => {
      await this.throttle();
      let token = await this.ensureAccessToken();
      try {
        return await this.client.postWithAccessToken(token, subPath, body);
      } catch (e) {
        if (e instanceof CjSupplierError && (e.code === 'CJ_AUTH_INVALID' || e.code === 'CJ_AUTH_EXPIRED')) {
          tokenMem.delete(this.cacheKey);
          await this.throttle();
          token = await this.ensureAccessToken();
          return await this.client.postWithAccessToken(token, subPath, body);
        }
        throw e;
      }
    });
  }

  private async authedGet(subPathWithQuery: string): Promise<unknown> {
    return this.with429Retry(`GET ${subPathWithQuery.split('?')[0]}`, async () => {
      await this.throttle();
      let token = await this.ensureAccessToken();
      try {
        return await this.client.getWithAccessToken(token, subPathWithQuery);
      } catch (e) {
        if (e instanceof CjSupplierError && (e.code === 'CJ_AUTH_INVALID' || e.code === 'CJ_AUTH_EXPIRED')) {
          tokenMem.delete(this.cacheKey);
          await this.throttle();
          token = await this.ensureAccessToken();
          return await this.client.getWithAccessToken(token, subPathWithQuery);
        }
        throw e;
      }
    });
  }

  private async authedPatch(subPath: string, body: Record<string, unknown> = {}): Promise<unknown> {
    return this.with429Retry(`PATCH ${subPath}`, async () => {
      await this.throttle();
      let token = await this.ensureAccessToken();
      try {
        return await this.client.patchWithAccessToken(token, subPath, body);
      } catch (e) {
        if (e instanceof CjSupplierError && (e.code === 'CJ_AUTH_INVALID' || e.code === 'CJ_AUTH_EXPIRED')) {
          tokenMem.delete(this.cacheKey);
          await this.throttle();
          token = await this.ensureAccessToken();
          return await this.client.patchWithAccessToken(token, subPath, body);
        }
        throw e;
      }
    });
  }

  /** Reintentos solo ante fallos de red HTTP (CJ_NETWORK) o 5xx marcados retryable. */
  private async authedWithNetworkRetry(
    subPath: string,
    body: Record<string, unknown>,
    maxAttempts = 3
  ): Promise<unknown> {
    let last: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.authed(subPath, body);
      } catch (e) {
        last = e;
        if (e instanceof CjSupplierError && e.retryable && attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    throw last;
  }

  /**
   * Resuelve `vid` oficial para freightCalculate: prioriza variantId; si solo hay productId,
   * exige exactamente una variante con `cjVid` (product/variant/query).
   */
  private async resolveVariantIdForFreight(variantId?: string, productId?: string): Promise<string> {
    const v = String(variantId || '').trim();
    if (v) return v;
    const p = String(productId || '').trim();
    if (!p) {
      throw new CjSupplierError('Provide variantId (CJ vid) or productId (CJ pid)', {
        code: 'CJ_INVALID_SKU',
      });
    }
    const detail = await this.getProductById(p);
    const withVid = detail.variants.filter((x) => String(x.cjVid || '').trim());
    if (withVid.length === 0) {
      throw new CjSupplierError(
        `No CJ variant id (vid) for product ${p}; check product/variant/query`,
        { code: 'CJ_INVALID_SKU' }
      );
    }
    if (withVid.length > 1) {
      throw new CjSupplierError(
        `Product ${p} has ${withVid.length} variants; pass variantId (CJ vid) explicitly`,
        { code: 'CJ_INVALID_SKU' }
      );
    }
    return String(withVid[0]!.cjVid!).trim();
  }

  async verifyAuth(): Promise<{ ok: true } | { ok: false; error: CjSupplierError }> {
    try {
      await this.authedGet('setting/get');
      return { ok: true };
    } catch (e) {
      if (e instanceof CjSupplierError) return { ok: false, error: e };
      return {
        ok: false,
        error: new CjSupplierError(e instanceof Error ? e.message : String(e), { code: 'CJ_UNKNOWN' }),
      };
    }
  }

  async searchProducts(query: CjSearchQuery): Promise<CjProductSummary[]> {
    const body: Record<string, unknown> = { ...(query.productQueryBody || {}) };
    const pageRaw = Number(query.page ?? body.pageNum ?? body.page ?? 1);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const rawSize = Number(query.pageSize ?? body.pageSize ?? 20);
    const size = Number.isFinite(rawSize) ? Math.min(Math.max(1, Math.floor(rawSize)), 100) : 20;
    const kw =
      query.keyword != null
        ? String(query.keyword).trim()
        : body.productName != null
          ? String(body.productName).trim()
          : '';

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('size', String(size));
    if (kw) params.set('keyWord', kw);

    const skip = new Set(['pageNum', 'pageSize', 'productName', 'page', 'keyword']);
    for (const [k, v] of Object.entries(body)) {
      if (skip.has(k)) continue;
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        params.set(k, String(v));
      }
    }

    const data = await this.authedGet(`product/listV2?${params.toString()}`);
    const rows = readListV2ProductRows(data);
    return rows.map(rowToSummary).filter((x): x is CjProductSummary => x !== null);
  }

  async getProductById(cjProductId: string): Promise<CjProductDetail> {
    const pid = String(cjProductId || '').trim();
    if (!pid) {
      throw new CjSupplierError('cjProductId required', { code: 'CJ_INVALID_SKU' });
    }

    const listData = await this.authedGet(`product/query?pid=${encodeURIComponent(pid)}`);
    let mainRow = asRecord(listData);
    if (!mainRow || !String(mainRow.pid || mainRow.id || '').trim()) {
      mainRow = readListOrArray(listData)[0] ?? null;
    }
    if (!mainRow) {
      throw new CjSupplierError(`No product for pid ${pid}`, { code: 'CJ_INVALID_SKU' });
    }
    const resolvedPid = String(mainRow.pid || mainRow.id || '').trim();
    if (!resolvedPid || resolvedPid.toLowerCase() !== pid.toLowerCase()) {
      throw new CjSupplierError(`No product for pid ${pid}`, { code: 'CJ_INVALID_SKU' });
    }

    const varData = await this.authedGet(`product/variant/query?pid=${encodeURIComponent(resolvedPid)}`);
    let variants = readListOrArray(varData).map(parseVariantRow).filter((x): x is CjVariantDetail => x !== null);
    if (variants.length === 0) {
      variants = [
        {
          cjSku: resolvedPid,
          cjVid: undefined,
          attributes: {},
          unitCostUsd: Number(mainRow.variantSellPrice ?? mainRow.sellPrice ?? 0) || 0,
          stock: 0,
        },
      ];
    }

    const title = String(mainRow.productNameEn || mainRow.productName || '').trim() || resolvedPid;
    const desc = typeof mainRow.description === 'string' ? mainRow.description : undefined;
    const imgRaw = mainRow.productImage;
    let imageUrls: string[] = [];
    if (typeof imgRaw === 'string' && imgRaw.trim()) {
      // CJ often returns productImage as a JSON array string e.g. '["url1","url2"]'.
      // Try JSON.parse first; fall back to comma-split for plain CSV format.
      try {
        const parsed = JSON.parse(imgRaw) as unknown;
        if (Array.isArray(parsed)) {
          imageUrls = parsed.map((u) => String(u).trim()).filter(Boolean);
        } else {
          imageUrls = [String(parsed).trim()].filter(Boolean);
        }
      } catch {
        imageUrls = imgRaw.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    return {
      cjProductId: resolvedPid,
      title,
      description: desc,
      imageUrls,
      variants,
    };
  }

  /**
   * CJ path `product/stock/queryByVid` — real-time stock per variant id.
   * The response `data` field can be either a single object or an array (CJ API is inconsistent).
   * Handles both shapes and tries multiple field names for the stock quantity.
   */
  async getStockForSkus(skus: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const vid of skus) {
      const v = String(vid || '').trim();
      if (!v) continue;
      try {
        const data = await this.authedGet(`product/stock/queryByVid?vid=${encodeURIComponent(v)}`);
        out.set(v, extractCjStockNum(data, v));
      } catch {
        // Network/auth error — leave key absent so caller can treat it as unknown
      }
    }
    return out;
  }

  async quoteShippingToUsReal(
    input: CjQuoteShippingToUsRealInput
  ): Promise<{
    quote: CjShippingQuoteNormalized;
    requestPayload: Record<string, unknown>;
    responseRaw: unknown;
  }> {
    const vid = await this.resolveVariantIdForFreight(input.variantId, input.productId);
    const q = Math.floor(Number(input.quantity));
    if (!Number.isFinite(q) || q < 1) {
      throw new CjSupplierError('quantity must be an integer >= 1', { code: 'CJ_INVALID_SKU' });
    }

    const official = buildOfficialFreightCalculatePayload({
      vid,
      quantity: q,
      endCountryCode: 'US',
      startCountryCode: input.startCountryCode,
      zip: input.destPostalCode,
    });
    const body = { ...official } as Record<string, unknown>;

    const resolvedStart = String(body.startCountryCode || 'CN').trim() || 'CN';
    const responseRaw = await this.authedWithNetworkRetry(CJ_FREIGHT_CALCULATE_PATH, body);
    const quote = normalizeFreightCalculateData(responseRaw, resolvedStart, 'freight_api_confirmed');
    return { quote, requestPayload: body, responseRaw };
  }

  async quoteShippingToUs(input: CjShippingQuoteInput): Promise<CjShippingQuoteResult> {
    const { quote } = await this.quoteShippingToUsReal({
      variantId: input.variantId,
      productId: input.productId,
      quantity: input.quantity,
      destPostalCode: input.destPostalCode,
      startCountryCode: input.startCountryCode,
    });
    return normalizedToLegacyQuote(quote);
  }

  /**
   * WAREHOUSE-AWARE quoting: tries US warehouse first, falls back to CN on
   * CJ_SHIPPING_UNAVAILABLE. Other errors (auth, network, invalid SKU) are propagated.
   *
   * Logic:
   * 1. Attempt `startCountryCode=US` → if CJ returns valid options: fulfillmentOrigin='US'
   * 2. If CJ responds "no shipping options" (CJ_SHIPPING_UNAVAILABLE): silently fall back to CN
   * 3. All other errors bubble up unchanged
   */
  async quoteShippingToUsWarehouseAware(
    input: CjQuoteShippingToUsRealInput
  ): Promise<{
    quote: CjShippingQuoteNormalized;
    fulfillmentOrigin: 'US' | 'CN';
    requestPayload: Record<string, unknown>;
    responseRaw: unknown;
  }> {
    const vid = await this.resolveVariantIdForFreight(input.variantId, input.productId);
    const q = Math.floor(Number(input.quantity));
    if (!Number.isFinite(q) || q < 1) {
      throw new CjSupplierError('quantity must be an integer >= 1', { code: 'CJ_INVALID_SKU' });
    }

    // Step 1: probe US warehouse
    const usPayload = { ...buildOfficialFreightCalculatePayload({
      vid,
      quantity: q,
      endCountryCode: 'US',
      startCountryCode: 'US',
      zip: input.destPostalCode,
    }) } as Record<string, unknown>;

    try {
      const usRaw = await this.authedWithNetworkRetry(CJ_FREIGHT_CALCULATE_PATH, usPayload);
      const usQuote = normalizeFreightCalculateData(usRaw, 'US', 'freight_api_confirmed');
      logger.info('[cj-supplier.adapter] warehouse-aware: US freight confirmed', {
        vid,
        cost: usQuote.cost,
        method: usQuote.method,
      });
      return { quote: usQuote, fulfillmentOrigin: 'US', requestPayload: usPayload, responseRaw: usRaw };
    } catch (e) {
      // Only silently fall back on "no shipping options available" — all other errors propagate
      if (e instanceof CjSupplierError && e.code === 'CJ_SHIPPING_UNAVAILABLE') {
        logger.info('[cj-supplier.adapter] warehouse-aware: US probe unavailable, falling back to CN', { vid });
      } else {
        throw e;
      }
    }

    // Step 2: fall back to CN
    const cnPayload = { ...buildOfficialFreightCalculatePayload({
      vid,
      quantity: q,
      endCountryCode: 'US',
      startCountryCode: 'CN',
      zip: input.destPostalCode,
    }) } as Record<string, unknown>;

    const cnRaw = await this.authedWithNetworkRetry(CJ_FREIGHT_CALCULATE_PATH, cnPayload);
    const cnQuote = normalizeFreightCalculateData(cnRaw, 'CN', 'freight_api_fallback');
    return { quote: cnQuote, fulfillmentOrigin: 'CN', requestPayload: cnPayload, responseRaw: cnRaw };
  }

  /**
   * `POST shopping/order/createOrderV2` — cuerpo alineado con la tabla oficial (sin campos inventados).
   * `payType` por defecto **3** (solo crear, sin pago en balance / página), según doc Shopping.
   */
  async createOrder(input: CjCreateOrderInput): Promise<CjCreateOrderResult> {
    const on = String(input.idempotencyKey || '').trim().slice(0, 50);
    if (!on) {
      throw new CjSupplierError('idempotencyKey (orderNumber) required', { code: 'CJ_INVALID_SKU' });
    }
    if (!input.lines?.length) {
      throw new CjSupplierError('At least one order line required', { code: 'CJ_INVALID_SKU' });
    }
    const logisticName = String(input.logisticName || '').trim();
    if (!logisticName) {
      throw new CjSupplierError('logisticName required (official createOrderV2)', { code: 'CJ_INVALID_SKU' });
    }

    const st = input.shipTo;
    const addr1 = String(st.addressLine1 || '').trim();
    const city = String(st.city || '').trim();
    const rawCountry = String(st.country || '').trim();
    const custName = String(st.fullName || '').trim();
    if (!addr1 || !city || !rawCountry || !custName) {
      throw new CjSupplierError(
        'shipTo requires fullName, addressLine1, city, country (official required fields)',
        { code: 'CJ_INVALID_SKU' }
      );
    }

    const { code: shippingCountryCode, name: shippingCountry } = toShippingCountry(rawCountry);
    const shippingProvince = String(st.state || st.province || '').trim() || '-';
    const products = input.lines.map((l) => {
      const vid = String(l.cjVid || '').trim();
      if (!vid) {
        throw new CjSupplierError('Each line requires cjVid (CJ variant id)', { code: 'CJ_INVALID_SKU' });
      }
      const qty = Math.max(1, Math.floor(Number(l.quantity)) || 1);
      const row: Record<string, unknown> = { vid, quantity: qty };
      const sku = String(l.cjSku || '').trim();
      if (sku) row.sku = sku.slice(0, 50);
      const sli = String(l.storeLineItemId || '').trim();
      if (sli) row.storeLineItemId = sli.slice(0, 125);
      return row;
    });

    const body: Record<string, unknown> = {
      orderNumber: on,
      shippingCountryCode: shippingCountryCode.slice(0, 20),
      shippingCountry: shippingCountry.slice(0, 50),
      shippingProvince: shippingProvince.slice(0, 50),
      shippingCity: city.slice(0, 50),
      shippingCustomerName: custName.slice(0, 50),
      shippingAddress: addr1.slice(0, 200),
      fromCountryCode: String(input.fromCountryCode || 'CN').trim().slice(0, 20),
      logisticName: logisticName.slice(0, 50),
      payType: input.payType ?? 3,
      shopLogisticsType: input.shopLogisticsType ?? 2,
      products,
    };

    const a2 = String(st.addressLine2 || '').trim();
    if (a2) body.shippingAddress2 = a2.slice(0, 200);
    const zip = String(st.zipCode || '').trim();
    if (zip) body.shippingZip = zip.slice(0, 20);
    const phone = String(st.phoneNumber || '').trim();
    if (phone) body.shippingPhone = phone.slice(0, 20);

    const raw = await this.authed(CJ_SHOPPING_CREATE_ORDER_V2_PATH, body);
    const data = asRecord(raw);
    if (!data) {
      throw new CjSupplierError('CJ createOrderV2 returned empty data', { code: 'CJ_UNKNOWN' });
    }
    const orderId = String(data.orderId || '').trim();
    if (!orderId) {
      throw new CjSupplierError(
        'CJ createOrderV2 response missing orderId (see CJ doc: non-CJ SKU / webhook)',
        { code: 'CJ_UNKNOWN' }
      );
    }
    const orderStatus = String(data.orderStatus || 'CREATED').trim() || 'CREATED';
    const rawSummary: Record<string, unknown> = {
      orderId: data.orderId,
      orderNumber: data.orderNumber,
      orderStatus: data.orderStatus,
      logisticsMiss: data.logisticsMiss,
    };
    return { cjOrderId: orderId, status: orderStatus, rawSummary };
  }

  /** `GET shopping/order/getOrderDetail?orderId=` — estado y tracking según doc. */
  async getOrderStatus(cjOrderId: string): Promise<CjOrderStatusResult> {
    const id = String(cjOrderId || '').trim();
    if (!id) {
      throw new CjSupplierError('cjOrderId required', { code: 'CJ_INVALID_SKU' });
    }
    const path = `${CJ_SHOPPING_GET_ORDER_DETAIL_PATH}?orderId=${encodeURIComponent(id)}`;
    const raw = await this.authedGet(path);
    const data = asRecord(raw);
    if (!data) {
      throw new CjSupplierError('getOrderDetail returned empty data', { code: 'CJ_UNKNOWN' });
    }
    return {
      status: String(data.orderStatus || '').trim(),
      cjOrderId: String(data.orderId || id).trim(),
      trackNumber: data.trackNumber == null ? null : String(data.trackNumber),
      trackingUrl: data.trackingUrl == null ? null : String(data.trackingUrl),
      logisticName: data.logisticName == null ? null : String(data.logisticName),
      raw: data,
    };
  }

  /**
   * No hay endpoint separado “solo tracking” en la doc Shopping analizada: se usa `getOrderDetail`.
   */
  async getTracking(cjOrderId: string): Promise<CjTrackingResult | null> {
    const s = await this.getOrderStatus(cjOrderId);
    const tn = s.trackNumber?.trim();
    const carrier = s.logisticName?.trim();
    const tu = s.trackingUrl?.trim();
    if (!tn && !carrier && !tu) {
      return null;
    }
    return {
      trackingNumber: tn || undefined,
      carrierCode: carrier || undefined,
      trackingUrl: tu || undefined,
      cjOrderStatus: s.status,
    };
  }

  /**
   * `PATCH shopping/order/confirmOrder` — cuerpo oficial `{ orderId }`.
   * Doc: https://developers.cjdropshipping.com/en/api/api2/api/shopping.html#_1-9-confirm-orderpatch
   */
  async confirmOrder(cjOrderId: string): Promise<CjConfirmOrderResult> {
    const id = String(cjOrderId || '').trim();
    if (!id) {
      throw new CjSupplierError('cjOrderId required for confirmOrder', { code: 'CJ_INVALID_SKU' });
    }
    const raw = await this.authedPatch(CJ_SHOPPING_CONFIRM_ORDER_PATH, { orderId: id });
    const outId = typeof raw === 'string' && raw.trim() ? raw.trim() : id;
    return { orderId: outId };
  }

  /**
   * `POST shopping/pay/payBalance` — cuerpo oficial `{ orderId }`.
   * Doc: https://developers.cjdropshipping.com/en/api/api2/api/shopping.html#_2-2-pay-balancepost
   */
  async payBalance(cjOrderId: string): Promise<CjPayBalanceResult> {
    const id = String(cjOrderId || '').trim();
    if (!id) {
      throw new CjSupplierError('cjOrderId required for payBalance', { code: 'CJ_INVALID_SKU' });
    }
    await this.authed(CJ_SHOPPING_PAY_BALANCE_PATH, { orderId: id });
    return { ok: true };
  }
}

/**
 * One-off connection test with a raw API key (does not read DB). Used by credentials test endpoint and availability checks.
 */
export async function testCjDropshippingConnectionWithApiKey(apiKey: string): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
  latencyMs?: number;
}> {
  const t0 = Date.now();
  const key = String(apiKey || '').trim();
  if (!key) {
    return { ok: false, error: 'apiKey is required' };
  }
  const client = new CjSupplierHttpClient();
  try {
    const raw = await client.postUnauthenticated('authentication/getAccessToken', { apiKey: key });
    const payload = parseTokenPayload(raw);
    await client.getWithAccessToken(payload.accessToken, 'setting/get');
    return {
      ok: true,
      message: 'CJ auth OK; setting/get succeeded',
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    const msg = e instanceof CjSupplierError ? e.message : e instanceof Error ? e.message : String(e);
    const code = e instanceof CjSupplierError ? e.code : 'CJ_UNKNOWN';
    return {
      ok: false,
      error: msg,
      message: `CJ connection failed (${code})`,
      latencyMs: Date.now() - t0,
    };
  }
}

export function createCjSupplierAdapter(userId: number): ICjSupplierAdapter {
  return new CjSupplierAdapter(userId, 'production');
}
