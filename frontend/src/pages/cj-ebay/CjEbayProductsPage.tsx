import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';

// ── CJ catalog types ──────────────────────────────────────────────────────────

type CjProductSummary = {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  listPriceUsd?: number;
  operabilityStatus?: 'operable' | 'stock_unknown' | 'unavailable';
  /**
   * Total inventory from CJ listV2.
   * undefined = not provided by CJ (unknown)
   * 0 = CJ reported zero stock
   * >0 = CJ reported available stock
   */
  inventoryTotal?: number;
};

type CjVariantDetail = {
  cjSku: string;
  cjVid?: string;
  attributes: Record<string, string>;
  unitCostUsd: number;
  stock: number;
};

type CjProductDetail = {
  cjProductId: string;
  title: string;
  description?: string;
  imageUrls: string[];
  variants: CjVariantDetail[];
};

type SearchOperabilityStatus = 'operable' | 'stock_unknown' | 'unavailable';

// ── Pipeline types ────────────────────────────────────────────────────────────

type NullableNum = number | null;

type PricingBreakdownJson = {
  supplierCostUsd: NullableNum;
  shippingUsd: NullableNum;
  ebayFeeUsd: NullableNum;
  paymentFeeUsd: NullableNum;
  incidentBufferUsd: NullableNum;
  totalCostUsd: NullableNum;
  listPriceUsd: NullableNum;
  netProfitUsd: NullableNum;
  netMarginPct: NullableNum;
  suggestedPriceUsd: NullableNum;
  minimumAllowedPriceUsd: NullableNum;
  feeDefaultsApplied: Record<string, number>;
};

type ShippingSnippet = {
  cost: number;
  method: string;
  estimatedDays: number | null;
};

type QualificationReason = {
  rule: string;
  code: string;
  message: string;
  severity: string;
};

type PreviewOk = {
  ok: true;
  breakdown: PricingBreakdownJson;
  shipping: ShippingSnippet;
  product: { cjProductId: string; title: string };
  variant: { cjSku: string; cjVid?: string; stockLive: number; unitCostUsd: number | null };
  riskScore: number;
};

type EvaluateOk = PreviewOk & {
  decision: 'APPROVED' | 'REJECTED' | 'PENDING';
  reasons: QualificationReason[];
  ids: {
    productDbId: number;
    variantDbId: number;
    shippingQuoteId: number;
    evaluationId: number;
  };
};

