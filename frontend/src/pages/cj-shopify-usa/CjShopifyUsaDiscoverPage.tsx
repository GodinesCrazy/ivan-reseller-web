import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';
import { Search, Package, Loader2, AlertCircle, ChevronDown, ChevronUp, ArrowRight, CheckCircle2 } from 'lucide-react';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(n: number | null | undefined): string {
  if (n == null || n === 0) return '$0.00';
  return `$${Number(n).toFixed(2)}`;
}

function extractApiError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as Record<string, unknown> | undefined;
    if (typeof data?.error === 'string') return data.error;
    if (e.response?.status === 404) return 'Módulo no disponible o desactivado.';
    if (e.response?.status === 503) return 'CJ API temporalmente no disponible.';
  }
  if (e instanceof Error) return e.message;
  return 'Error desconocido.';
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
}: {
  product: SearchResult;
  onDrafted: (result: DraftResult) => void;
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
      setCardState({ kind: 'eval_error', msg: extractApiError(e) });
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
        setCardState({ kind: 'eval_error', msg: extractApiError(e) });
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
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
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
            disabled={isEvaluating}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
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
            disabled={isDrafting || isDrafted || isRejected}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50"
            title={isRejected ? 'Producto rechazado por pricing. Ajusta configuración o elige otro producto.' : undefined}
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

export default function CjShopifyUsaDiscoverPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [searchState, setSearchState] = useState<SearchState>({ kind: 'idle' });
  const [lastDraft, setLastDraft] = useState<DraftResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Descubrir Productos</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Busca en el catálogo CJ, evalúa márgenes y crea drafts para Shopify USA.
          </p>
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
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Buscar en catálogo CJ (ej. wireless earbuds, phone case…)"
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
      </form>

      {/* States */}

      {searchState.kind === 'idle' && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-14 flex flex-col items-center gap-3 text-center">
          <Search className="w-8 h-8 text-slate-300 dark:text-slate-600" />
          <div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Ingresa un término de búsqueda</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">
              Busca por categoría, producto o keyword. Los resultados muestran stock e inventario de CJ en tiempo real.
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {searchState.items.length} resultados para "{searchState.keyword}"
              {searchState.page > 1 && ` · página ${searchState.page}`}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {searchState.items.map((product) => (
              <ProductCard key={product.cjProductId} product={product} onDrafted={handleDrafted} />
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
