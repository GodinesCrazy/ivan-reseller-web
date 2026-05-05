import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';
import {
  Search,
  Package,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CheckCircle2,
  Brain,
  Tags,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type SearchResult = {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  listPriceUsd?: number;
  inventoryTotal?: number;
  fulfillmentOrigin?: 'US' | 'CN' | 'UNKNOWN';
};

type ShippingInfo = {
  amountUsd: number;
  method?: string;
  estimatedDays: number | null;
  fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN';
  confidence: string;
};

type Breakdown = {
  supplierCostUsd: number;
  shippingCostUsd: number;
  totalCostUsd: number;
  paymentProcessingFeeUsd: number;
  targetProfitUsd: number;
  suggestedSellPriceUsd: number;
};

type EvaluationResult = {
  cjProductId: string;
  title: string;
  imageUrls: string[];
  variants: Array<{ cjSku: string; cjVid?: string; unitCostUsd: number; stock: number; attributes: Record<string, string> }>;
  shipping: ShippingInfo | null;
  qualification: { decision: string; reasons?: string[]; breakdown: Breakdown } | null;
  shippingError?: string;
};

type DraftResult = {
  dbProductId: number;
  listing: { id: number; status: string; listedPriceUsd: number | null; shopifySku: string | null };
};

type AiSuggestionItem = {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  keyword: string;
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN';
  stock: number;
  shippingUsd: number;
  suggestedSellPriceUsd: number;
  netMarginPct: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(n: number | null | undefined): string {
  if (n == null || n === 0) return '$0.00';
  return `$${Number(n).toFixed(2)}`;
}

type ApiErrorInfo = {
  message: string;
  status?: number;
  code?: string;
  retryAfterSeconds?: number;
};

function extractApiErrorInfo(e: unknown): ApiErrorInfo {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as Record<string, unknown> | undefined;
    const details = data?.details && typeof data.details === 'object' ? data.details as Record<string, unknown> : undefined;
    const retryAfterSeconds =
      typeof details?.retryAfterSeconds === 'number'
        ? details.retryAfterSeconds
        : typeof data?.retryAfterSeconds === 'number'
        ? data.retryAfterSeconds
        : undefined;
    const code =
      typeof data?.errorCode === 'string'
        ? data.errorCode
        : typeof data?.code === 'string'
        ? data.code
        : typeof details?.code === 'string'
        ? details.code
        : undefined;
    if (e.response?.status === 429 || code === 'API_RATE_LIMIT' || code === 'CJ_RATE_LIMIT') {
      return {
        message: typeof data?.error === 'string'
          ? data.error
          : 'CJ esta limitando temporalmente las solicitudes. Espera cerca de 1 minuto antes de evaluar mas productos.',
        status: e.response?.status,
        code,
        retryAfterSeconds: retryAfterSeconds ?? 60,
      };
    }
    if (typeof data?.error === 'string') return { message: data.error, status: e.response?.status, code };
    if (e.response?.status === 404) return { message: 'Módulo no disponible o desactivado.', status: 404, code };
    if (e.response?.status === 503) return { message: 'CJ API temporalmente no disponible.', status: 503, code };
  }
  if (e instanceof Error) return { message: e.message };
  return { message: 'Error desconocido.' };
}

function extractApiError(e: unknown): string {
  return extractApiErrorInfo(e).message;
}

function OriginBadge({ origin }: { origin?: 'US' | 'CN' | 'UNKNOWN' }) {
  if (!origin || origin === 'UNKNOWN') return null;
  const cls =
    origin === 'US'
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${cls}`}>
      {origin === 'US' ? '🇺🇸 US Stock' : '🇨🇳 China'}
    </span>
  );
}

function PricingBreakdown({ b, decision }: { b: Breakdown; decision: string }) {
  const decisionCls =
    decision === 'APPROVED'
      ? 'text-emerald-600 dark:text-emerald-400'
      : decision === 'REJECTED'
      ? 'text-red-500 dark:text-red-400'
      : 'text-amber-500 dark:text-amber-400';

  const rows: [string, string][] = [
    ['Costo CJ', usd(b.supplierCostUsd)],
    ['Envío estimado', usd(b.shippingCostUsd)],
    ['Total costo', usd(b.totalCostUsd)],
    ['Fee pago (~5.4%)', usd(b.paymentProcessingFeeUsd)],
    ['Profit objetivo', usd(b.targetProfitUsd)],
  ];

  return (
    <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
          <span>{label}</span>
          <span className="tabular-nums font-medium">{value}</span>
        </div>
      ))}
      <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex justify-between text-sm font-semibold">
        <span>Precio sugerido</span>
        <span className={`tabular-nums ${decisionCls}`}>{usd(b.suggestedSellPriceUsd)}</span>
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        <span className={`text-xs font-semibold uppercase ${decisionCls}`}>
          {decision === 'APPROVED' ? '✓ Aprobado' : decision === 'REJECTED' ? '✗ Rechazado' : decision}
        </span>
      </div>
    </div>
  );
}

function QualificationReasons({ reasons }: { reasons?: string[] }) {
  if (!reasons || reasons.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {reasons.slice(0, 3).map((reason, idx) => (
        <p
          key={`${reason}-${idx}`}
          className="text-[11px] leading-4 text-red-600 dark:text-red-400"
        >
          {reason}
        </p>
      ))}
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

type CardState =
  | { kind: 'idle' }
  | { kind: 'evaluating' }
  | { kind: 'evaluated'; data: EvaluationResult }
  | { kind: 'eval_error'; msg: string }
  | { kind: 'drafting' }
  | { kind: 'drafted'; result: DraftResult }
  | { kind: 'draft_error'; msg: string };

function ProductCard({
  product,
  onDrafted,
  rateLimitUntil,
  onRateLimited,
}: {
  product: SearchResult;
  onDrafted: (result: DraftResult) => void;
  rateLimitUntil: number | null;
  onRateLimited: (retryAfterSeconds?: number) => void;
}) {
  const [cardState, setCardState] = useState<CardState>({ kind: 'idle' });
  const [showEval, setShowEval] = useState(false);

  async function handleEvaluate() {
    if (cardState.kind === 'evaluated') {
      setShowEval((v) => !v);
      return;
    }
    setCardState({ kind: 'evaluating' });
    setShowEval(true);
    try {
      const res = await api.post('/api/cj-shopify-usa/discover/evaluate', {
        cjProductId: product.cjProductId,
        quantity: 1,
      });
      setCardState({ kind: 'evaluated', data: res.data as EvaluationResult });
    } catch (e) {
      const apiError = extractApiErrorInfo(e);
      if (apiError.status === 429 || apiError.code === 'API_RATE_LIMIT' || apiError.code === 'CJ_RATE_LIMIT') {
        onRateLimited(apiError.retryAfterSeconds);
      }
      setCardState({ kind: 'eval_error', msg: apiError.message });
    }
  }

  async function handleCreateDraft() {
    let evaluation: EvaluationResult | null = null;
    if (cardState.kind === 'evaluated') {
      evaluation = cardState.data;
    } else {
      setCardState({ kind: 'evaluating' });
      setShowEval(true);
      try {
        const evalRes = await api.post('/api/cj-shopify-usa/discover/evaluate', {
          cjProductId: product.cjProductId,
          quantity: 1,
        });
        evaluation = evalRes.data as EvaluationResult;
        setCardState({ kind: 'evaluated', data: evaluation });
      } catch (e) {
        const apiError = extractApiErrorInfo(e);
        if (apiError.status === 429 || apiError.code === 'API_RATE_LIMIT' || apiError.code === 'CJ_RATE_LIMIT') {
          onRateLimited(apiError.retryAfterSeconds);
        }
        setCardState({ kind: 'eval_error', msg: apiError.message });
        return;
      }
    }

    if (evaluation?.qualification?.decision === 'REJECTED') {
      setCardState({
        kind: 'draft_error',
        msg: 'Producto rechazado por pricing/stock. Revisa el detalle de evaluación antes de crear draft.',
      });
      return;
    }

    setCardState({ kind: 'drafting' });
    try {
      const res = await api.post('/api/cj-shopify-usa/discover/import-draft', {
        cjProductId: product.cjProductId,
        quantity: 1,
      });
      const result = res.data as DraftResult;
      setCardState({ kind: 'drafted', result });
      onDrafted(result);
    } catch (e) {
      setCardState({ kind: 'draft_error', msg: extractApiError(e) });
    }
  }

  const evalData = cardState.kind === 'evaluated' ? cardState.data : null;
  const isRejected = evalData?.qualification?.decision === 'REJECTED';
  const isDrafted = cardState.kind === 'drafted';
  const isDrafting = cardState.kind === 'drafting';
  const isEvaluating = cardState.kind === 'evaluating';
  const isRateLimited = Boolean(rateLimitUntil && rateLimitUntil > Date.now());

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
      {/* Image */}
      <div className="h-36 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
        {product.mainImageUrl ? (
          <img
            src={product.mainImageUrl}
            alt={product.title}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Package className="w-10 h-10 text-slate-300 dark:text-slate-600" />
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start gap-2">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-2 flex-1">{product.title}</p>
          <OriginBadge origin={product.fulfillmentOrigin} />
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {product.listPriceUsd != null && (
            <span className="font-semibold text-slate-700 dark:text-slate-300">{usd(product.listPriceUsd)}</span>
          )}
          {product.inventoryTotal != null && (
            <span className={product.inventoryTotal === 0 ? 'text-red-400' : ''}>
              {product.inventoryTotal === 0 ? 'Sin stock' : `Stock: ${product.inventoryTotal}`}
            </span>
          )}
          {product.inventoryTotal === undefined && <span className="text-slate-400">Stock: —</span>}
        </div>

        {/* Evaluation panel */}
        {showEval && (
          <div>
            {isEvaluating && (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Obteniendo detalle y cotización de envío…
              </div>
            )}
            {cardState.kind === 'eval_error' && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                {cardState.msg}
              </div>
            )}
            {evalData?.qualification && (
              <>
                <PricingBreakdown b={evalData.qualification.breakdown} decision={evalData.qualification.decision} />
                <QualificationReasons reasons={evalData.qualification.reasons} />
              </>
            )}
            {evalData && !evalData.qualification && (
              <div className="text-xs text-slate-500 py-2">
                Sin datos de costo suficientes para evaluar este producto.
                {evalData.shippingError && <p className="text-amber-500 mt-1">Envío: {evalData.shippingError}</p>}
              </div>
            )}
            {evalData?.shipping && (
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span>Envío:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{usd(evalData.shipping.amountUsd)}</span>
                {evalData.shipping.method && <span>· {evalData.shipping.method}</span>}
                {evalData.shipping.estimatedDays && <span>· ~{evalData.shipping.estimatedDays}d</span>}
                <OriginBadge origin={evalData.shipping.fulfillmentOrigin} />
              </div>
            )}
          </div>
        )}

        {/* Draft success */}
        {isDrafted && cardState.kind === 'drafted' && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Draft creado (Listing #{cardState.result.listing.id} · {usd(cardState.result.listing.listedPriceUsd)})
          </div>
        )}
        {cardState.kind === 'draft_error' && (
          <div className="text-xs text-red-500 dark:text-red-400">{cardState.msg}</div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-auto pt-1">
          <button
            onClick={handleEvaluate}
            disabled={isEvaluating || isRateLimited}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
            title={isRateLimited ? 'CJ pidio una pausa temporal. Reintenta en cerca de 1 minuto.' : undefined}
          >
            {isEvaluating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : showEval && evalData ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            Evaluar
          </button>

          <button
            onClick={handleCreateDraft}
            disabled={isDrafting || isDrafted || isRejected || isRateLimited}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50"
            title={
              isRateLimited
                ? 'CJ pidio una pausa temporal. Reintenta en cerca de 1 minuto.'
                : isRejected
                ? 'Producto rechazado por pricing. Ajusta configuración o elige otro producto.'
                : undefined
            }
          >
            {isDrafting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {isDrafted ? '✓ Draft creado' : isDrafting ? 'Creando…' : 'Crear Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'results'; items: SearchResult[]; keyword: string; page: number; hasMore: boolean }
  | { kind: 'no_results'; keyword: string }
  | { kind: 'error'; msg: string };

const CATEGORY_PRESETS = [
  { id: 'pets', label: '🐾 Pets (Default)', keyword: 'pet supplies', hint: 'Pet supplies, accessories and essentials — store default' },
  { id: 'pet-dogs', label: 'Dogs', keyword: 'dog accessories', hint: 'Dog collars, leashes, toys and care' },
  { id: 'pet-cats', label: 'Cats', keyword: 'cat accessories', hint: 'Cat trees, toys, litter boxes and care' },
  { id: 'pet-grooming', label: 'Pet Grooming', keyword: 'pet grooming brush', hint: 'Brushes, shampoos, nail clippers and grooming tools' },
  { id: 'pet-toys', label: 'Pet Toys', keyword: 'dog toys', hint: 'Interactive toys, chew toys and enrichment' },
  { id: 'pet-feeding', label: 'Pet Feeding', keyword: 'pet food bowl', hint: 'Bowls, feeders, fountains and storage' },
  { id: 'pet-beds', label: 'Beds & Comfort', keyword: 'pet bed', hint: 'Dog beds, cat beds and cozy mats' },
  { id: 'pet-travel', label: 'Pet Travel', keyword: 'pet carrier', hint: 'Carriers, travel crates and car accessories' },
  { id: 'power', label: 'Power & Charging', keyword: 'power bank', hint: 'Baterias, cargadores y energia portatil' },
  { id: 'phones', label: 'Phones', keyword: 'phone holder', hint: 'Accesorios y soporte para celular' },
  { id: 'workspace', label: 'Workspace', keyword: 'desk organizer', hint: 'Organizacion y accesorios de escritorio' },
  { id: 'travel', label: 'Travel', keyword: 'travel organizer', hint: 'Bolsos y accesorios de viaje' },
  { id: 'beauty', label: 'Beauty', keyword: 'lipstick organizer', hint: 'Beauty, makeup y organizadores' },
  { id: 'kitchen', label: 'Home & Kitchen', keyword: 'kitchen organizer', hint: 'Hogar, cocina y orden' },
  { id: 'electronics', label: 'Electronics', keyword: 'wireless earbuds', hint: 'Gadgets y audio populares en CJ' },
] as const;

export default function CjShopifyUsaDiscoverPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('pet supplies');
  const [searchState, setSearchState] = useState<SearchState>({ kind: 'idle' });
  const [lastDraft, setLastDraft] = useState<DraftResult | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestionItem[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMeta, setAiMeta] = useState<{ totalAnalyzed: number; generatedAt: string } | null>(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [cjRateLimitUntil, setCjRateLimitUntil] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cjRateLimitUntil) return;
    const delayMs = Math.max(0, cjRateLimitUntil - Date.now());
    const timeout = window.setTimeout(() => setCjRateLimitUntil(null), delayMs);
    return () => window.clearTimeout(timeout);
  }, [cjRateLimitUntil]);

  function handleCjRateLimit(retryAfterSeconds = 60) {
    setCjRateLimitUntil(Date.now() + Math.max(15, retryAfterSeconds) * 1000);
  }

  async function doSearch(kw: string, page: number) {
    const trimmed = kw.trim();
    if (!trimmed) return;
    setSearchState({ kind: 'loading' });
    try {
      const res = await api.get('/api/cj-shopify-usa/discover/search', {
        params: { keyword: trimmed, page, pageSize: 20 },
      });
      const data = res.data as { results: SearchResult[]; count: number; page: number; pageSize: number };
      if (!data.results || data.results.length === 0) {
        setSearchState({ kind: 'no_results', keyword: trimmed });
      } else {
        setSearchState({
          kind: 'results',
          items: data.results,
          keyword: trimmed,
          page,
          hasMore: data.results.length >= 20,
        });
      }
    } catch (e) {
      setSearchState({ kind: 'error', msg: extractApiError(e) });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(keyword, 1);
  }

  function handleDrafted(result: DraftResult) {
    setLastDraft(result);
  }

  function handleCategorySearch(categoryKeyword: string) {
    setKeyword(categoryKeyword);
    setCategoryMenuOpen(false);
    doSearch(categoryKeyword, 1);
  }

  async function handleAiSuggestions() {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await api.post('/api/cj-shopify-usa/discover/ai-suggestions', {
        count: 6,
      });
      const payload = res.data as { suggestions?: AiSuggestionItem[]; totalAnalyzed?: number; generatedAt?: string };
      setAiSuggestions(payload.suggestions ?? []);
      setAiMeta({
        totalAnalyzed: Number(payload.totalAnalyzed ?? 0),
        generatedAt: String(payload.generatedAt ?? new Date().toISOString()),
      });
      if (!payload.suggestions || payload.suggestions.length === 0) {
        setAiError('No se encontraron sugerencias sólidas con los filtros operativos actuales.');
      }
    } catch (e) {
      setAiError(`No se pudo generar sugerencias IA: ${extractApiError(e)}`);
      setAiSuggestions([]);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Descubrir Productos</h2>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">🐾 Pet Store</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Busca en el catálogo CJ para Shopify USA. <span className="text-amber-600 dark:text-amber-400 font-medium">PET</span> preseleccionado por defecto — puedes buscar cualquier otro nicho.
            </p>
          </div>
        </div>
        {lastDraft && (
          <button
            onClick={() => navigate('/cj-shopify-usa/listings')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
            Ver Listings <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Draft success banner */}
      {lastDraft && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>
              Draft creado: Listing #{lastDraft.listing.id} · precio sugerido {usd(lastDraft.listing.listedPriceUsd)}.
              Publícalo desde la pantalla <strong>Store Products</strong>.
            </span>
          </div>
          <button
            onClick={() => setLastDraft(null)}
            className="text-emerald-500 hover:text-emerald-700 text-lg leading-none ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-stretch">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Buscar en catálogo CJ (ej. pet bed, dog collar, cat toy…)"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
          />
        </div>
        <button
          type="submit"
          disabled={searchState.kind === 'loading' || !keyword.trim()}
          className="px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {searchState.kind === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setCategoryMenuOpen((value) => !value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
          >
            <Tags className="w-4 h-4" />
            Categorias CJ
            {categoryMenuOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {categoryMenuOpen && (
            <div className="absolute right-0 top-full mt-2 z-20 w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2">
              <div className="px-2 py-1.5">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Buscar por categoria</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  🐾 PET es el nicho por defecto. Todas las categorías siguen disponibles.
                </p>
              </div>
              <div className="space-y-1">
                {CATEGORY_PRESETS.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleCategorySearch(category.keyword)}
                    className="w-full text-left rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{category.label}</span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">{category.keyword}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{category.hint}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleAiSuggestions}
          disabled={aiLoading}
          className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          Sugerencia IA
        </button>
      </form>

      {(aiLoading || aiError || aiSuggestions.length > 0) && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Sugerencias IA para Shopify USA
              </p>
              {aiMeta && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Analizados: {aiMeta.totalAnalyzed} · actualizado {new Date(aiMeta.generatedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          {aiLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Analizando catálogo CJ con motor de score de venta potencial...
            </div>
          )}

          {aiError && (
            <div className="text-xs text-red-600 dark:text-red-400">{aiError}</div>
          )}

          {aiSuggestions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {aiSuggestions.map((item) => (
                <div
                  key={item.cjProductId}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/40"
                >
                  <div className="flex items-start gap-2">
                    {item.mainImageUrl ? (
                      <img src={item.mainImageUrl} alt={item.title} className="w-12 h-12 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] text-slate-500">
                        Sin img
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 line-clamp-2">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Score {item.score} · {item.confidence}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                    <p>Keyword: {item.keyword}</p>
                    <p>Margen: {item.netMarginPct.toFixed(1)}% · Envío: ${item.shippingUsd.toFixed(2)}</p>
                    <p>Precio sugerido: ${item.suggestedSellPriceUsd.toFixed(2)} · Stock: {item.stock}</p>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">{item.reason}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setKeyword(item.keyword);
                      doSearch(item.keyword, 1);
                    }}
                    className="mt-2 w-full text-xs px-2 py-1.5 rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90"
                  >
                    Buscar similares
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* States */}

      {searchState.kind === 'idle' && (
        <div className="rounded-xl border border-dashed border-amber-200 dark:border-amber-800/40 py-14 flex flex-col items-center gap-3 text-center bg-amber-50/30 dark:bg-amber-900/5">
          <span className="text-4xl">🐾</span>
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Pet Store — busca productos para mascotas</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">
              Keyword <strong className="text-amber-600 dark:text-amber-400">pet supplies</strong> preseleccionado. Presiona Buscar o elige otra categoría.
            </p>
          </div>
        </div>
      )}

      {searchState.kind === 'loading' && (
        <div className="flex items-center justify-center py-14 gap-3 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Buscando en catálogo CJ…
        </div>
      )}

      {searchState.kind === 'error' && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Error al buscar en CJ</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{searchState.msg}</p>
            <button
              onClick={() => doSearch(keyword, 1)}
              className="mt-2 text-xs text-red-600 dark:text-red-400 underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {searchState.kind === 'no_results' && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-14 flex flex-col items-center gap-3 text-center">
          <Package className="w-8 h-8 text-slate-300 dark:text-slate-600" />
          <div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Sin resultados para "{searchState.keyword}"
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Prueba con otro término o en inglés.</p>
          </div>
        </div>
      )}

      {searchState.kind === 'results' && (
        <div className="space-y-4">
          {cjRateLimitUntil && cjRateLimitUntil > Date.now() && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">CJ pidio una pausa temporal</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Se bloquearon nuevas evaluaciones por cerca de 1 minuto para evitar mas rate limits. Puedes seguir revisando resultados y volver a intentar en breve.
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {searchState.items.length} resultados para "{searchState.keyword}"
              {searchState.page > 1 && ` · página ${searchState.page}`}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {searchState.items.map((product) => (
              <ProductCard
                key={product.cjProductId}
                product={product}
                onDrafted={handleDrafted}
                rateLimitUntil={cjRateLimitUntil}
                onRateLimited={handleCjRateLimit}
              />
            ))}
          </div>

          {searchState.hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => doSearch(searchState.keyword, searchState.page + 1)}
                className="px-4 py-2 text-sm text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              >
                Cargar más resultados
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
