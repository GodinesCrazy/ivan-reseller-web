import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

type SearchResult = {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  listPriceUsd?: number;
  inventoryTotal?: number;
  fulfillmentOrigin?: 'US' | 'CN' | 'UNKNOWN';
};

type EvaluationResult = {
  ok?: boolean;
  cjProductId: string;
  title: string;
  imageUrls: string[];
  variants: Array<{
    cjSku: string;
    cjVid?: string;
    unitCostUsd: number;
    stock: number;
    attributes: Record<string, string>;
  }>;
  shipping: {
    amountUsd: number;
    method?: string;
    estimatedDays: number | null;
    fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN';
    confidence: string;
  } | null;
  qualification: {
    decision: string;
    breakdown: {
      supplierCostUsd: number;
      shippingCostUsd: number;
      totalCostUsd: number;
      paymentProcessingFeeUsd: number;
      targetProfitUsd: number;
      suggestedSellPriceUsd: number;
    };
  } | null;
  shippingError?: string;
};

type CandidateRecord = {
  keyword: string;
  page: number;
  rank: number;
  cjProductId: string;
  title: string;
  listPriceUsd: number | null;
  searchInventoryTotal: number | null;
  searchOrigin: string | null;
};

type EvaluatedCandidateRecord = CandidateRecord & {
  evaluated: boolean;
  evaluationError?: string;
  shipping?: EvaluationResult['shipping'];
  shippingError?: string;
  qualificationDecision?: string;
  pricingBreakdown?: EvaluationResult['qualification'] extends { breakdown: infer T } ? T : never;
  variantsCount?: number;
  maxVariantStock?: number;
  eligibleVariantCount?: number;
  selectedVariantCjVid?: string | null;
  selectedVariantCjSku?: string | null;
  discardReason?: string;
  score?: number;
};

function resolveBaseUrl(): string {
  const explicit = safeString(process.env.CJ_SHOPIFY_USA_VALIDATION_BASE_URL);
  if (explicit) return explicit;

  const apiUrl = safeString(process.env.API_URL);
  if (apiUrl && !/localhost|127\.0\.0\.1/i.test(apiUrl)) {
    return apiUrl;
  }

  return 'https://ivan-reseller-backend-production.up.railway.app';
}

const BASE_URL = resolveBaseUrl();
const LOGIN_USER = process.env.CJ_SHOPIFY_USA_VALIDATION_USER || process.env.AUTOPILOT_LOGIN_USER || 'admin';
const LOGIN_PASSWORD =
  process.env.CJ_SHOPIFY_USA_VALIDATION_PASSWORD || process.env.AUTOPILOT_LOGIN_PASSWORD || 'admin123';
const OUTPUT_PATH =
  process.env.CJ_SHOPIFY_USA_VALIDATION_OUT ||
  path.resolve(process.cwd(), 'cj-shopify-usa-live-validation-results.json');
