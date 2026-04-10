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

const VALID_SITE_IDS = new Set([
  'MLA', 'MLB', 'MLC', 'MLM', 'MLU', 'MLE', 'MCO', 'MPE',
  'MLV', 'MBO', 'MPY', 'MEC', 'MGT', 'MRD', 'MLN',
]);

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
  const query  = String(body.query  || '').trim().slice(0, 200);
  const limit  = Math.min(Math.max(Number(body.limit) || 20, 1), 20);
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

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15_000);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller/1.0)',
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const mlRes = await fetch(mlUrl, { headers, signal: controller.signal });

    clearTimeout(timeoutId);

    if (!mlRes.ok) {
      // Forward the ML error so caller knows why (403, 429, etc.)
      const errText = await mlRes.text().catch(() => '');
      res.status(mlRes.status).json({
        error: `ML API returned ${mlRes.status}`,
        detail: errText.slice(0, 500),
      });
      return;
    }

    const data = await mlRes.json() as { results?: any[]; paging?: any };
    // Return exactly what ML returns so scraper-bridge.service parses it correctly
    res.status(200).json(data);
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || err?.code === 'ABORT_ERR';
    res.status(504).json({
      error: isTimeout ? 'ML API request timed out (15s)' : (err?.message || 'Bridge error'),
    });
  }
}
