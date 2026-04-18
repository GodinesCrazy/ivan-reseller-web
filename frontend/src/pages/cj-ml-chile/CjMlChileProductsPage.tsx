import { useState } from 'react';
import { api } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type OperabilityStatus = 'operable' | 'stock_unknown' | 'unavailable';

interface CjProductSummary {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  listPriceUsd?: number;
  inventoryTotal?: number;
  operabilityStatus?: OperabilityStatus;
}

interface CjVariantDetail {
  cjSku: string;
  cjVid?: string;
  attributes: Record<string, string>;
  unitCostUsd: number;
  stock: number;
}

interface CjProductDetail {
  cjProductId: string;
  title: string;
  description?: string;
  imageUrls: string[];
  variants: CjVariantDetail[];
}

interface SearchResult {
  ok: boolean;
  items: CjProductSummary[];
  operabilitySummary?: { operable: number; stockUnknown: number; unavailable: number };
  fxRateCLPperUSD?: number | null;
  fxRateAt?: string | null;
  note?: string;
}

interface PreviewResult {
  ok: boolean;
  product: { cjProductId: string; title: string };
  variant: { cjSku: string; stockLive: number; unitCostUsd: number | null };
  shipping: { cost: number; method: string; estimatedDays: number | null; startCountryCode: string } | null;
  warehouseChileConfirmed: boolean;
  mvpViable: boolean;
  pricing: Record<string, unknown> | null;
  pricingError: string | null;
}

interface EvaluateResult extends PreviewResult {
  decision: 'APPROVED' | 'REJECTED' | 'PENDING' | 'NOT_VIABLE';
  reasons: Array<{ rule: string; code: string; message: string; severity: string }>;
  ids?: { evaluationId: number };
}

