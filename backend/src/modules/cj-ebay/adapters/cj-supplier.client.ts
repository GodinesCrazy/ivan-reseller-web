/**
 * CJdropshipping Open API 2.0 — minimal JSON client (FASE 3B).
 * No AliExpress, no eBay publish, no fulfillment-tracking-sync.
 *
 * Official base and paths: https://developers.cjdropshipping.com/en/api/api2/
 * Success rule (HTTP + envelope): https://developers.cjdropshipping.com/en/api/start/development.html
 */

import { logger } from '../../../config/logger';
import { CjSupplierError, type CjSupplierErrorCode } from './cj-supplier.errors';

/** Documented production base for API 2.0 v1. */
export const CJ_OPEN_API_V2_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

export type CjJsonObject = Record<string, unknown>;

export interface CjAccessTokenPayload {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiryDate?: string;
  refreshTokenExpiryDate?: string;
  openId?: number;
}

function joinUrl(subPath: string): string {
  const path = subPath.replace(/^\//, '');
  return `${CJ_OPEN_API_V2_BASE}/${path}`;
}

/** Public URL builder for scripts and diagnostics (same as internal `joinUrl`). */
export function buildCjOpenApiV1Url(subPathWithQuery: string): string {
  return joinUrl(subPathWithQuery);
}

function cjDiagnosticLogsEnabled(): boolean {
  const v = process.env.CJ_DIAGNOSTIC_LOGS;
  return v === '1' || v === 'true';
}

function redactHeadersForLog(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === 'cj-access-token') {
      out[k] = `REDACTED(len=${v.length})`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Redact `apiKey` when logging JSON request bodies (e.g. getAccessToken). */
function redactRequestBodyForLog(body: string | undefined): string | undefined {
  if (body === undefined) return undefined;
  try {
    const o = JSON.parse(body) as Record<string, unknown>;
    if (typeof o.apiKey === 'string') {
      o.apiKey = `REDACTED(len=${String(o.apiKey).length})`;
    }
    const s = JSON.stringify(o);
    return s.length > 8000 ? `${s.slice(0, 8000)}\n…[truncated]` : s;
  } catch {
    return body.length > 8000 ? `${body.slice(0, 8000)}\n…[truncated]` : body;
  }
}

function logCjHttpDiagnostic(entry: {
  utcIso: string;
  method: string;
  url: string;
  requestHeadersRedacted: Record<string, string>;
  requestBodyRedactedPreview?: string;
  httpStatus: number;
  responseBody: string;
}): void {
  logger.warn('[cj-http-diagnostic]', entry);
}

function parseJsonTextOrThrow(text: string, httpStatus: number): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CjSupplierError('CJ response is not JSON', {
      code: 'CJ_NETWORK',
      httpStatus,
      retryable: true,
    });
  }
}

function mapCjFailureCode(code: number | undefined): CjSupplierErrorCode {
  if (code === 1600003) return 'CJ_AUTH_EXPIRED';
  if (code === 1600001 || code === 1601000) return 'CJ_AUTH_INVALID';
  return 'CJ_UNKNOWN';
}

/**
 * Extract `data` when CJ reports success (code 200 or absent code with success !== false).
 */
export function unwrapCjData(json: unknown): unknown {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new CjSupplierError('Invalid CJ JSON envelope', { code: 'CJ_UNKNOWN' });
  }
  const o = json as CjJsonObject;
  const code = o.code;
  const success = o.success;
  const message = typeof o.message === 'string' ? o.message : undefined;

  if (success === false || (typeof code === 'number' && code !== 200)) {
    throw new CjSupplierError(message || 'CJ API error', {
      code: mapCjFailureCode(typeof code === 'number' ? code : undefined),
      cjMessage: message,
      retryable: false,
    });
  }

  return o.data;
}

export class CjSupplierHttpClient {
  async postUnauthenticated(subPath: string, body: CjJsonObject): Promise<unknown> {
    const url = joinUrl(subPath);
    const bodyStr = JSON.stringify(body);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
        signal: AbortSignal.timeout(45_000),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn('[cj-supplier.client] network error (unauthenticated)', { subPath, msg });
      throw new CjSupplierError(`CJ network: ${msg}`, { code: 'CJ_NETWORK', retryable: true });
    }

    const text = await res.text();
    const utcIso = new Date().toISOString();
    if (cjDiagnosticLogsEnabled()) {
      logCjHttpDiagnostic({
        utcIso,
        method: 'POST',
        url,
        requestHeadersRedacted: { 'Content-Type': 'application/json' },
        requestBodyRedactedPreview: redactRequestBodyForLog(bodyStr),
        httpStatus: res.status,
        responseBody: text,
      });
    }

    if (!res.ok) {
      throw new CjSupplierError(`CJ HTTP ${res.status}`, {
        code: 'CJ_NETWORK',
        httpStatus: res.status,
        retryable: res.status >= 500,
      });
    }

