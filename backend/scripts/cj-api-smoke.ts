/**
 * Prueba real de autenticación CJ (token + GET documentados).
 * No imprime accessToken ni refreshToken completos.
 *
 * Requiere: CJ_API_KEY o CJ_DROPSHIPPING_API_KEY en entorno (p. ej. backend/.env).
 *
 * Para pruebas negativas POST→500 (método incorrecto), usar: npm run cj-api:diagnose-500
 *
 * Uso: cd backend && npm run cj-api:smoke
 */
import 'dotenv/config';
import { createCjSupplierAdapter } from '../src/modules/cj-ebay/adapters/cj-supplier.adapter';
import { CjSupplierHttpClient } from '../src/modules/cj-ebay/adapters/cj-supplier.client';

function maskKey(s: string): string {
  const t = s.trim();
  if (t.length < 8) return '****';
  return `****${t.slice(-4)}`;
}

function tokenPresence(t: string): string {
  if (!t) return '(absent)';
  return `present, length=${t.length} (value not logged)`;
}

async function main(): Promise<void> {
  const apiKey = (process.env.CJ_API_KEY || process.env.CJ_DROPSHIPPING_API_KEY || '').trim();
  const source = process.env.CJ_API_KEY?.trim()
    ? 'CJ_API_KEY'
    : process.env.CJ_DROPSHIPPING_API_KEY?.trim()
      ? 'CJ_DROPSHIPPING_API_KEY'
      : '';

  if (!apiKey) {
    console.error('[cj-smoke] NO-GO: set CJ_API_KEY or CJ_DROPSHIPPING_API_KEY in backend/.env');
    process.exit(2);
  }

  console.log('[cj-smoke] apiKey source:', source, 'value:', maskKey(apiKey));

  const client = new CjSupplierHttpClient();

  try {
    const data = (await client.postUnauthenticated('authentication/getAccessToken', {
      apiKey,
    })) as Record<string, unknown>;

    const at = String(data.accessToken || '');
    const rt = String(data.refreshToken || '');

    console.log('[cj-smoke] getAccessToken HTTP envelope: OK');
    console.log('[cj-smoke] response has accessToken (length>0):', at.length > 0);
    console.log('[cj-smoke] response has refreshToken (length>0):', rt.length > 0);
    console.log(
      '[cj-smoke] accessTokenExpiryDate parseable:',
      !Number.isNaN(Date.parse(String(data.accessTokenExpiryDate || '')))
    );
    console.log(
      '[cj-smoke] refreshTokenExpiryDate parseable:',
      !Number.isNaN(Date.parse(String(data.refreshTokenExpiryDate || '')))
    );
    console.log('[cj-smoke] accessToken:', tokenPresence(at));
    console.log('[cj-smoke] refreshToken:', tokenPresence(rt));

    let authedOk = false;
    try {
      await client.getWithAccessToken(at, 'setting/get');
      console.log('[cj-smoke] authed GET setting/get (documented): OK');
      authedOk = true;
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      console.warn('[cj-smoke] GET setting/get failed:', msg2);
    }

    try {
      await client.getWithAccessToken(at, 'product/listV2?page=1&size=3&keyWord=phone');
      console.log('[cj-smoke] authed GET product/listV2 (documented search): OK');
      authedOk = true;
    } catch (e4) {
      const msg4 = e4 instanceof Error ? e4.message : String(e4);
      console.warn('[cj-smoke] GET product/listV2 failed:', msg4);
    }

    if (!authedOk) {
      console.warn(
        '[cj-smoke] Documented GET probes failed after getAccessToken — check CJ status, QPS (wait 1s+), or CJ_DIAGNOSTIC_LOGS=1.'
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cj-smoke] getAccessToken failed:', msg);
    process.exit(1);
  }

  const adapter = createCjSupplierAdapter(1);
  const verify = await adapter.verifyAuth();
  if (!verify.ok) {
    console.warn('[cj-smoke] adapter.verifyAuth:', verify.error.code, verify.error.message);
  } else {
    console.log('[cj-smoke] adapter.verifyAuth: OK (GET setting/get + throttle/429 retry)');
  }

  console.log(
    verify.ok
      ? '[cj-smoke] GO — CJ API key, token, GET probes, and adapter verifyAuth succeeded'
      : '[cj-smoke] PARTIAL-GO — API key + getAccessToken OK; some probes failed (see warnings above)'
  );
  process.exit(0);
}

void main();