const DEST_POSTAL_CODE = process.env.CJ_SHOPIFY_USA_DEST_POSTAL_CODE || '10001';
const SEARCH_PAGE_SIZE = 20;
const SEARCH_PAGES = [1, 2] as const;
const MAX_EVALS_PER_KEYWORD = 4;
const KEYWORDS = [
  'phone accessories',
  'home organization',
  'kitchen gadgets',
  'beauty tools',
  'pet accessories',
  'fitness accessories',
  'office accessories',
  'car accessories',
  'led gadgets',
  'travel accessories',
] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function safeString(value: unknown): string | null {
  const out = String(value ?? '').trim();
  return out.length > 0 ? out : null;
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function buildScore(candidate: EvaluatedCandidateRecord): number {
  const approved = candidate.qualificationDecision === 'APPROVED' ? 1 : 0;
  const hasShipping = candidate.shipping ? 1 : 0;
  const shippingUsd = candidate.shipping?.amountUsd ?? 999;
  const totalCost = candidate.pricingBreakdown?.totalCostUsd ?? 999;
  const suggested = candidate.pricingBreakdown?.suggestedSellPriceUsd ?? 999;
  const maxStock = candidate.maxVariantStock ?? 0;
  const eligibleVariants = candidate.eligibleVariantCount ?? 0;
  const usOrigin = candidate.shipping?.fulfillmentOrigin === 'US' || candidate.searchOrigin === 'US' ? 1 : 0;
  const balancedPrice = suggested >= 10 && suggested <= 40 ? 1 : 0;
  return (
    approved * 1_000_000 +
    hasShipping * 100_000 +
    usOrigin * 10_000 +
    balancedPrice * 1_000 +
    Math.min(maxStock, 999) * 10 +
    Math.min(eligibleVariants, 9) -
    Math.round(shippingUsd) -
    Math.round(totalCost)
  );
}

async function apiRequest<T = unknown>(input: {
  token: string;
  method?: 'GET' | 'POST';
  pathname: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}): Promise<{ status: number; data: T }> {
  const method = input.method || 'GET';
  const url = new URL(input.pathname, BASE_URL);
  for (const [key, value] of Object.entries(input.query || {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${input.token}`,
      ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: method !== 'GET' ? JSON.stringify(input.body ?? {}) : undefined,
  });

  const text = await response.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = { raw: text } as T;
  }

  if (!response.ok) {
    const message =
      safeString((data as JsonRecord)?.error) ||
      safeString((data as JsonRecord)?.message) ||
      `HTTP ${response.status}`;
    throw new Error(`${method} ${url.pathname} failed: ${message}`);
  }

  return { status: response.status, data };
}

async function login(): Promise<string> {
  const response = await fetch(new URL('/api/auth/login', BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: LOGIN_USER,
      password: LOGIN_PASSWORD,
    }),
  });

  const setCookie = response.headers.get('set-cookie') || '';
  const token = setCookie.match(/token=([^;]+)/)?.[1] || '';
  if (!response.ok || !token) {
    const body = await response.text().catch(() => '');
    throw new Error(`Login failed (${response.status}). ${body.slice(0, 300)}`);
  }

  return token;
}

async function main() {
  const startedAt = new Date().toISOString();
  const token = await login();

  const output: JsonRecord = {
    startedAt,
    baseUrl: BASE_URL,
    loginUser: LOGIN_USER,
    searchConfig: {
      keywords: [...KEYWORDS],
      pages: [...SEARCH_PAGES],
      pageSize: SEARCH_PAGE_SIZE,
      destPostalCode: DEST_POSTAL_CODE,
      maxEvaluationsPerKeyword: MAX_EVALS_PER_KEYWORD,
    },
  };

  const readiness = await apiRequest<JsonRecord>({
    token,
    pathname: '/api/cj-shopify-usa/system-readiness',
  });
  output.systemReadiness = readiness.data;

  const authTest = await apiRequest<JsonRecord>({
    token,
    method: 'POST',
    pathname: '/api/cj-shopify-usa/auth/test',
    body: {},
  });
  output.authTest = authTest.data;

  const overviewBefore = await apiRequest<JsonRecord>({
    token,
    pathname: '/api/cj-shopify-usa/overview',
  });
  output.overviewBefore = overviewBefore.data;

  const productsBefore = await apiRequest<JsonRecord>({
    token,
    pathname: '/api/cj-shopify-usa/products',
  });
  output.productsBeforeCount = Array.isArray((productsBefore.data as JsonRecord).products)
    ? ((productsBefore.data as JsonRecord).products as unknown[]).length
    : null;

  const listingsBefore = await apiRequest<JsonRecord>({
    token,
    pathname: '/api/cj-shopify-usa/listings',
  });
  output.listingsBeforeCount = Array.isArray((listingsBefore.data as JsonRecord).listings)
    ? ((listingsBefore.data as JsonRecord).listings as unknown[]).length
    : null;

  const searchRuns: Array<JsonRecord> = [];
  const evaluationPool: CandidateRecord[] = [];
  const seenInPool = new Set<string>();

  for (const keyword of KEYWORDS) {
    let pushedForKeyword = 0;

    for (const page of SEARCH_PAGES) {
      const search = await apiRequest<{
        ok: boolean;
        results: SearchResult[];
        count: number;
        page: number;
        pageSize: number;
      }>({
        token,
        pathname: '/api/cj-shopify-usa/discover/search',
        query: {
          keyword,
          page,
          pageSize: SEARCH_PAGE_SIZE,
        },
      });

      const results = Array.isArray(search.data.results) ? search.data.results : [];
      searchRuns.push({
        keyword,
        page,
        count: search.data.count,
        sampleTitles: results.slice(0, 5).map((item) => item.title),
      });

      results.forEach((result, index) => {
        if (pushedForKeyword >= MAX_EVALS_PER_KEYWORD) return;
        if (seenInPool.has(result.cjProductId)) return;
        evaluationPool.push({
          keyword,
          page,
          rank: index + 1,
          cjProductId: result.cjProductId,
          title: result.title,
          listPriceUsd: toNumber(result.listPriceUsd),
          searchInventoryTotal: toNumber(result.inventoryTotal),
          searchOrigin: safeString(result.fulfillmentOrigin),
        });
        seenInPool.add(result.cjProductId);
        pushedForKeyword += 1;
      });

      await sleep(1250);
    }
  }

  output.searchRuns = searchRuns;
  output.evaluationPoolCount = evaluationPool.length;

  const evaluatedCandidates: EvaluatedCandidateRecord[] = [];

  for (const candidate of evaluationPool) {
    const baseRecord: EvaluatedCandidateRecord = {
      ...candidate,
      evaluated: false,
    };

    if (candidate.searchInventoryTotal !== null && candidate.searchInventoryTotal <= 0) {
      baseRecord.discardReason = 'Search result reported inventoryTotal=0.';
      evaluatedCandidates.push(baseRecord);
      continue;
    }

    try {
      const evaluation = await apiRequest<EvaluationResult>({
        token,
        method: 'POST',
        pathname: '/api/cj-shopify-usa/discover/evaluate',
        body: {
          cjProductId: candidate.cjProductId,
          quantity: 1,
          destPostalCode: DEST_POSTAL_CODE,
        },
      });

      const variants = Array.isArray(evaluation.data.variants) ? evaluation.data.variants : [];
      const eligibleVariants = variants
        .map((variant) => ({
          cjVid: safeString(variant.cjVid),
          cjSku: safeString(variant.cjSku),
          stock: Math.max(0, Number(variant.stock || 0)),
        }))
        .filter((variant) => variant.stock >= 1);
      const selectedVariant = eligibleVariants.sort((a, b) => b.stock - a.stock)[0] || null;
      const maxVariantStock = variants.reduce((max, variant) => Math.max(max, Number(variant.stock || 0)), 0);

      const record: EvaluatedCandidateRecord = {
        ...candidate,
        evaluated: true,
        shipping: evaluation.data.shipping,
        shippingError: safeString(evaluation.data.shippingError) || undefined,
        qualificationDecision: safeString(evaluation.data.qualification?.decision) || undefined,
        pricingBreakdown: evaluation.data.qualification?.breakdown,
        variantsCount: variants.length,
        maxVariantStock,
        eligibleVariantCount: eligibleVariants.length,
        selectedVariantCjVid: selectedVariant?.cjVid || null,
        selectedVariantCjSku: selectedVariant?.cjSku || null,
      };

      if (eligibleVariants.length === 0) {
        record.discardReason = 'Evaluate found no variant with stock >= 1.';
      } else if (!evaluation.data.shipping) {
        record.discardReason = `Shipping quote unavailable${record.shippingError ? `: ${record.shippingError}` : '.'}`;
      } else if (record.qualificationDecision !== 'APPROVED') {
        record.discardReason = `Qualification decision is ${record.qualificationDecision || 'UNKNOWN'}.`;
      } else {
        record.score = buildScore(record);
      }

      evaluatedCandidates.push(record);
    } catch (error) {
      evaluatedCandidates.push({
        ...baseRecord,
        evaluationError: summarizeError(error),
        discardReason: 'Evaluate request failed.',
      });
    }

    await sleep(1250);
  }

  output.evaluatedCandidates = evaluatedCandidates;

  const viableCandidates = evaluatedCandidates
    .filter((candidate) => !candidate.discardReason && candidate.score !== undefined)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  output.viableCandidates = viableCandidates.slice(0, 10);

  const importPublishAttempts: Array<JsonRecord> = [];
  let chosenCandidate: EvaluatedCandidateRecord | null = null;
  let importDraftResult: JsonRecord | null = null;
  let publishResult: JsonRecord | null = null;

  for (const candidate of viableCandidates.slice(0, 5)) {
    const attempt: JsonRecord = {
      cjProductId: candidate.cjProductId,
      title: candidate.title,
      selectedVariantCjVid: candidate.selectedVariantCjVid,
      selectedVariantCjSku: candidate.selectedVariantCjSku,
      pricingBreakdown: candidate.pricingBreakdown || null,
      shipping: candidate.shipping || null,
    };

    try {
      const importDraft = await apiRequest<JsonRecord>({
        token,
        method: 'POST',
        pathname: '/api/cj-shopify-usa/discover/import-draft',
        body: {
          cjProductId: candidate.cjProductId,
          variantCjVid: candidate.selectedVariantCjVid || undefined,
          quantity: 1,
          destPostalCode: DEST_POSTAL_CODE,
        },
      });
      attempt.importDraft = importDraft.data;

      const listingId = Number(((importDraft.data as JsonRecord).listing as JsonRecord)?.id);
      if (!Number.isFinite(listingId) || listingId <= 0) {
        throw new Error('Import draft succeeded but no valid listing.id was returned.');
      }

      const publish = await apiRequest<JsonRecord>({
        token,
        method: 'POST',
        pathname: '/api/cj-shopify-usa/listings/publish',
        body: { listingId },
      });
      attempt.publish = publish.data;

      chosenCandidate = candidate;
      importDraftResult = importDraft.data;
      publishResult = publish.data;
      importPublishAttempts.push(attempt);
      break;
    } catch (error) {
      attempt.error = summarizeError(error);
      importPublishAttempts.push(attempt);
      await sleep(1250);
    }
  }

  output.importPublishAttempts = importPublishAttempts;
  output.chosenCandidate = chosenCandidate;
  output.importDraftResult = importDraftResult;
  output.publishResult = publishResult;

  const listingsAfter = await apiRequest<JsonRecord>({
    token,
    pathname: '/api/cj-shopify-usa/listings',
  });
  const productsAfter = await apiRequest<JsonRecord>({
    token,
    pathname: '/api/cj-shopify-usa/products',
  });
  const ordersSync = await apiRequest<JsonRecord>({
    token,
    method: 'POST',
    pathname: '/api/cj-shopify-usa/orders/sync',
    body: { sinceHours: 24, first: 50 },
  });
  const ordersAfter = await apiRequest<JsonRecord>({
    token,
    pathname: '/api/cj-shopify-usa/orders',
  });
  const logsAfter = await apiRequest<JsonRecord>({
    token,
    pathname: '/api/cj-shopify-usa/logs',
    query: { limit: 25 },
  });

  output.listingsAfter = listingsAfter.data;
  output.productsAfter = productsAfter.data;
  output.ordersSync = ordersSync.data;
  output.ordersAfter = ordersAfter.data;
  output.logsAfter = logsAfter.data;

  if (chosenCandidate && publishResult) {
    const authData = authTest.data as JsonRecord;
    const shopData = (authData.shopData as JsonRecord) || {};
    const primaryDomainUrl = safeString(shopData.primaryDomainUrl) || `https://${safeString(authData.shopDomain) || ''}`;
    const publishListing = (publishResult.listing as JsonRecord) || {};
    const handle = safeString(publishListing.shopifyHandle);
    const productId = safeString(publishListing.shopifyProductId);
    const variantId = safeString(publishListing.shopifyVariantId);
    const storefrontUrl = handle ? new URL(`/products/${handle}`, primaryDomainUrl).toString() : null;

    let storefrontCheck: JsonRecord = {
      storefrontUrl,
      shopifyProductId: productId,
      shopifyVariantId: variantId,
      passwordGate: null,
    };

    if (storefrontUrl) {
      const response = await fetch(storefrontUrl, { redirect: 'follow' });
      const html = await response.text();
      const finalUrl = response.url;
      const markers = [
        'Enter store using password',
        '/password',
        'Opening soon',
        'store using password',
      ].filter((marker) => html.includes(marker) || finalUrl.includes(marker));
      storefrontCheck = {
        ...storefrontCheck,
        status: response.status,
        finalUrl,
        passwordGate: finalUrl.includes('/password') || markers.length > 0,
        markers,
        htmlSnippet: html.replace(/\s+/g, ' ').slice(0, 280),
      };
    }

    output.storefrontCheck = storefrontCheck;
  }

  output.finishedAt = new Date().toISOString();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`[cj-shopify-usa-live-validation] wrote ${OUTPUT_PATH}`);
  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        chosenCandidate: output.chosenCandidate,
        publishResult: output.publishResult,
        storefrontCheck: output.storefrontCheck,
      },
      null,
      2,
    ),
  );
}

void main().catch(async (error) => {
  const failure = {
    failedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    message: summarizeError(error),
  };
  try {
    await writeFile(OUTPUT_PATH, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  } catch {
    // Best effort only.
  }
  console.error('[cj-shopify-usa-live-validation] failed:', failure.message);
  process.exit(1);
});