type SearchResponse = {
  ok: boolean;
  items: CjProductSummary[];
  stockCoverage?: {
    withStock: number;
    unknownStock: number;
    zeroStock: number;
  };
  operabilitySummary?: {
    operable: number;
    stockUnknown: number;
    unavailable: number;
  };
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtUsd(n: NullableNum): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function fmtPct(n: NullableNum): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function variantLabel(v: CjVariantDetail): string {
  const attrs = Object.entries(v.attributes);
  if (!attrs.length) return 'Variante única';
  return attrs.map(([k, val]) => `${k}: ${val}`).join(' · ');
}

function variantKey(v: CjVariantDetail): string {
  return v.cjVid ?? v.cjSku;
}

function isVariantOperable(v: CjVariantDetail): boolean {
  return v.stock >= 1;
}

function sortVariantsForOperator(variants: CjVariantDetail[]): CjVariantDetail[] {
  return [...variants].sort((a, b) => {
    const availabilityDelta = Number(isVariantOperable(b)) - Number(isVariantOperable(a));
    if (availabilityDelta !== 0) return availabilityDelta;
    return b.stock - a.stock;
  });
}

function searchOperabilityStatus(item: CjProductSummary): SearchOperabilityStatus {
  if (item.operabilityStatus) return item.operabilityStatus;
  if (item.inventoryTotal !== undefined && item.inventoryTotal > 0) return 'operable';
  if (item.inventoryTotal === 0) return 'unavailable';
  return 'stock_unknown';
}

function groupSearchResults(items: CjProductSummary[]) {
  return items.reduce<{
    operable: CjProductSummary[];
    stockUnknown: CjProductSummary[];
    unavailable: CjProductSummary[];
  }>(
    (acc, item) => {
      const status = searchOperabilityStatus(item);
      if (status === 'operable') acc.operable.push(item);
      else if (status === 'stock_unknown') acc.stockUnknown.push(item);
      else acc.unavailable.push(item);
      return acc;
    },
    { operable: [], stockUnknown: [], unavailable: [] },
  );
}

/** Badge for search result cards based on inventoryTotal. */
function StockBadge({ inv }: { inv: number | undefined }) {
  if (inv === undefined) {
    return (
      <span className="inline-block text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2 py-0.5 font-medium">
        Stock por confirmar
      </span>
    );
  }
  if (inv > 0) {
    return (
      <span className="inline-block text-xs rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 font-medium">
        En stock ({inv})
      </span>
    );
  }
  return (
    <span className="inline-block text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-2 py-0.5 font-medium">
      Sin stock registrado
    </span>
  );
}

function OperabilityBadge({ status }: { status: SearchOperabilityStatus }) {
  const labels: Record<SearchOperabilityStatus, string> = {
    operable: 'Operable',
    stock_unknown: 'Stock por confirmar',
    unavailable: 'Sin disponibilidad',
  };
  const styles: Record<SearchOperabilityStatus, string> = {
    operable:
      'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200',
    stock_unknown:
      'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
    unavailable:
      'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200',
  };
  return (
    <span className={`inline-block text-xs rounded-full px-2 py-0.5 font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function extractApiError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { error?: string; message?: string };
    return d.message || d.error || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DecisionPill({ decision }: { decision: EvaluateOk['decision'] }) {
  const styles: Record<EvaluateOk['decision'], string> = {
    APPROVED:
      'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800',
    REJECTED:
      'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100 border-rose-200 dark:border-rose-800',
    PENDING:
      'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 border-amber-200 dark:border-amber-800',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${styles[decision]}`}
    >
      {decision}
    </span>
  );
}

function Row({ label, v }: { label: string; v: NullableNum }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 dark:border-slate-800 py-1">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">{fmtUsd(v)}</span>
    </div>
  );
}

