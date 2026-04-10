/**
 * Vercel Serverless Function — ML Bridge: MercadoLibre search proxy
 * Path: POST /api/scraping/mercadolibre/search
 *
 * Problem: Railway shared IPs are blocked by MercadoLibre for GET /sites/{id}/search.
 * Solution: this function runs on Vercel IPs (not blocked) and proxies the search request.
 *
 * Called by: backend/src/services/scraper-bridge.service.ts → searchMLCompetitors()
 * when SCRAPER_BRIDGE_URL=https://www.ivanreseller.com/api is configured in Railway.
 *
 * Security: optionally validates x-bridge-secret header against ML_BRIDGE_SECRET env var.
 * Set the same secret in both Railway (SCRAPER_BRIDGE_SECRET) and Vercel (ML_BRIDGE_SECRET).
 */

export const config = {
  maxDuration: 20,
};

declare const process: {
  env: Record<string, string | undefined>;
};

const VALID_SITE_IDS = new Set([
  'MLA', 'MLB', 'MLC', 'MLM', 'MLU', 'MLE', 'MCO', 'MPE',
  'MLV', 'MBO', 'MPY', 'MEC', 'MGT', 'MRD', 'MLN',
]);

type BridgeFetchResult = {
  ok: boolean;
  status: number;
  data: any;
  text: string;
};

type BridgeAttemptResult = {
  source: 'ml_direct' | 'scraperapi' | 'zenrows';
  enabled: boolean;
  ok: boolean;
  status: number;
  payload: any | null;
  detail: string;
};

function toBoolean(v: string | undefined, defaultValue: boolean): boolean {
  if (v == null || v === '') return defaultValue;
  const n = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(n)) return true;
  if (['0', 'false', 'no', 'off'].includes(n)) return false;
  return defaultValue;
}

function tryParseJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<BridgeFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text().catch(() => '');
    const parsed = text ? tryParseJson(text) : null;
    return {
      ok: response.ok,
      status: response.status,
      data: parsed,
      text,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeMlPayload(payload: any): any {
  if (!payload) return null;
  if (Array.isArray(payload?.results)) return payload;
  if (Array.isArray(payload?.data?.results)) return payload.data;
  if (Array.isArray(payload?.items)) {
    return {
      results: payload.items,
      paging: payload.paging || { total: payload.items.length, offset: 0, limit: payload.items.length },
    };
  }
  return null;
}

function fallbackEnabledForStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || (status >= 500 && status <= 599);
}

