import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Brain, CheckCircle2, ChevronDown, ChevronUp, Loader2, Package, Search, ShieldCheck, Tags } from 'lucide-react';
import { api } from '@/services/api';

type CjProductSummary = {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  listPriceUsd?: number;
  inventoryTotal?: number;
  operabilityStatus?: 'operable' | 'stock_unknown' | 'unavailable';
  fulfillmentOrigin?: 'US' | 'CN' | 'UNKNOWN';
};

type SearchResponse = {
  ok: boolean;
  items: CjProductSummary[];
  warehouseAwareEnabled?: boolean;
  stockCoverage?: { withStock: number; unknownStock: number; zeroStock: number };
  operabilitySummary?: { operable: number; stockUnknown: number; unavailable: number };
  warehouseSummary?: {
    usWarehouseConfirmed?: number;
    cnWarehouse?: number;
    originUnknown?: number;
    probeLimit?: number;
  };
};

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'results'; items: CjProductSummary[]; keyword: string; meta: SearchResponse }
  | { kind: 'no_results'; keyword: string }
  | { kind: 'error'; msg: string };

export type DataSourceType = 'REAL' | 'ESTIMATED' | 'HYBRID' | 'MOCK';
export type RecommendationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type StarterSuitability = 'GOOD_FOR_STARTER' | 'CAUTION_FOR_STARTER' | 'NOT_RECOMMENDED_FOR_STARTER';

export type CandidateItem = {
  id: string;
  runId: string;
  seedKeyword: string;
  seedSource: string;
  cjProductId: string;
  cjProductTitle: string;
  cjVariantSku: string;
  images: string[];
  supplierCostUsd: number;
  shippingUsd: number;
  shippingConfidence: string;
  shippingDaysMin?: number;
  shippingDaysMax?: number;
  stockCount?: number;
  marketObservedPriceUsd?: number;
  pricing: {
    supplierCostUsd: number;
    shippingUsd: number;
    ebayFeeUsd: number;
    paymentFeeUsd: number;
    incidentBufferUsd: number;
    totalCostUsd: number;
    suggestedPriceUsd: number;
    floorPriceUsd: number;
    netProfitUsd: number;
    netMarginPct: number | null;
    marketObservedPriceUsd: number | null;
    competitivenessDeltaPct: number | null;
  };
  score: {
    demandScore: number;
    marginScore: number;
    competitivenessScore: number;
    shippingConfidenceScore: number;
    simplicityScore: number;
    accountRiskScore: number;
    supplierReliabilityScore: number;
    totalScore: number;
    reasons: string[];
    starterFlags: string[];
    starterPenaltyApplied: boolean;
  };
  recommendationReason: string;
  status: string;
  reviewNotes?: string;
  trendSourceType?: DataSourceType;
  marketPriceSourceType?: DataSourceType;
  dataConfidenceScore?: number;
  recommendationConfidence?: RecommendationConfidence;
  starterSuitability?: StarterSuitability;
  evidenceSummary?: string;
  marketPriceDetail?: {
    observedMinPrice: number | null;
    observedMedianPrice: number | null;
    observedMaxPrice: number | null;
    observedTypicalPrice: number | null;
    observedPriceConfidence: number;
    marketSource: DataSourceType;
    evidenceSummary: string;
    listingCount: number;
  };
};

const CATEGORY_PRESETS = [
  { id: 'pets', label: 'Pets (Default)', keyword: 'pet supplies', hint: 'Pet supplies, accesorios y esenciales para eBay USA' },
  { id: 'pet-dogs', label: 'Dogs', keyword: 'dog accessories', hint: 'Collares, correas, grooming y accesorios caninos' },
  { id: 'pet-cats', label: 'Cats', keyword: 'cat accessories', hint: 'Juguetes, fuentes, cuidado y accesorios felinos' },
  { id: 'pet-grooming', label: 'Pet Grooming', keyword: 'pet grooming brush', hint: 'Cepillos, cortaunas, shampoo y cuidado' },
  { id: 'pet-toys', label: 'Pet Toys', keyword: 'interactive pet toy', hint: 'Juguetes interactivos y enriquecimiento' },
  { id: 'pet-feeding', label: 'Pet Feeding', keyword: 'pet food bowl', hint: 'Bowls, feeders, fuentes y almacenamiento' },
  { id: 'pet-travel', label: 'Pet Travel', keyword: 'pet carrier', hint: 'Carriers, arneses de auto y viaje' },
  { id: 'pet-cleaning', label: 'Cleaning', keyword: 'pet hair remover', hint: 'Removedores de pelo y limpieza del hogar' },
] as const;