function SearchResultCard({
  item,
  selectedProductId,
  productDetailLoading,
  onSelect,
}: {
  item: CjProductSummary;
  selectedProductId?: string;
  productDetailLoading: boolean;
  onSelect: (item: CjProductSummary) => void;
}) {
  const status = searchOperabilityStatus(item);
  const isSelected = selectedProductId === item.cjProductId;
  const actionLabel =
    status === 'operable'
      ? 'Seleccionar'
      : status === 'stock_unknown'
        ? 'Revisar stock'
        : 'Ver detalle';
  const idleClass =
    status === 'operable'
      ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 hover:border-slate-400 dark:hover:border-slate-500'
      : status === 'stock_unknown'
        ? 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/20 hover:border-slate-300 dark:hover:border-slate-600'
        : 'border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/10 opacity-75 hover:opacity-90 hover:border-amber-300 dark:hover:border-amber-800/60';

  return (
    <button
      key={item.cjProductId}
      type="button"
      onClick={() => onSelect(item)}
      disabled={productDetailLoading}
      className={`text-left rounded-lg border p-3 space-y-2 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60 ${
        isSelected
          ? 'border-slate-800 dark:border-slate-200 bg-slate-50 dark:bg-slate-800/40'
          : idleClass
      }`}
    >
      {item.mainImageUrl ? (
        <img
          src={item.mainImageUrl}
          alt={item.title}
          className="w-full aspect-square object-contain rounded bg-slate-50 dark:bg-slate-800"
          loading="lazy"
        />
      ) : (
        <div className="w-full aspect-square rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-xs">
          Sin imagen
        </div>
      )}
      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
        {item.title}
      </p>
      <div className="flex flex-wrap gap-1 items-center">
        {item.listPriceUsd != null && (
          <span className="text-xs text-slate-500">{fmtUsd(item.listPriceUsd)}</span>
        )}
        <StockBadge inv={item.inventoryTotal} />
        <OperabilityBadge status={status} />
      </div>
      <span className="inline-block text-xs rounded-full bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 px-2 py-0.5 font-medium">
        {actionLabel}
      </span>
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CjEbayProductsPage() {
  // ─── Search ──────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<CjProductSummary[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ─── Product selection ────────────────────────────────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState<CjProductDetail | null>(null);
  const [productDetailLoading, setProductDetailLoading] = useState(false);
  const [selectedVariantKey, setSelectedVariantKey] = useState<string>('');

  // ─── Pipeline inputs (auto-filled from selection; editable in advanced mode) ──
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [destPostalCode, setDestPostalCode] = useState('90210');

  // ─── Advanced/manual panel ────────────────────────────────────────────────────
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ─── Pipeline state ───────────────────────────────────────────────────────────
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingEvaluate, setLoadingEvaluate] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftListingId, setDraftListingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewOk | null>(null);
  const [evaluate, setEvaluate] = useState<EvaluateOk | null>(null);

  // ─── Derived ──────────────────────────────────────────────────────────────────
  const canRunPipeline = productId.trim().length > 0 && variantId.trim().length > 0;
  const groupedResults = searchResults ? groupSearchResults(searchResults) : null;
  const selectedVariant =
    selectedProduct?.variants.find((variant) => variantKey(variant) === selectedVariantKey) ?? null;
  const availableVariants = selectedProduct?.variants.filter(isVariantOperable) ?? [];
  const unavailableVariants = selectedProduct?.variants.filter((variant) => !isVariantOperable(variant)) ?? [];
  const hasOperableVariants = availableVariants.length > 0;

  const body = () => ({
    productId: productId.trim(),
    variantId: variantId.trim(),
    quantity: Math.max(1, Math.floor(quantity)),
    destPostalCode: destPostalCode.trim() || undefined,
  });

  // ─── Search handler ───────────────────────────────────────────────────────────
  async function runSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchError(null);
    setSearchLoading(true);
    setSearchResults(null);
    setSelectedProduct(null);
    setSelectedVariantKey('');
    setProductId('');
    setVariantId('');
    setPreview(null);
    setEvaluate(null);
    setError(null);
    try {
      const res = await api.post<SearchResponse>(
        '/api/cj-ebay/cj/search',
        { keyword: q, page: 1, pageSize: 20 },
      );
      setSearchResults(res.data?.items ?? []);
    } catch (e) {
      setSearchError(extractApiError(e, 'Error al buscar productos CJ.'));
    } finally {
      setSearchLoading(false);
    }
  }

  // ─── Select product handler ────────────────────────────────────────────────────
  async function selectProduct(summary: CjProductSummary) {
    setProductDetailLoading(true);
    setSelectedProduct(null);
    setSelectedVariantKey('');
    setProductId('');
    setVariantId('');
    setPreview(null);
    setEvaluate(null);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean; product: CjProductDetail }>(
        `/api/cj-ebay/cj/product/${encodeURIComponent(summary.cjProductId)}`,
      );
      const detail = res.data?.product;
      if (!detail) throw new Error('No se recibió detalle del producto.');
      const sortedVariants = sortVariantsForOperator(detail.variants);
      const nextProduct = { ...detail, variants: sortedVariants };
      const firstOperableVariant = sortedVariants.find(isVariantOperable);

      setSelectedProduct(nextProduct);
      setProductId(nextProduct.cjProductId);
      if (firstOperableVariant) {
        const vk = variantKey(firstOperableVariant);
        setSelectedVariantKey(vk);
        setVariantId(vk);
      }
    } catch (e) {
      setError(extractApiError(e, 'Error al cargar detalle del producto.'));
    } finally {
      setProductDetailLoading(false);
    }
  }

  function chooseVariant(variant: CjVariantDetail) {
    if (!isVariantOperable(variant)) return;
    const vk = variantKey(variant);
    setSelectedVariantKey(vk);
    setVariantId(vk);
    setPreview(null);
    setEvaluate(null);
    setError(null);
  }

  // ─── Pipeline handlers ─────────────────────────────────────────────────────────
  async function runPreview() {
    setError(null);
    setPreview(null);
    setEvaluate(null);
    setLoadingPreview(true);
    try {
      const res = await api.post<PreviewOk>('/api/cj-ebay/pricing/preview', body());
      if (res.data?.ok) setPreview(res.data);
    } catch (e: unknown) {
      let msg = 'Error en vista previa.';
      if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
        const d = e.response.data as { error?: string; message?: string };
        if (d.error === 'NO_UNIT_COST') msg = 'La variante no tiene costo unitario usable (NO_UNIT_COST).';
        else if (d.message) msg = d.message;
        else if (d.error) msg = d.error;
      } else if (e instanceof Error) {
        msg = e.message;
      }
      setError(msg);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function runEvaluate() {
    setError(null);
    setEvaluate(null);
    setLoadingEvaluate(true);
    try {
      const res = await api.post<EvaluateOk>('/api/cj-ebay/evaluate', body());
      if (res.data?.ok) setEvaluate(res.data);
    } catch (e) {
      setError(extractApiError(e, 'Error al evaluar.'));
    } finally {
      setLoadingEvaluate(false);
    }
  }

  async function runDraft() {
    setError(null);
    setDraftListingId(null);
    setLoadingDraft(true);
    try {
      const res = await api.post<{ ok: boolean; listingId: number; policyNote?: string }>(
        '/api/cj-ebay/listings/draft',
        body(),
      );
      if (res.data?.ok && typeof res.data.listingId === 'number') setDraftListingId(res.data.listingId);
    } catch (e) {
      setError(extractApiError(e, 'Error al crear draft.'));
    } finally {
      setLoadingDraft(false);
    }
  }

  const showBreakdown = preview ?? evaluate;

  // ─── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ══ SECCIÓN A — Buscador CJ ═══════════════════════════════════════════════ */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Buscar producto CJ
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Escribe un término para explorar el catálogo CJ Dropshipping
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            placeholder="p.ej. phone holder, laptop stand, led lamp…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch();
            }}
          />
          <button
            type="button"
            disabled={searchLoading || !searchQuery.trim()}
            className="rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-medium px-4 py-2 disabled:opacity-50 whitespace-nowrap"
            onClick={() => void runSearch()}
          >
            {searchLoading ? 'Buscando y validando…' : 'Buscar'}
          </button>
        </div>
        {searchError && (
          <p className="text-sm text-rose-700 dark:text-rose-300">{searchError}</p>
        )}
      </div>

      {/* ══ SECCIÓN B — Resultados CJ ════════════════════════════════════════════ */}
      {searchResults !== null && groupedResults && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Resultados{searchResults.length > 0 ? ` (${searchResults.length})` : ''}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              El flujo principal solo muestra productos con stock confirmado en CJ. Los resultados con stock incierto o agotado quedan relegados a secciones secundarias.
            </p>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-sm text-slate-500">
              Sin resultados para ese término. Prueba con otra búsqueda.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Resultados operables ({groupedResults.operable.length})
                  </h3>
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
                    Flujo principal
                  </span>
                </div>
                {groupedResults.operable.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {groupedResults.operable.map((item) => (
                      <SearchResultCard
                        key={item.cjProductId}
                        item={item}
                        selectedProductId={selectedProduct?.cjProductId}
                        productDetailLoading={productDetailLoading}
                        onSelect={(nextItem) => void selectProduct(nextItem)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                    No encontramos productos con stock confirmado para esta búsqueda. Revisa las secciones secundarias o prueba otro término.
                  </div>
                )}
              </div>

              {groupedResults.stockUnknown.length > 0 && (
                <details className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/20">
                  <summary className="cursor-pointer list-none px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          Stock por confirmar ({groupedResults.stockUnknown.length})
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          CJ no devolvió inventario total en la búsqueda; quedan fuera del flujo principal hasta revisar detalle.
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        Secundario
                      </span>
                    </div>
                  </summary>
                  <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {groupedResults.stockUnknown.map((item) => (
                        <SearchResultCard
                          key={item.cjProductId}
                          item={item}
                          selectedProductId={selectedProduct?.cjProductId}
                          productDetailLoading={productDetailLoading}
                          onSelect={(nextItem) => void selectProduct(nextItem)}
                        />
                      ))}
                    </div>
                  </div>
                </details>
              )}

              {groupedResults.unavailable.length > 0 && (
                <details className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/10">
                  <summary className="cursor-pointer list-none px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                          Sin disponibilidad / no operables ({groupedResults.unavailable.length})
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          CJ reporta stock total 0 para estos productos, así que no compiten con los candidatos operables.
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                        Referencia
                      </span>
                    </div>
                  </summary>
                  <div className="border-t border-amber-200/80 dark:border-amber-900/40 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {groupedResults.unavailable.map((item) => (
                        <SearchResultCard
                          key={item.cjProductId}
                          item={item}
                          selectedProductId={selectedProduct?.cjProductId}
                          productDetailLoading={productDetailLoading}
                          onSelect={(nextItem) => void selectProduct(nextItem)}
                        />
                      ))}
                    </div>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading detail ─────────────────────────────────────────────────────────── */}
      {productDetailLoading && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 text-sm text-slate-500">
          Cargando detalle y validando stock en vivo…
        </div>
      )}

      {/* ══ SECCIÓN C — Producto seleccionado ════════════════════════════════════ */}
      {selectedProduct && !productDetailLoading && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-4">
          <div className="flex gap-4">
            {selectedProduct.imageUrls[0] && (
              <img
                src={selectedProduct.imageUrls[0]}
                alt={selectedProduct.title}
                className="w-20 h-20 object-contain rounded bg-slate-50 dark:bg-slate-800 shrink-0"
              />
            )}
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                {selectedProduct.title}
              </h2>
              <p className="text-xs font-mono text-slate-400">{selectedProduct.cjProductId}</p>
              <p className="text-xs text-slate-500">
                {selectedProduct.variants.length} variante
                {selectedProduct.variants.length !== 1 ? 's' : ''}
              </p>
              <p className={`text-xs ${hasOperableVariants ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {hasOperableVariants
                  ? `${availableVariants.length} variante${availableVariants.length !== 1 ? 's' : ''} operable${availableVariants.length !== 1 ? 's' : ''} con stock >= 1`
                  : 'Sin variantes operables en el detalle actual de CJ'}
              </p>
            </div>
          </div>

          {/* Variant picker */}
          {selectedProduct.variants.length > 0 ? (
            <div className="space-y-4">
              {selectedProduct.variants.length === 1 && selectedVariant && (
                <div className="rounded-md border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                  Variante única operable seleccionada automáticamente · {variantLabel(selectedVariant)} · {fmtUsd(selectedVariant.unitCostUsd)} · {selectedVariant.stock} en stock
                </div>
              )}

              {!hasOperableVariants && (
                <div className="rounded-md border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  Todas las variantes reportan stock 0 en CJ. Este producto queda bloqueado fuera del flujo principal para evitar operar una referencia no disponible.
                </div>
              )}

              {availableVariants.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Variantes operables
                    </p>
                    <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
                      stock &gt;= 1
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {availableVariants.map((variant) => {
                      const vk = variantKey(variant);
                      const isSelected = selectedVariantKey === vk;
                      return (
                        <button
                          key={vk}
                          type="button"
                          onClick={() => chooseVariant(variant)}
                          className={`text-left rounded-lg border px-3 py-2 text-xs transition-colors ${
                            isSelected
                              ? 'border-slate-800 dark:border-slate-200 bg-slate-50 dark:bg-slate-800/40 font-medium'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                          }`}
                        >
                          <span className="text-slate-800 dark:text-slate-200">{variantLabel(variant)}</span>
                          <span className="block text-slate-400 mt-0.5">{fmtUsd(variant.unitCostUsd)}</span>
                          <span className="block mt-0.5 text-emerald-600 dark:text-emerald-400">
                            {variant.stock} en stock
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {unavailableVariants.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      Variantes sin stock
                    </p>
                    <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                      visibles, pero fuera del flujo principal
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {unavailableVariants.map((variant) => {
                      const vk = variantKey(variant);
                      return (
                        <div
                          key={vk}
                          className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/10 px-3 py-2 text-xs opacity-75"
                        >
                          <span className="text-slate-800 dark:text-slate-200">{variantLabel(variant)}</span>
                          <span className="block text-slate-400 mt-0.5">{fmtUsd(variant.unitCostUsd)}</span>
                          <span className="block mt-0.5 text-amber-600 dark:text-amber-400">
                            Sin stock
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Este producto no tiene variantes registradas en CJ.
            </p>
          )}
        </div>
      )}

      {/* ══ SECCIÓN D — Configuración operativa + acciones ═══════════════════════ */}
      {(canRunPipeline || (selectedProduct && !productDetailLoading)) && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Configuración
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Cantidad
              <input
                type="number"
                min={1}
                className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Código postal destino (USA)
              <input
                className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
                value={destPostalCode}
                onChange={(e) => setDestPostalCode(e.target.value)}
              />
            </label>
          </div>

          {selectedProduct && !canRunPipeline && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {hasOperableVariants
                ? 'Selecciona una variante operable para continuar con preview, evaluate y draft.'
                : 'No hay una variante operable seleccionable en este producto. Usa el modo avanzado solo si necesitas revisar IDs manualmente.'}
            </p>
          )}

          {canRunPipeline && (
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 px-3 py-2 text-xs font-mono text-emerald-800 dark:text-emerald-200">
              productId: {productId} · variantId: {variantId}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loadingPreview || !canRunPipeline}
              className="rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-medium px-4 py-2 disabled:opacity-50"
              onClick={() => void runPreview()}
            >
              {loadingPreview ? 'Vista previa…' : 'Vista previa pricing'}
            </button>
            <button
              type="button"
              disabled={loadingEvaluate || !canRunPipeline}
              className="rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium px-4 py-2 disabled:opacity-50"
              onClick={() => void runEvaluate()}
            >
              {loadingEvaluate ? 'Evaluando…' : 'Evaluar y persistir'}
            </button>
            <button
              type="button"
              disabled={
                loadingDraft || evaluate?.decision !== 'APPROVED' || !canRunPipeline
              }
              className="rounded-lg border border-emerald-300 dark:border-emerald-700 text-sm font-medium px-4 py-2 text-emerald-800 dark:text-emerald-200 disabled:opacity-50"
              onClick={() => void runDraft()}
              title="Requiere última evaluación APPROVED para esta variante en BD"
            >
              {loadingDraft ? 'Draft…' : 'Crear draft listing'}
            </button>
          </div>

          {draftListingId != null && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Draft guardado: listing local #{draftListingId}.{' '}
              <Link to="/cj-ebay/listings" className="underline font-medium">
                Ir a Listings → Publicar
              </Link>
            </p>
          )}
        </div>
      )}

      {/* ══ SECCIÓN E — Modo avanzado / entrada manual de IDs ════════════════════ */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          onClick={() => setAdvancedOpen((o) => !o)}
          aria-expanded={advancedOpen}
        >
          <span>Modo avanzado / entrada manual de IDs</span>
          <span className="text-slate-400 text-xs">{advancedOpen ? '▲' : '▼'}</span>
        </button>
        {advancedOpen && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-4 space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Para debug, fallback operativo o cuando ya conoces los IDs técnicos CJ.
              Los campos actualizan directamente las variables del pipeline.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                productId (CJ)
                <input
                  className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  placeholder="identificador CJ del producto"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                variantId (vid o SKU)
                <input
                  className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  placeholder="vid preferido, o SKU como fallback"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                quantity
                <input
                  type="number"
                  min={1}
                  className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                destPostalCode (USA)
                <input
                  className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
                  value={destPostalCode}
                  onChange={(e) => setDestPostalCode(e.target.value)}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loadingPreview || !canRunPipeline}
                className="rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-medium px-4 py-2 disabled:opacity-50"
                onClick={() => void runPreview()}
              >
                {loadingPreview ? 'Vista previa…' : 'Vista previa pricing'}
              </button>
              <button
                type="button"
                disabled={loadingEvaluate || !canRunPipeline}
                className="rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium px-4 py-2 disabled:opacity-50"
                onClick={() => void runEvaluate()}
              >
                {loadingEvaluate ? 'Evaluando…' : 'Evaluar y persistir'}
              </button>
              <button
                type="button"
                disabled={
                  loadingDraft || evaluate?.decision !== 'APPROVED' || !canRunPipeline
                }
                className="rounded-lg border border-emerald-300 dark:border-emerald-700 text-sm font-medium px-4 py-2 text-emerald-800 dark:text-emerald-200 disabled:opacity-50"
                onClick={() => void runDraft()}
                title="Requiere última evaluación APPROVED para esta variante en BD"
              >
                {loadingDraft ? 'Draft…' : 'Crear draft listing'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
          {error}
        </div>
      )}

      {/* ══ Decision panel ════════════════════════════════════════════════════════ */}
      {evaluate && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Decisión</h2>
            <DecisionPill decision={evaluate.decision} />
            <span className="text-xs text-slate-500">riskScore: {evaluate.riskScore}</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            productDbId {evaluate.ids.productDbId} · variantDbId {evaluate.ids.variantDbId} ·
            shippingQuoteId {evaluate.ids.shippingQuoteId} · evaluationId {evaluate.ids.evaluationId}
          </p>
          <div>
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">Razones</h3>
            <ul className="space-y-2 text-sm">
              {evaluate.reasons.map((r) => (
                <li
                  key={`${r.code}-${r.message}`}
                  className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 px-3 py-2"
                >
                  <span className="font-mono text-xs text-slate-500">
                    {r.rule} · {r.code}
                  </span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span className="text-slate-700 dark:text-slate-300">{r.message}</span>
                  <span className="ml-2 text-xs uppercase text-slate-400">{r.severity}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ══ Pricing breakdown ════════════════════════════════════════════════════ */}
      {showBreakdown && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Desglose de pricing
          </h2>
          {'product' in showBreakdown && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium">{showBreakdown.product.title}</span>
              <span className="text-slate-400"> · </span>
              stock en vivo {showBreakdown.variant.stockLive}
              <span className="text-slate-400"> · </span>
              costo unitario{' '}
              {showBreakdown.variant.unitCostUsd != null
                ? fmtUsd(showBreakdown.variant.unitCostUsd)
                : '—'}
            </p>
          )}
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Envío CJ: {fmtUsd(showBreakdown.shipping.cost)} ({showBreakdown.shipping.method})
            {showBreakdown.shipping.estimatedDays != null
              ? ` · ~${showBreakdown.shipping.estimatedDays} d`
              : ' · plazo desconocido'}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <Row label="Costo proveedor (línea)" v={showBreakdown.breakdown.supplierCostUsd} />
            <Row label="Shipping" v={showBreakdown.breakdown.shippingUsd} />
            <Row label="Fee eBay (est.)" v={showBreakdown.breakdown.ebayFeeUsd} />
            <Row label="Fee pago (est.)" v={showBreakdown.breakdown.paymentFeeUsd} />
            <Row label="Buffer incidentes" v={showBreakdown.breakdown.incidentBufferUsd} />
            <Row label="Costo total @ list price" v={showBreakdown.breakdown.totalCostUsd} />
            <Row label="Precio lista (sugerido)" v={showBreakdown.breakdown.listPriceUsd} />
            <Row label="Utilidad neta" v={showBreakdown.breakdown.netProfitUsd} />
            <div className="sm:col-span-2">
              Margen neto:{' '}
              <span className="font-semibold tabular-nums">
                {fmtPct(showBreakdown.breakdown.netMarginPct)}
              </span>
            </div>
            <Row label="Precio sugerido" v={showBreakdown.breakdown.suggestedPriceUsd} />
            <Row label="Precio mínimo permitido" v={showBreakdown.breakdown.minimumAllowedPriceUsd} />
          </div>
          {Object.keys(showBreakdown.breakdown.feeDefaultsApplied || {}).length > 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
              Fees por defecto aplicados (configura cuenta):{' '}
              {JSON.stringify(showBreakdown.breakdown.feeDefaultsApplied)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