    const json = parseJsonTextOrThrow(text, res.status);
    return unwrapCjData(json);
  }

  /**
   * GET autenticado (p. ej. `shopping/order/getOrderDetail?orderId=...`).
   * Doc: header `CJ-Access-Token`; `platformToken` no requerido en el ejemplo GET.
   */
  async getWithAccessToken(accessToken: string, subPathWithQuery: string): Promise<unknown> {
    const url = joinUrl(subPathWithQuery);
    const headers = { 'CJ-Access-Token': accessToken };
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(45_000),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn('[cj-supplier.client] network error (GET)', { subPathWithQuery, msg });
      throw new CjSupplierError(`CJ network: ${msg}`, { code: 'CJ_NETWORK', retryable: true });
    }

    const text = await res.text();
    const utcIso = new Date().toISOString();
    if (cjDiagnosticLogsEnabled()) {
      logCjHttpDiagnostic({
        utcIso,
        method: 'GET',
        url,
        requestHeadersRedacted: redactHeadersForLog(headers),
        httpStatus: res.status,
        responseBody: text,
      });
    }

    if (res.status === 429) {
      throw new CjSupplierError('CJ rate limit', { code: 'CJ_RATE_LIMIT', httpStatus: 429, retryable: true });
    }

    if (!res.ok) {
      throw new CjSupplierError(`CJ HTTP ${res.status}`, {
        code: 'CJ_NETWORK',
        httpStatus: res.status,
        retryable: res.status >= 500,
      });
    }

    const json = parseJsonTextOrThrow(text, res.status);
    return unwrapCjData(json);
  }

  /**
   * PATCH con token (p. ej. `shopping/order/confirmOrder`). Mismos headers que POST autenticado.
   */
  async patchWithAccessToken(accessToken: string, subPath: string, body: CjJsonObject = {}): Promise<unknown> {
    const url = joinUrl(subPath);
    const headerObj = {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
      platformToken: '',
    };
    const bodyStr = JSON.stringify(body);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'PATCH',
        headers: headerObj,
        body: bodyStr,
        signal: AbortSignal.timeout(45_000),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn('[cj-supplier.client] network error (PATCH)', { subPath, msg });
      throw new CjSupplierError(`CJ network: ${msg}`, { code: 'CJ_NETWORK', retryable: true });
    }

    const text = await res.text();
    const utcIso = new Date().toISOString();
    if (cjDiagnosticLogsEnabled()) {
      logCjHttpDiagnostic({
        utcIso,
        method: 'PATCH',
        url,
        requestHeadersRedacted: redactHeadersForLog(headerObj),
        requestBodyRedactedPreview: bodyStr.length > 8000 ? `${bodyStr.slice(0, 8000)}\n…[truncated]` : bodyStr,
        httpStatus: res.status,
        responseBody: text,
      });
    }

    if (res.status === 429) {
      throw new CjSupplierError('CJ rate limit', { code: 'CJ_RATE_LIMIT', httpStatus: 429, retryable: true });
    }

    if (!res.ok) {
      throw new CjSupplierError(`CJ HTTP ${res.status}`, {
        code: 'CJ_NETWORK',
        httpStatus: res.status,
        retryable: res.status >= 500,
      });
    }

    const json = parseJsonTextOrThrow(text, res.status);
    return unwrapCjData(json);
  }

  /**
   * POST con token. Incluye `platformToken` vacío como en el CURL oficial Create Order V2/V3.
   */
  async postWithAccessToken(accessToken: string, subPath: string, body: CjJsonObject = {}): Promise<unknown> {
    const url = joinUrl(subPath);
    const headerObj = {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
      platformToken: '',
    };
    const bodyStr = JSON.stringify(body);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: headerObj,
        body: bodyStr,
        signal: AbortSignal.timeout(45_000),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn('[cj-supplier.client] network error (authenticated)', { subPath, msg });
      throw new CjSupplierError(`CJ network: ${msg}`, { code: 'CJ_NETWORK', retryable: true });
    }

    const text = await res.text();
    const utcIso = new Date().toISOString();
    if (cjDiagnosticLogsEnabled()) {
      logCjHttpDiagnostic({
        utcIso,
        method: 'POST',
        url,
        requestHeadersRedacted: redactHeadersForLog(headerObj),
        requestBodyRedactedPreview: bodyStr.length > 8000 ? `${bodyStr.slice(0, 8000)}\n…[truncated]` : bodyStr,
        httpStatus: res.status,
        responseBody: text,
      });
    }

    if (res.status === 429) {
      throw new CjSupplierError('CJ rate limit', { code: 'CJ_RATE_LIMIT', httpStatus: 429, retryable: true });
    }

    if (!res.ok) {
      throw new CjSupplierError(`CJ HTTP ${res.status}`, {
        code: 'CJ_NETWORK',
        httpStatus: res.status,
        retryable: res.status >= 500,
      });
    }

    const json = parseJsonTextOrThrow(text, res.status);
    return unwrapCjData(json);
  }
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

export function readList(payload: unknown): Record<string, unknown>[] {
  const r = asRecord(payload);
  if (!r) return [];
  const list = r.list;
  if (!Array.isArray(list)) return [];
  return list.filter((x): x is Record<string, unknown> => !!asRecord(x));
}

/** Some CJ endpoints return either `{ list: [...] }` or a raw array in `data`. */
export function readListOrArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((x): x is Record<string, unknown> => !!asRecord(x));
  }
  return readList(payload);
}