function apiError(e: unknown, fallback = 'Error inesperado.'): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const data = e.response.data as { message?: string; error?: string; cjMessage?: string };
    return data.message || data.cjMessage || data.error || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

function usd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function productStatus(item: CjProductSummary): 'ready' | 'check' | 'blocked' {
  if (item.fulfillmentOrigin === 'US' && (item.inventoryTotal ?? 0) > 0) return 'ready';
  if (item.operabilityStatus === 'unavailable' || item.inventoryTotal === 0 || item.fulfillmentOrigin === 'CN') return 'blocked';
  return 'check';
}

function OriginBadge({ item }: { item: CjProductSummary }) {
  const status = productStatus(item);
  if (status === 'ready') {
    return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">USA stock confirmado</span>;
  }
  if (status === 'blocked') {
    return <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-300">No publicable automatico</span>;
  }
  return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-200">Requiere cotizacion USA</span>;
}

function ProductCard({ item }: { item: CjProductSummary }) {
  const navigate = useNavigate();
  const status = productStatus(item);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
      <div className="flex gap-3 p-3">
        {item.mainImageUrl ? (
          <img src={item.mainImageUrl} alt={item.title} className="h-20 w-20 flex-shrink-0 rounded-lg border border-slate-800 object-cover" />
        ) : (
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-500">Sin img</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-100">{item.title}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <OriginBadge item={item} />
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">Stock {item.inventoryTotal ?? 'por confirmar'}</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span>CJ: {usd(item.listPriceUsd)}</span>
            <span className="mx-2 text-slate-700">|</span>
            <span>Origen: {item.fulfillmentOrigin ?? 'UNKNOWN'}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2">
        <span className={`text-[11px] font-semibold ${status === 'ready' ? 'text-emerald-300' : status === 'blocked' ? 'text-rose-300' : 'text-amber-200'}`}>
          {status === 'ready' ? 'Listo para evaluar en eBay' : status === 'blocked' ? 'Bloqueado por guardrail' : 'Primero validar variante/flete'}
        </span>
        <button
          type="button"
          onClick={() => navigate(`/cj-ebay/products?productId=${encodeURIComponent(item.cjProductId)}&keyword=${encodeURIComponent(item.title || 'pet supplies')}`)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
        >
          Evaluar <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function CjEbayOpportunityPage() {
  const [keyword, setKeyword] = useState('pet supplies');
  const [searchState, setSearchState] = useState<SearchState>({ kind: 'idle' });
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  async function doSearch(nextKeyword: string) {
    const trimmed = nextKeyword.trim();
    if (!trimmed) return;
    setSearchState({ kind: 'loading' });
    try {
      const res = await api.post<SearchResponse>('/api/cj-ebay/cj/search', {
        keyword: trimmed,
        page: 1,
        pageSize: 20,
      });
      const items = res.data?.items ?? [];
      if (!items.length) setSearchState({ kind: 'no_results', keyword: trimmed });
      else setSearchState({ kind: 'results', items, keyword: trimmed, meta: res.data });
    } catch (e) {
      setSearchState({ kind: 'error', msg: apiError(e, 'No se pudo buscar en CJ.') });
    }
  }

  async function runAiSuggestion() {
    setAiLoading(true);
    try {
      await api.post('/api/cj-ebay/opportunities/discover', { mode: 'STARTER' });
      await doSearch(keyword || 'pet supplies');
    } catch (e) {
      setSearchState({ kind: 'error', msg: apiError(e, 'No se pudo iniciar sugerencia IA eBay.') });
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-100">Descubrir Productos</h2>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">Pet Store</span>
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300">eBay USA</span>
          </div>
          <p className="mt-0.5 text-sm text-slate-400">
            Busca en el catalogo CJ para eBay USA. <span className="font-medium text-amber-300">PET</span> queda preseleccionado por defecto y el ciclo exige warehouse USA antes de publicar.
          </p>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void doSearch(keyword);
        }}
        className="flex flex-wrap items-stretch gap-2"
      >
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Buscar en catalogo CJ (ej. pet bed, dog collar, cat toy...)"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-9 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <button
          type="submit"
          disabled={searchState.kind === 'loading' || !keyword.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {searchState.kind === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setCategoryMenuOpen((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <Tags className="h-4 w-4" />
            Categorias CJ
            {categoryMenuOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {categoryMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl">
              <div className="px-2 py-1.5">
                <p className="text-xs font-semibold text-slate-100">Buscar por categoria PET</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Puedes buscar otro nicho, pero PET es el modo recomendado para este ciclo.</p>
              </div>
              {CATEGORY_PRESETS.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setKeyword(category.keyword);
                    setCategoryMenuOpen(false);
                    void doSearch(category.keyword);
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-100">{category.label}</span>
                    <span className="text-[11px] text-slate-500">{category.keyword}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{category.hint}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void runAiSuggestion()}
          disabled={aiLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          Sugerencia IA
        </button>
      </form>

      <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
          <span>
            Guardrail activo: el publicador eBay solo debe avanzar con productos PET que tengan inventario operativo y cotizacion CJ con origen USA. Los productos CN o sin evidencia quedan para revision, no para autopublicacion.
          </span>
        </div>
      </div>

      {searchState.kind === 'idle' && (
        <div className="relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed border-amber-800/40 bg-gradient-to-br from-amber-950/20 to-orange-950/10 py-16 text-center">
          <Package className="h-10 w-10 text-amber-300" />
          <div>
            <p className="text-base font-semibold text-slate-100">Descubre tu proximo producto PET para eBay</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-400">
              Keyword <strong className="text-amber-300">pet supplies</strong> preseleccionado. Presiona Buscar o elige una categoria PET.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void doSearch('pet supplies')}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-950/40"
          >
            Buscar Pet Supplies
          </button>
        </div>
      )}

      {searchState.kind === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-14 text-sm text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Buscando en catalogo CJ y priorizando stock USA...
        </div>
      )}

      {searchState.kind === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-900 bg-rose-950/30 px-4 py-4 text-rose-100">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold">Error al buscar en CJ</p>
            <p className="mt-1 text-xs text-rose-200">{searchState.msg}</p>
          </div>
        </div>
      )}

      {searchState.kind === 'no_results' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-800 py-14 text-center">
          <Package className="h-8 w-8 text-slate-600" />
          <div>
            <p className="text-sm font-medium text-slate-300">Sin resultados para "{searchState.keyword}"</p>
            <p className="mt-1 text-xs text-slate-500">Prueba otro termino PET en ingles.</p>
          </div>
        </div>
      )}

      {searchState.kind === 'results' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Resultados CJ" value={searchState.items.length} />
            <Metric label="Operables" value={searchState.meta.operabilitySummary?.operable ?? 0} />
            <Metric label="USA confirmado" value={searchState.meta.warehouseSummary?.usWarehouseConfirmed ?? searchState.items.filter((item) => item.fulfillmentOrigin === 'US').length} />
            <Metric label="Stock conocido" value={searchState.meta.stockCoverage?.withStock ?? searchState.items.filter((item) => (item.inventoryTotal ?? 0) > 0).length} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{searchState.items.length} resultados para "{searchState.keyword}"</p>
            {searchState.meta.warehouseAwareEnabled && <span className="text-xs text-emerald-300">Warehouse-aware activo</span>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {searchState.items.map((item) => <ProductCard key={item.cjProductId} item={item} />)}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-400">
            Para crear draft/publicar, abre <strong className="text-slate-200">Productos CJ</strong>, selecciona variante, ejecuta pricing/evaluacion y luego crea el draft eBay. El autopilot usa los mismos guardrails de USA-only, margen y cuota.
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-white">{value}</p>
    </div>
  );
}