interface CategoryCandidate {
  id: string;
  name: string;
  probability: number;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function clpFmt(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

function usdFmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function variantLabel(v: CjVariantDetail): string {
  const attrs = Object.entries(v.attributes);
  if (!attrs.length) return 'Variante única';
  return attrs.map(([k, val]) => `${k}: ${val}`).join(' · ');
}

function variantKey(v: CjVariantDetail): string {
  return v.cjVid ?? v.cjSku;
}

function operabilityOf(item: CjProductSummary): OperabilityStatus {
  if (item.operabilityStatus) return item.operabilityStatus;
  if (item.inventoryTotal !== undefined && item.inventoryTotal > 0) return 'operable';
  if (item.inventoryTotal === 0) return 'unavailable';
  return 'stock_unknown';
}

function groupItems(items: CjProductSummary[]) {
  return items.reduce<{ operable: CjProductSummary[]; stockUnknown: CjProductSummary[]; unavailable: CjProductSummary[] }>(
    (acc, item) => {
      const s = operabilityOf(item);
      if (s === 'operable') acc.operable.push(item);
      else if (s === 'stock_unknown') acc.stockUnknown.push(item);
      else acc.unavailable.push(item);
      return acc;
    },
    { operable: [], stockUnknown: [], unavailable: [] },
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EstimatedBadge() {
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 uppercase tracking-wide">EST</span>;
}

function RealBadge() {
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 uppercase tracking-wide">REAL</span>;
}


function StockBadge({ inv }: { inv: number | undefined }) {
  if (inv === undefined) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Stock por confirmar</span>;
  if (inv > 0) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200">En stock ({inv})</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">Sin stock</span>;
}

function WarehousePendingBadge() {
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">🏭 WH Chile: verificar</span>;
}

function NoViableBadge() {
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-600">NO VIABLE</span>;
}

function WarehouseConfirmedBadge({ confirmed }: { confirmed: boolean }) {
  return confirmed
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">🇨🇱 Chile ✓</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">Sin WH Chile</span>;
}

function DecisionBadge({ d }: { d: string }) {
  const map: Record<string, string> = {
    APPROVED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800',
    REJECTED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
    PENDING: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    NOT_VIABLE: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600',
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${map[d] ?? map['PENDING']}`}>{d}</span>;
}

function OperabilityBadge({ status }: { status: OperabilityStatus }) {
  if (status === 'operable') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">● Operable</span>;
  if (status === 'stock_unknown') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600">● Stock por confirmar</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700">● Sin disponibilidad</span>;
}

type SectionTier = 'main' | 'secondary' | 'reference';
function SectionHeader({ label, count, subtitle, tier }: { label: string; count: number; subtitle?: string; tier?: SectionTier }) {
  const tierBadge: Record<SectionTier, string> = {
    main: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700',
    secondary: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600',
    reference: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700',
  };
  const tierLabel: Record<SectionTier, string> = { main: 'Flujo principal', secondary: 'Secundario', reference: 'Referencia' };
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{count}</span>
      {tier && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${tierBadge[tier]}`}>{tierLabel[tier]}</span>}
      {subtitle && <span className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</span>}
    </div>
  );
}

function ProductCard({
  item,
  isSelected,
  fxRate,
  onSelect,
}: {
  item: CjProductSummary;
  isSelected: boolean;
  fxRate: number | null;
  onSelect: () => void;
}) {
  const status = operabilityOf(item);
  const isUnavailable = status === 'unavailable';
  const estimatedCLP = item.listPriceUsd != null && fxRate != null ? Math.round(item.listPriceUsd * fxRate) : null;

  const borderClass = isSelected
    ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-400 dark:ring-emerald-500'
    : status === 'operable'
      ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 hover:border-slate-400 dark:hover:border-slate-500'
      : status === 'stock_unknown'
        ? 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/20 hover:border-slate-300 dark:hover:border-slate-600'
        : 'border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/10 opacity-70 hover:opacity-90';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left w-full rounded-xl border p-3 space-y-2.5 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 ${borderClass}`}
    >
      {/* Image */}
      {item.mainImageUrl ? (
        <img
          src={item.mainImageUrl}
          alt={item.title}
          loading="lazy"
          className={`w-full aspect-square object-contain rounded-lg bg-slate-50 dark:bg-slate-800 ${isUnavailable ? 'grayscale' : ''}`}
        />
      ) : (
        <div className="w-full aspect-square rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-xs">
          Sin imagen
        </div>
      )}

      {/* Title */}
      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
        {item.title}
      </p>

      {/* Price row */}
      <div className="space-y-1">
        {item.listPriceUsd != null && (
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-semibold ${isUnavailable ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-slate-100'}`}>{usdFmt(item.listPriceUsd)}</span>
            {!isUnavailable && <RealBadge />}
          </div>
        )}
        {estimatedCLP != null && !isUnavailable && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">{clpFmt(estimatedCLP)}</span>
            <EstimatedBadge />
          </div>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1">
        <OperabilityBadge status={status} />
        {isUnavailable ? <NoViableBadge /> : <WarehousePendingBadge />}
      </div>

      {/* Action label */}
      <span className={`inline-block text-xs rounded-full px-2 py-0.5 font-medium ${
        isSelected
          ? 'bg-emerald-600 text-white'
          : status === 'operable'
            ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
            : isUnavailable
              ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
      }`}>
        {isSelected ? '✓ Seleccionado' : status === 'operable' ? 'Seleccionar' : status === 'stock_unknown' ? 'Revisar stock' : 'Sin stock'}
      </span>
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CjMlChileProductsPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  // Product selection + detail
  const [selectedSummary, setSelectedSummary] = useState<CjProductSummary | null>(null);
  const [productDetail, setProductDetail] = useState<CjProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedVariantKey, setSelectedVariantKey] = useState('');

  // Pipeline
  const [qty, setQty] = useState(1);
  const [previewing, setPreviewing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [evalResult, setEvalResult] = useState<EvaluateResult | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Category
  const [categoryQuery, setCategoryQuery] = useState('');
  const [categorySuggesting, setCategorySuggesting] = useState(false);
  const [categoryCandidates, setCategoryCandidates] = useState<CategoryCandidate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryCandidate | null>(null);
  const [categoryErr, setCategoryErr] = useState<string | null>(null);

  // Draft
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftOk, setDraftOk] = useState(false);

  // Derived
  const fxRate = searchResult?.fxRateCLPperUSD ?? null;
  const grouped = searchResult ? groupItems(searchResult.items) : null;
  const selectedVariant = productDetail?.variants.find((v) => variantKey(v) === selectedVariantKey) ?? null;
  const operableVariants = productDetail?.variants.filter((v) => v.stock >= 1) ?? [];
  const unavailableVariants = productDetail?.variants.filter((v) => v.stock < 1) ?? [];
  const variantId = selectedVariant ? (selectedVariant.cjVid ?? selectedVariant.cjSku) : '';

  // Stock gating
  // productIsNoViable: detail loaded, has variants, ALL have stock=0
  const productIsNoViable =
    productDetail !== null &&
    productDetail.variants.length > 0 &&
    operableVariants.length === 0;
  // selectedVariantIsZeroStock: a specific zero-stock variant was explicitly chosen
  const selectedVariantIsZeroStock = selectedVariant !== null && selectedVariant.stock < 1;
  // Pipeline blocked when: no variant selected, OR variant confirmed zero stock
  // (manual SKU fallback: selectedVariant is null → only blocked when variantId empty)
  const pipelineBlocked = !variantId || selectedVariantIsZeroStock;

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchErr(null);
    setSearchResult(null);
    setSelectedSummary(null);
    setProductDetail(null);
    setPreviewResult(null);
    setEvalResult(null);
    try {
      const res = await api.post('/api/cj-ml-chile/cj/search', { query, pageSize: 20 });
      setSearchResult(res.data);
    } catch (e: unknown) {
      setSearchErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e));
    } finally { setSearching(false); }
  }

  async function selectProduct(item: CjProductSummary) {
    setSelectedSummary(item);
    setProductDetail(null);
    setSelectedVariantKey('');
    setPreviewResult(null);
    setEvalResult(null);
    setActionErr(null);
    setCategoryQuery(item.title.slice(0, 60));
    setCategoryCandidates([]);
    setSelectedCategory(null);
    setDraftOk(false);

    // Fetch full product detail (variants)
    setLoadingDetail(true);
    try {
      const res = await api.get(`/api/cj-ml-chile/cj/product/${item.cjProductId}`);
      const detail: CjProductDetail = res.data.product;
      setProductDetail(detail);
      // Auto-select first operable variant
      const firstOperable = detail.variants.find((v) => v.stock >= 1);
      if (firstOperable) setSelectedVariantKey(variantKey(firstOperable));
    } catch { /* detail fetch failed — manual entry fallback */ }
    finally { setLoadingDetail(false); }
  }

  async function doPreview() {
    if (!selectedSummary || !variantId) return;
    setPreviewing(true);
    setPreviewResult(null);
    setEvalResult(null);
    setActionErr(null);
    try {
      const res = await api.post('/api/cj-ml-chile/preview', {
        productId: selectedSummary.cjProductId,
        variantId,
        quantity: qty,
      });
      setPreviewResult(res.data);
    } catch (e: unknown) {
      setActionErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e));
    } finally { setPreviewing(false); }
  }

  async function doEvaluate() {
    if (!selectedSummary || !variantId) return;
    setEvaluating(true);
    setEvalResult(null);
    setActionErr(null);
    if (selectedSummary.title && !categoryQuery) setCategoryQuery(selectedSummary.title.slice(0, 60));
    try {
      const res = await api.post('/api/cj-ml-chile/evaluate', {
        productId: selectedSummary.cjProductId,
        variantId,
        quantity: qty,
      });
      setEvalResult(res.data);
    } catch (e: unknown) {
      setActionErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e));
    } finally { setEvaluating(false); }
  }

  async function suggestCategories() {
    const q = categoryQuery.trim();
    if (!q) return;
    setCategorySuggesting(true);
    setCategoryErr(null);
    setCategoryCandidates([]);
    setSelectedCategory(null);
    try {
      const res = await api.get(`/api/cj-ml-chile/ml/categories/suggest?q=${encodeURIComponent(q)}`);
      setCategoryCandidates(res.data.candidates ?? []);
      if ((res.data.candidates ?? []).length === 0) setCategoryErr('Sin sugerencias. Intenta con otro título.');
    } catch (e: unknown) {
      setCategoryErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e));
    } finally { setCategorySuggesting(false); }
  }

  async function doDraft(evaluationId: number) {
    if (!selectedCategory) { setActionErr('Selecciona una categoría ML Chile antes de crear el draft.'); return; }
    setDraftLoading(true);
    setDraftOk(false);
    setActionErr(null);
    try {
      await api.post('/api/cj-ml-chile/listings/draft', { evaluationId, categoryId: selectedCategory.id });
      setDraftOk(true);
    } catch (e: unknown) {
      setActionErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e));
    } finally { setDraftLoading(false); }
  }

  const pricing = previewResult?.pricing ?? evalResult?.pricing;
  const warehouseResult = previewResult ?? evalResult;

  return (
    <div className="space-y-6 pb-10">

      {/* ── A. SEARCH BLOCK ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Buscar productos CJ para ML Chile (ej: wireless earbuds)"
            className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <button
            type="button"
            onClick={search}
            disabled={searching || !query.trim()}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {searching ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Busca, selecciona variante, revisa pricing → evalúa → crea draft para publicar en MercadoLibre Chile.
        </p>
      </div>

      {searchErr && <p className="text-sm text-red-600 dark:text-red-400">{searchErr}</p>}

      {/* ── B. SEARCH STATS BANNER ──────────────────────────────────────── */}
      {searchResult && searchResult.operabilitySummary && (
        <div className="flex flex-wrap gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">{searchResult.items.length} resultados</span>
          <span className="text-emerald-700 dark:text-emerald-300">● {searchResult.operabilitySummary.operable} con stock</span>
          <span className="text-slate-500 dark:text-slate-400">● {searchResult.operabilitySummary.stockUnknown} stock por confirmar</span>
          <span className="text-amber-600 dark:text-amber-400">● {searchResult.operabilitySummary.unavailable} sin stock</span>
          {fxRate != null && (
            <span className="ml-auto text-slate-400 dark:text-slate-500">
              FX: 1 USD = {clpFmt(fxRate)} <EstimatedBadge />
            </span>
          )}
        </div>
      )}

      {/* ── C. RESULTS GRID ─────────────────────────────────────────────── */}
      {grouped && (
        <div className="space-y-5">

          {/* Operables — Flujo principal */}
          {grouped.operable.length > 0 && (
            <div className="space-y-2 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10 p-3">
              <SectionHeader label="Con stock confirmado" count={grouped.operable.length} subtitle="Listos para evaluar" tier="main" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {grouped.operable.map((item) => (
                  <ProductCard
                    key={item.cjProductId}
                    item={item}
                    isSelected={selectedSummary?.cjProductId === item.cjProductId}
                    fxRate={fxRate}
                    onSelect={() => selectProduct(item)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sin operables: aviso explícito */}
          {grouped.operable.length === 0 && (grouped.stockUnknown.length > 0 || grouped.unavailable.length > 0) && (
            <p className="text-xs text-slate-500 dark:text-slate-400 px-1">
              Sin productos con stock confirmado en esta búsqueda. Los resultados de abajo requieren verificación o están sin stock.
            </p>
          )}

          {/* Stock unknown — Secundario */}
          {grouped.stockUnknown.length > 0 && (
            <details className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/20 p-3" open={grouped.operable.length === 0}>
              <summary className="cursor-pointer list-none">
                <SectionHeader label="Stock por confirmar" count={grouped.stockUnknown.length} subtitle="Verificar en evaluate" tier="secondary" />
              </summary>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-2">
                {grouped.stockUnknown.map((item) => (
                  <ProductCard
                    key={item.cjProductId}
                    item={item}
                    isSelected={selectedSummary?.cjProductId === item.cjProductId}
                    fxRate={fxRate}
                    onSelect={() => selectProduct(item)}
                  />
                ))}
              </div>
            </details>
          )}

          {/* Unavailable — Referencia */}
          {grouped.unavailable.length > 0 && (
            <details className="group rounded-xl border border-amber-100 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-900/5 p-3">
              <summary className="cursor-pointer list-none">
                <SectionHeader label="Sin stock / no operables" count={grouped.unavailable.length} subtitle="No recomendados" tier="reference" />
              </summary>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-2 opacity-60">
                {grouped.unavailable.map((item) => (
                  <ProductCard
                    key={item.cjProductId}
                    item={item}
                    isSelected={selectedSummary?.cjProductId === item.cjProductId}
                    fxRate={fxRate}
                    onSelect={() => selectProduct(item)}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── D. SELECTED PRODUCT PANEL ───────────────────────────────────── */}
      {selectedSummary && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">

          {/* Header */}
          <div className="p-4 flex gap-3">
            {(productDetail?.imageUrls?.[0] ?? selectedSummary.mainImageUrl) && (
              <img
                src={productDetail?.imageUrls?.[0] ?? selectedSummary.mainImageUrl}
                alt=""
                className="w-16 h-16 object-contain rounded-lg bg-slate-50 dark:bg-slate-700 flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">{selectedSummary.title}</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {selectedSummary.listPriceUsd != null && (
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{usdFmt(selectedSummary.listPriceUsd)}</span>
                )}
                {selectedSummary.listPriceUsd != null && fxRate != null && (
                  <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                    ≈ {clpFmt(Math.round(selectedSummary.listPriceUsd * fxRate))} <EstimatedBadge />
                  </span>
                )}
                <StockBadge inv={selectedSummary.inventoryTotal} />
                {productIsNoViable
                  ? <NoViableBadge />
                  : warehouseResult
                    ? <WarehouseConfirmedBadge confirmed={warehouseResult.warehouseChileConfirmed} />
                    : <WarehousePendingBadge />}
              </div>
            </div>
          </div>

          {/* Variant picker */}
          <div className="p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Variante</p>

            {loadingDetail && (
              <p className="text-xs text-slate-400 animate-pulse">Cargando variantes…</p>
            )}

            {!loadingDetail && productDetail && (
              <div className="space-y-2">
                {operableVariants.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">Con stock</p>
                    {operableVariants.map((v) => {
                      const k = variantKey(v);
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setSelectedVariantKey(k)}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                            selectedVariantKey === k
                              ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50 dark:bg-slate-700/50'
                          }`}
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100">{variantLabel(v)}</span>
                          <span className="ml-2 text-slate-500">{usdFmt(v.unitCostUsd)}</span>
                          <span className="ml-2 text-emerald-700 dark:text-emerald-300">Stock: {v.stock}</span>
                          {selectedVariantKey === k && <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-semibold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* NO VIABLE banner when all variants are stock=0 */}
                {productIsNoViable && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 flex items-center gap-2">
                    <NoViableBadge />
                    <span className="text-xs text-slate-500 dark:text-slate-400">Todas las variantes tienen stock 0. Este producto no se puede evaluar.</span>
                  </div>
                )}
                {unavailableVariants.length > 0 && (
                  <details open={operableVariants.length === 0}>
                    <summary className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide cursor-pointer select-none">
                      Sin stock — no evaluables ({unavailableVariants.length})
                    </summary>
                    <div className="space-y-1 mt-1">
                      {unavailableVariants.map((v) => {
                        const k = variantKey(v);
                        const isChosen = selectedVariantKey === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setSelectedVariantKey(k)}
                            title="Variante sin stock — Preview/Evaluate bloqueados"
                            className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                              isChosen
                                ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
                                : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 opacity-60 hover:opacity-80'
                            }`}
                          >
                            <span className="font-medium text-slate-700 dark:text-slate-300">{variantLabel(v)}</span>
                            <span className="ml-2 text-slate-400">{usdFmt(v.unitCostUsd)}</span>
                            <span className="ml-2 font-semibold text-slate-400 dark:text-slate-500">Stock: 0</span>
                            <span className="ml-2 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">· no evaluable</span>
                          </button>
                        );
                      })}
                    </div>
                  </details>
                )}
                {productDetail.variants.length === 0 && (
                  <p className="text-xs text-slate-400">Sin variantes disponibles en CJ.</p>
                )}
              </div>
            )}

            {/* Fallback manual input if detail failed to load */}
            {!loadingDetail && !productDetail && (
              <div className="space-y-1">
                <p className="text-xs text-amber-600 dark:text-amber-400">No se pudieron cargar variantes. Ingresa el SKU manualmente.</p>
                <input
                  type="text"
                  value={selectedVariantKey}
                  onChange={(e) => setSelectedVariantKey(e.target.value)}
                  placeholder="ej: 10001234567890"
                  className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 w-52"
                />
              </div>
            )}

            {/* Selected variant summary */}
            {selectedVariant && (
              <div className={`rounded-lg border p-2.5 text-xs space-y-0.5 ${
                selectedVariantIsZeroStock
                  ? 'border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/10'
                  : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40'
              }`}>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Variante seleccionada</p>
                  {selectedVariantIsZeroStock && <NoViableBadge />}
                </div>
                <p className="text-slate-600 dark:text-slate-400">{variantLabel(selectedVariant)}</p>
                <div className="flex flex-wrap gap-3 mt-1">
                  <span className="text-slate-700 dark:text-slate-300">Costo: <strong>{usdFmt(selectedVariant.unitCostUsd)}</strong> <RealBadge /></span>
                  <span className={selectedVariant.stock >= 1 ? 'text-emerald-700 dark:text-emerald-300' : 'font-semibold text-amber-600 dark:text-amber-400'}>
                    Stock: {selectedVariant.stock}
                  </span>
                  <span className="text-slate-400 font-mono text-[10px]">{selectedVariant.cjVid ?? selectedVariant.cjSku}</span>
                </div>
                {selectedVariantIsZeroStock && (
                  <p className="text-amber-600 dark:text-amber-400 font-medium pt-1">
                    Sin stock — Preview y Evaluate están bloqueados para esta variante.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Quantity + actions */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <label htmlFor="qty-input" className="text-xs text-slate-500 shrink-0">Cantidad</label>
              <input
                id="qty-input"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 w-20"
              />
            </div>

            {/* Pipeline gate messages */}
            {productIsNoViable && (
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <NoViableBadge /> Producto sin stock en todas sus variantes — no se puede evaluar.
              </p>
            )}
            {!productIsNoViable && !variantId && !loadingDetail && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Selecciona una variante para continuar</p>
            )}
            {selectedVariantIsZeroStock && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Variante con stock 0 — selecciona una variante con stock para evaluar.</p>
            )}

            {actionErr && <p className="text-sm text-red-600 dark:text-red-400">{actionErr}</p>}

            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={doPreview}
                disabled={pipelineBlocked || previewing}
                className="px-4 py-2 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {previewing ? 'Calculando…' : 'Preview pricing'}
              </button>
              <button
                type="button"
                onClick={doEvaluate}
                disabled={pipelineBlocked || evaluating}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {evaluating ? 'Evaluando…' : 'Evaluate (persistir)'}
              </button>
            </div>
          </div>

          {/* Preview result */}
          {previewResult && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Preview</p>
                <WarehouseConfirmedBadge confirmed={previewResult.warehouseChileConfirmed} />
                {previewResult.warehouseChileConfirmed
                  ? <RealBadge />
                  : <span className="text-xs text-slate-500">OUT OF SCOPE para MVP</span>}
              </div>
              {previewResult.shipping && (
                <ShippingRow shipping={previewResult.shipping} isReal={previewResult.warehouseChileConfirmed} />
              )}
              {pricing && <PricingTable p={pricing} />}
              {previewResult.pricingError && <p className="text-xs text-red-600">{previewResult.pricingError}</p>}
            </div>
          )}

          {/* Evaluate result */}
          {evalResult && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Evaluación</p>
                <DecisionBadge d={evalResult.decision} />
                <WarehouseConfirmedBadge confirmed={evalResult.warehouseChileConfirmed} />
              </div>

              {evalResult.reasons.length > 0 && (
                <div className="space-y-1">
                  {evalResult.reasons.map((r, i) => (
                    <p key={i} className={`text-xs ${
                      r.severity === 'block' ? 'text-red-600 dark:text-red-400'
                      : r.severity === 'warn' ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      [{r.rule}] {r.code}: {r.message}
                    </p>
                  ))}
                </div>
              )}

              {evalResult.shipping && (
                <ShippingRow shipping={evalResult.shipping} isReal={evalResult.warehouseChileConfirmed} />
              )}
              {pricing && <PricingTable p={pricing} />}

              {/* Category + draft flow */}
              {evalResult.decision === 'APPROVED' && evalResult.ids?.evaluationId && !draftOk && (
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Paso 2 — Categoría ML Chile</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={categoryQuery}
                      onChange={(e) => setCategoryQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && suggestCategories()}
                      placeholder="Título del producto"
                      className="flex-1 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={suggestCategories}
                      disabled={categorySuggesting || !categoryQuery.trim()}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
                    >
                      {categorySuggesting ? 'Buscando…' : 'Sugerir'}
                    </button>
                  </div>
                  {categoryErr && <p className="text-xs text-amber-600 dark:text-amber-400">{categoryErr}</p>}
                  {categoryCandidates.length > 0 && (
                    <div className="space-y-1">
                      {categoryCandidates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCategory(c)}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                            selectedCategory?.id === c.id
                              ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                          }`}
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100">{c.name}</span>
                          <span className="ml-2 text-xs text-slate-500">{c.id} · {(c.probability * 100).toFixed(0)}%</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedCategory && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                      ✓ Categoría: {selectedCategory.name} ({selectedCategory.id})
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => doDraft(evalResult.ids!.evaluationId)}
                    disabled={draftLoading || !selectedCategory}
                    className="px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-700 dark:hover:bg-slate-300 disabled:opacity-50 transition-colors"
                  >
                    {draftLoading ? 'Creando draft…' : selectedCategory ? `Crear draft (${selectedCategory.id})` : 'Crear draft listing'}
                  </button>
                  {!selectedCategory && <p className="text-xs text-amber-600 dark:text-amber-400">Selecciona una categoría antes de crear el draft.</p>}
                </div>
              )}
              {draftOk && (
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                  ✓ Draft creado con categoría {selectedCategory?.id ?? ''}. Ve a Listings para publicar.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shipping row ───────────────────────────────────────────────────────────────

function ShippingRow({ shipping, isReal }: {
  shipping: { cost: number; method: string; estimatedDays: number | null; startCountryCode: string };
  isReal: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2">
      <span>Envío CJ: <strong className="text-slate-800 dark:text-slate-200">${shipping.cost.toFixed(2)} USD</strong> <RealBadge /></span>
      <span>Método: {shipping.method}</span>
      <span>
        ETA: {shipping.estimatedDays != null ? `${shipping.estimatedDays} días` : '—'}
        {' '}{isReal ? <RealBadge /> : <EstimatedBadge />}
      </span>
      <span>Origen: <strong>{shipping.startCountryCode}</strong></span>
    </div>
  );
}

// ── Pricing table ──────────────────────────────────────────────────────────────

function PricingTable({ p }: { p: Record<string, unknown> }) {
  const n = (v: unknown) => typeof v === 'number' ? v : null;
  const usd = (v: unknown) => { const x = n(v); return x != null ? `$${x.toFixed(2)}` : '—'; };
  const clp = (v: unknown) => { const x = n(v); return x != null ? clpFmt(x) : '—'; };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Desglose de precios</p>
        {p.fxRateCLPperUSD != null && <EstimatedBadge />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-600">
              <th className="text-left text-slate-400 pb-1 font-normal">Concepto</th>
              <th className="text-right text-slate-400 pb-1 font-normal">USD</th>
              <th className="text-right text-slate-400 pb-1 font-normal">CLP <EstimatedBadge /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            <PRow label="Costo proveedor CJ" usd={usd(p.supplierCostUsd)} badge={<RealBadge />} />
            <PRow label="Envío CJ → Chile" usd={usd(p.shippingUsd)} badge={<RealBadge />} />
            <PRow label={`IVA 19%`} usd={usd(p.ivaUsd)} />
            <PRow label="Costo aterrizado" usd={usd(p.landedCostUsd)} bold />
            <PRow label="Fee ML Chile" usd={usd(p.mlFeeUsd)} />
            <PRow label="Fee Mercado Pago" usd={usd(p.mpPaymentFeeUsd)} />
            <PRow label="Buffer incidentes" usd={usd(p.incidentBufferUsd)} />
            <PRow label="COSTO TOTAL" usd={usd(p.totalCostUsd)} bold />
            <PRow label="PRECIO LISTA" usd={usd(p.listPriceUsd)} clp={clp(p.listPriceCLP)} bold badge={<EstimatedBadge />} />
            <PRow label="Precio sugerido" usd={usd(p.suggestedPriceUsd)} clp={clp(p.suggestedPriceCLP)} badge={<EstimatedBadge />} />
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600">
              <td className="pt-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">Margen neto</td>
              <td className="pt-1.5 text-right text-xs font-bold text-emerald-700 dark:text-emerald-300" colSpan={2}>
                {p.netMarginPct != null ? `${(p.netMarginPct as number).toFixed(1)}%` : '—'}
                {' '}({usd(p.netProfitUsd)})
              </td>
            </tr>
            <tr>
              <td className="pt-1 text-[10px] text-slate-400" colSpan={3}>
                FX: 1 USD = {n(p.fxRateCLPperUSD) ? clpFmt(n(p.fxRateCLPperUSD)!) : '—'} CLP
                {p.fxRateAt ? ` · actualizado ${new Date(p.fxRateAt as string).toLocaleTimeString()}` : ''}
                {' '}<EstimatedBadge />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {p.feeDefaultsApplied != null && Object.keys(p.feeDefaultsApplied as object).length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Defaults aplicados: {Object.entries(p.feeDefaultsApplied as Record<string, number>).map(([k, v]) => `${k}=${v}`).join(', ')}
        </p>
      )}
    </div>
  );
}

function PRow({ label, usd, clp, bold, badge }: { label: string; usd: string; clp?: string; bold?: boolean; badge?: React.ReactNode }) {
  return (
    <tr>
      <td className={`py-1 text-slate-600 dark:text-slate-400 ${bold ? 'font-semibold text-slate-800 dark:text-slate-200' : ''}`}>
        <span>{label}</span>{badge && <span className="ml-1">{badge}</span>}
      </td>
      <td className={`py-1 text-right font-mono tabular-nums ${bold ? 'font-semibold text-slate-800 dark:text-slate-200' : 'text-slate-700 dark:text-slate-300'}`}>
        {usd}
      </td>
      <td className={`py-1 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-300 ${bold ? 'font-semibold' : ''}`}>
        {clp ?? '—'}
      </td>
    </tr>
  );
}