function clampDetail(detail: string, maxLen: number = 300): string {
  return String(detail || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function emptyResultsPayload(limit: number, warning?: string, sources?: string[]) {
  return {
    results: [],
    paging: { total: 0, offset: 0, limit },
    ...(warning ? { bridgeWarning: warning } : {}),
    ...(sources && sources.length > 0 ? { bridgeSourcesTried: sources } : {}),
  };
}

function looksLikeProviderQuotaIssue(detail: string): boolean {
  const d = clampDetail(detail, 500).toLowerCase();
  if (!d) return false;
  return (
    d.includes('exhausted') ||
    d.includes('credits available') ||
    d.includes('reached its validity period') ||
    d.includes('purchase a new subscription') ||
    d.includes('auth005') ||
    d.includes('billing')
  );
}

function shouldFailOpen(attempts: BridgeAttemptResult[]): boolean {
  const executed = attempts.filter((a) => a.enabled);
  if (executed.length === 0) return false;
  const allBlockedOrUnavailable = executed.every((a) => {
    if (a.ok && a.payload) return false;
    if (a.status === 0) return true;
    return a.status === 401 || a.status === 402 || a.status === 403 || a.status === 429 || a.status >= 500;
  });
  if (!allBlockedOrUnavailable) return false;
  return executed.some((a) => looksLikeProviderQuotaIssue(a.detail) || a.status === 401 || a.status === 402 || a.status === 403 || a.status === 429);
}

async function runAttempt(params: {
  source: BridgeAttemptResult['source'];
  enabled: boolean;
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
}): Promise<BridgeAttemptResult> {
  if (!params.enabled) {
    return {
      source: params.source,
      enabled: false,
      ok: false,
      status: 0,
      payload: null,
      detail: 'source_disabled',
    };
  }
  try {
    const result = await fetchWithTimeout(params.url, { headers: params.headers }, params.timeoutMs);
    return {
      source: params.source,
      enabled: true,
      ok: result.ok,
      status: result.status,
      payload: normalizeMlPayload(result.data),
      detail: clampDetail(result.text),
    };
  } catch (error: any) {
    return {
      source: params.source,
      enabled: true,
      ok: false,
      status: 0,
      payload: null,
      detail: clampDetail(error?.message || 'request_failed'),
    };
  }
}

export default async function handler(req: any, res: any): Promise<void> {
  // ── Auth check (optional) ──────────────────────────────────────────────────
  const secret = (process.env.ML_BRIDGE_SECRET || '').trim();
  if (secret) {
    const provided = String(req.headers['x-bridge-secret'] || '').trim();
    if (provided !== secret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  // ── Method guard ───────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const body = req.body || {};
  const siteId = String(body.site_id || '').trim().toUpperCase();
  const query  = String(body.query || '').trim().slice(0, 200);
  const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 20);
  const accessToken = String(body.access_token || '').trim();

  if (!siteId || !VALID_SITE_IDS.has(siteId)) {
    res.status(400).json({ error: `Invalid site_id. Valid: ${[...VALID_SITE_IDS].join(', ')}` });
    return;
  }
  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  // ── Proxy to MercadoLibre API ──────────────────────────────────────────────
  const mlUrl =
    `https://api.mercadolibre.com/sites/${siteId}/search` +
    `?q=${encodeURIComponent(query)}&limit=${limit}`;
  const timeoutMs = Math.max(5000, Math.min(25000, Number(process.env.ML_BRIDGE_TIMEOUT_MS || '15000') || 15000));
  const useScraperApi = toBoolean(process.env.ML_BRIDGE_USE_SCRAPERAPI, true);
  const useZenRows = toBoolean(process.env.ML_BRIDGE_USE_ZENROWS, true);
  const scraperApiKey = String(process.env.SCRAPER_API_KEY || process.env.SCRAPERAPI_KEY || '').trim();
  const zenRowsKey = String(process.env.ZENROWS_API_KEY || '').trim();
  const scraperApiPremium = toBoolean(process.env.ML_BRIDGE_SCRAPERAPI_PREMIUM, true);
  const scraperApiUltraPremium = toBoolean(process.env.ML_BRIDGE_SCRAPERAPI_ULTRA_PREMIUM, false);
  const preferProxyFirst = toBoolean(process.env.ML_BRIDGE_PROXY_FIRST, siteId === 'MLC');
  const failOpenOnProviderIssues = toBoolean(process.env.ML_BRIDGE_FAIL_OPEN_EMPTY, true);

  try {
    const directHeaders: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller/1.0)',
    };
    if (accessToken) {
      directHeaders.Authorization = `Bearer ${accessToken}`;
    }

    const scraperUrl =
      `https://api.scraperapi.com/?api_key=${encodeURIComponent(scraperApiKey)}` +
      `&url=${encodeURIComponent(mlUrl)}&render=false&keep_headers=true&country_code=cl` +
      `${scraperApiPremium ? '&premium=true' : ''}` +
      `${scraperApiUltraPremium ? '&ultra_premium=true' : ''}`;
    const zenUrl =
      `https://api.zenrows.com/v1/?apikey=${encodeURIComponent(zenRowsKey)}` +
      `&url=${encodeURIComponent(mlUrl)}&premium_proxy=true&js_render=false`;
    const proxyHeaders: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller/1.0)',
    };

    const orderedAttempts: Array<() => Promise<BridgeAttemptResult>> = [];
    const makeDirect = () =>
      runAttempt({
        source: 'ml_direct',
        enabled: true,
        url: mlUrl,
        headers: directHeaders,
        timeoutMs,
      });
    const makeScraper = () =>
      runAttempt({
        source: 'scraperapi',
        enabled: useScraperApi && scraperApiKey.length > 0,
        url: scraperUrl,
        headers: proxyHeaders,
        timeoutMs,
      });
    const makeZen = () =>
      runAttempt({
        source: 'zenrows',
        enabled: useZenRows && zenRowsKey.length > 0,
        url: zenUrl,
        headers: proxyHeaders,
        timeoutMs,
      });

    if (preferProxyFirst) {
      orderedAttempts.push(makeScraper, makeZen, makeDirect);
    } else {
      orderedAttempts.push(makeDirect, makeScraper, makeZen);
    }

    const attempts: BridgeAttemptResult[] = [];
    for (const pending of orderedAttempts) {
      const attempt = await pending();
      attempts.push(attempt);

      if (attempt.ok && attempt.payload) {
        res.setHeader('x-ml-bridge-source', attempt.source);
        res.status(200).json(attempt.payload);
        return;
      }

      if (attempt.source === 'ml_direct' && attempt.status > 0 && !fallbackEnabledForStatus(attempt.status)) {
        res.status(attempt.status || 502).json({
          error: `ML API returned ${attempt.status || 502}`,
          detail: attempt.detail,
        });
        return;
      }
    }

    if (failOpenOnProviderIssues && shouldFailOpen(attempts)) {
      res.setHeader('x-ml-bridge-source', 'degraded_empty');
      res.setHeader('x-ml-bridge-degraded', '1');
      res.status(200).json(
        emptyResultsPayload(
          limit,
          'ML search temporarily blocked or provider quota unavailable; using safe empty fallback',
          attempts.filter((a) => a.enabled).map((a) => a.source)
        )
      );
      return;
    }

    const firstFailure = attempts.find((a) => a.enabled && a.status > 0);
    res.status(firstFailure?.status || 502).json({
      error: `ML API returned ${firstFailure?.status || 502}`,
      detail: firstFailure?.detail || 'Bridge fallbacks exhausted',
    });
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || err?.code === 'ABORT_ERR';
    res.status(504).json({
      error: isTimeout ? 'ML API request timed out' : (err?.message || 'Bridge error'),
    });
  }
}
