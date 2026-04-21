/**
 * Deep CJ Open API 2.0 probe: compares documented GET contracts vs legacy POST misuse,
 * logs one block per request (UTC, URL, method, redacted headers, body preview, status, full response text).
 *
 * Does not print accessToken, refreshToken, or apiKey values.
 *
 * Usage: cd backend && npx tsx scripts/cj-api-diagnose-500.ts
 */
import 'dotenv/config';
import { createCjSupplierAdapter } from '../src/modules/cj-ebay/adapters/cj-supplier.adapter';
import { buildCjOpenApiV1Url, CjSupplierHttpClient } from '../src/modules/cj-ebay/adapters/cj-supplier.client';

function maskKey(s: string): string {
  const t = s.trim();
  if (t.length < 8) return '****';
  return `****${t.slice(-4)}`;
}

function redactHeaders(h: Record<string, string>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === 'cj-access-token') o[k] = `REDACTED(len=${v.length})`;
    else o[k] = v;
  }
  return o;
}

const CJ_PROBE_INTERVAL_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function redactBodyJson(s: string): string {
  try {
    const j = JSON.parse(s) as Record<string, unknown>;
    if (typeof j.apiKey === 'string') j.apiKey = `REDACTED(len=${j.apiKey.length})`;
    return JSON.stringify(j);
  } catch {
    return s.length > 2000 ? `${s.slice(0, 2000)}…[truncated]` : s;
  }
}

async function probe(
  name: string,
  init: {
    method: 'GET' | 'POST';
    pathWithQuery: string;
    accessToken?: string;
    jsonBody?: Record<string, unknown>;
  }
): Promise<{ status: number; text: string }> {
  const url = buildCjOpenApiV1Url(init.pathWithQuery);
  const utcIso = new Date().toISOString();
  const headers: Record<string, string> = {};
  if (init.accessToken) {
    headers['CJ-Access-Token'] = init.accessToken;
  }
  if (init.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    headers.platformToken = '';
  }

  const bodyStr =
    init.method === 'POST' && init.jsonBody !== undefined ? JSON.stringify(init.jsonBody) : undefined;

  const res = await fetch(url, {
    method: init.method,
    headers,
    body: bodyStr,
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();

  console.log('\n======== CJ PROBE ========');
  console.log('label:', name);
  console.log('utcIso:', utcIso);
  console.log('method:', init.method);
  console.log('url:', url);
  console.log('requestHeaders (redacted):', JSON.stringify(redactHeaders(headers), null, 2));
  if (bodyStr !== undefined) {
    console.log('requestBody (redacted):', redactBodyJson(bodyStr));
  } else {
    console.log('requestBody: (none)');
  }
  console.log('httpStatus:', res.status);
  console.log('responseBody (full):', text);
  console.log('==========================\n');

  return { status: res.status, text };
}

async function main(): Promise<void> {
  const apiKey = (process.env.CJ_API_KEY || process.env.CJ_DROPSHIPPING_API_KEY || '').trim();
  if (!apiKey) {
    console.error('[cj-diagnose] NO-GO: set CJ_API_KEY or CJ_DROPSHIPPING_API_KEY');
    process.exit(2);
  }

  console.log('[cj-diagnose] apiKey:', maskKey(apiKey), '(masked)');

  const client = new CjSupplierHttpClient();
  const tokenPayload = (await client.postUnauthenticated('authentication/getAccessToken', {
    apiKey,
  })) as Record<string, unknown>;
  const accessToken = String(tokenPayload.accessToken || '');
  if (!accessToken) {
    console.error('[cj-diagnose] NO-GO: getAccessToken returned no accessToken');
    process.exit(1);
  }
  console.log('[cj-diagnose] getAccessToken: OK (token not logged, length=', accessToken.length, ')');

  await sleep(CJ_PROBE_INTERVAL_MS);
  await probe('WRONG (legacy): POST setting/get — CJ doc specifies GET', {
    method: 'POST',
    pathWithQuery: 'setting/get',
    accessToken,
    jsonBody: {},
  });

  await sleep(CJ_PROBE_INTERVAL_MS);
  await probe('CORRECT: GET setting/get', {
    method: 'GET',
    pathWithQuery: 'setting/get',
    accessToken,
  });

  await sleep(CJ_PROBE_INTERVAL_MS);
  await probe('WRONG (legacy): POST product/query with pageNum/pageSize — doc: GET + listV2 or GET + pid', {
    method: 'POST',
    pathWithQuery: 'product/query',
    accessToken,
    jsonBody: { pageNum: 1, pageSize: 1 },
  });

  await sleep(CJ_PROBE_INTERVAL_MS);
  const listRes = await probe('CORRECT: GET product/listV2 (sample)', {
    method: 'GET',
    pathWithQuery: 'product/listV2?page=1&size=5&keyWord=test',
    accessToken,
  });

  let samplePid = '';
  try {
    const j = JSON.parse(listRes.text) as { data?: { content?: Array<{ productList?: Array<{ id?: string }> }> } };
    const pl = j.data?.content?.[0]?.productList?.[0];
    if (pl && typeof pl.id === 'string') samplePid = pl.id;
  } catch {
    /* ignore */
  }

  if (samplePid) {
    await sleep(CJ_PROBE_INTERVAL_MS);
    await probe('CORRECT: GET product/query?pid=… (pid from listV2)', {
      method: 'GET',
      pathWithQuery: `product/query?pid=${encodeURIComponent(samplePid)}`,
      accessToken,
    });
  } else {
    console.log('[cj-diagnose] skip product/query probe: no pid extracted from listV2 response');
  }

  console.log('[cj-diagnose] Adapter verifyAuth() — uses GET setting/get internally');
  const adapter = createCjSupplierAdapter(1);
  const v = await adapter.verifyAuth();
  console.log(
    '[cj-diagnose] adapter.verifyAuth:',
    v.ok ? 'OK' : `FAIL ${v.error.code} ${v.error.message}`
  );

  const go =
    listRes.status >= 200 &&
    listRes.status < 300 &&
    v.ok &&
    (() => {
      try {
        const j = JSON.parse(listRes.text) as { code?: number; success?: boolean };
        return j.success !== false && (j.code === undefined || j.code === 200);
      } catch {
        return false;
      }
    })();

  console.log(go ? '[cj-diagnose] GO — documented GET paths respond; verifyAuth OK' : '[cj-diagnose] NO-GO — inspect probes above');
  process.exit(0);
}

void main();
