import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Eye, FileText, Send, ShieldAlert, Trash2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Evaluation = {
  id: number;
  decision: 'APPROVED' | 'REJECTED' | 'PENDING';
  estimatedMarginPct: number | null;
  reasons: unknown;
  evaluatedAt: string;
};

type Variant = {
  id: number;
  cjSku: string | null;
  cjVid: string | null;
  unitCostUsd: number | null;
  stockLastKnown: number | null;
  stockCheckedAt: string | null;
};

type ListingRef = {
  id: number;
  status: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  shopifyHandle: string | null;
  storefrontUrl: string | null;
  publishTruth?: {
    shopifyIdentifiersPresent: boolean;
    buyerFacingVerified: boolean;
    readyForStorefront?: boolean;
    shopify?: {
      exists: boolean | null;
      adminStatus: string | null;
      publishedOnPublication: boolean | null;
      inventoryQuantity: number | null;
    };
  };
};

type ProductRow = {
  id: number;
  cjProductId: string;
  title: string;
  snapshotStatus: string;
  lastSyncedAt: string | null;
  updatedAt: string;
  variants: Variant[];
  evaluations: Evaluation[];
  listings: ListingRef[];
  policy?: {
    isPetProduct: boolean;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const DECISION_BADGE: Record<string, string> = {
  APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  PENDING:  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const DECISION_LABEL: Record<string, string> = {
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  PENDING:  'Pendiente',
};

function usd(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Number(n).toFixed(1)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function axiosMsg(e: unknown, fb: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fb;
  }
  return e instanceof Error ? e.message : fb;
}

function listingTruthLabel(listing: ListingRef): string {
  const admin = listing.publishTruth?.shopify?.adminStatus ?? listing.status;
  const stock = listing.publishTruth?.shopify?.inventoryQuantity;
  const pub = listing.publishTruth?.shopify?.publishedOnPublication;
  const pubText = pub == null ? 'pub —' : pub ? 'pub OK' : 'pub NO';
  const stockText = stock == null ? 'stock —' : `stock ${stock}`;
  return `${admin} / ${pubText} / ${stockText}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjShopifyUsaProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [filterDecision, setFilterDecision] = useState<string>('ALL');

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; products: ProductRow[] }>('/api/cj-shopify-usa/products');
      if (res.data?.ok && Array.isArray(res.data.products)) {
        setProducts(res.data.products);
      }
    } catch (e) {
      setError(axiosMsg(e, 'No se pudieron cargar los productos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createDraft(product: ProductRow) {
    setBusyId(product.id);
    setActionMsg(null);
    setError(null);
    try {
      const firstVariant = product.variants[0];
      const res = await api.post<{ ok: boolean; listing: { id: number; status: string } }>(
        '/api/cj-shopify-usa/listings/draft',
        {
          productId: String(product.id),
          variantId: firstVariant ? String(firstVariant.id) : undefined,
          quantity: 1,
        },
      );
      if (res.data?.ok) {
        setActionMsg(`Draft creado (listing #${res.data.listing.id}). Ve a Store Products para publicar.`);
        await load();
      }
    } catch (e) {
      setError(axiosMsg(e, 'Error al crear draft.'));
    } finally {
      setBusyId(null);
    }
  }

  async function publishDraft(listingId: number, productId: number) {
    setBusyId(productId);
    setActionMsg(null);
    setError(null);
    try {
      await api.post('/api/cj-shopify-usa/listings/publish', { listingId });
      setActionMsg(`Publicación iniciada para listing #${listingId}. Revisa Store Products para el estado final.`);
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'Error al publicar draft.'));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function reEvaluateProduct(product: ProductRow) {
    setBusyId(product.id);
    setActionMsg(null);
    setError(null);
    try {
      await api.post(`/api/cj-shopify-usa/products/${product.id}/re-evaluate`);
      setActionMsg(`Re-evaluación completada: ${product.title}`);
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'Error al re-evaluar.'));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProduct(product: ProductRow) {
    const confirmed = window.confirm(
      `Eliminar "${product.title}" del catálogo CJ Shopify USA?\n\nEsta acción borra el artículo local y sus drafts no publicados.`,
    );
    if (!confirmed) return;

    setBusyId(product.id);
    setActionMsg(null);
    setError(null);
    try {
      await api.delete(`/api/cj-shopify-usa/products/${product.id}`);
      setActionMsg(`Artículo eliminado: ${product.title}`);
      if (expandedId === product.id) setExpandedId(null);
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'Error al eliminar el artículo.'));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const filtered = products.filter((p) => {
    if (filterDecision === 'ALL') return true;
    if (filterDecision === 'NO_EVAL') return p.evaluations.length === 0;
    const ev = p.evaluations[0];
    return ev?.decision === filterDecision;
  });

  const totals = {
    total: products.length,
    approved: products.filter((p) => p.evaluations[0]?.decision === 'APPROVED').length,
    rejected: products.filter((p) => p.evaluations[0]?.decision === 'REJECTED').length,
    pending: products.filter((p) => p.evaluations[0]?.decision === 'PENDING').length,
    noEval: products.filter((p) => p.evaluations.length === 0).length,
  };

  if (loading) return <p className="text-sm text-slate-500">Cargando productos CJ…</p>;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 text-sm">
        {[
          { label: 'Total', val: totals.total, key: 'ALL', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
          { label: 'Aprobados', val: totals.approved, key: 'APPROVED', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
          { label: 'Rechazados', val: totals.rejected, key: 'REJECTED', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
          { label: 'Pendiente', val: totals.pending, key: 'PENDING', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
          { label: 'Sin evaluar', val: totals.noEval, key: 'NO_EVAL', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
        ].map(({ label, val, key, cls }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterDecision(key)}
            className={`rounded-full px-3 py-1 font-medium transition-opacity ${cls} ${filterDecision === key ? 'ring-2 ring-offset-1 ring-slate-400' : 'opacity-80 hover:opacity-100'}`}
          >
            {label}: {val}
          </button>
        ))}
      </div>

      {actionMsg && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
          {actionMsg}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-6 py-10 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {products.length === 0
              ? 'No hay productos CJ importados. Usa la sección Descubrir para añadir productos.'
              : 'No hay productos con ese filtro.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-left text-xs font-medium text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Producto CJ</th>
                <th className="px-3 py-2">Variantes</th>
                <th className="px-3 py-2">Evaluación</th>
                <th className="px-3 py-2">Margen</th>
                <th className="px-3 py-2">Listings</th>
                <th className="px-3 py-2">Sync</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const ev = row.evaluations[0] ?? null;
                const activeListing = row.listings.find((l) => l.status === 'ACTIVE');
                const verifiedActiveListing = row.listings.find((l) => l.status === 'ACTIVE' && l.publishTruth?.buyerFacingVerified);
                const hasDraft = row.listings.some((l) => l.status === 'DRAFT');
                const draftListing = row.listings.find((l) => l.status === 'DRAFT') ?? null;
                const hasShopifyLinkedListing = row.listings.some((l) => Boolean(l.shopifyProductId));
                const hasBlockingListing = Boolean(activeListing) || hasShopifyLinkedListing;
                const policyBlocked = row.policy?.isPetProduct === false;
                const canDraft = ev?.decision === 'APPROVED' && !policyBlocked && !hasDraft && !activeListing && !hasShopifyLinkedListing;

                return (
                  <>
                    <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-mono tabular-nums text-xs">{row.id}</td>
                      <td className="px-3 py-2 max-w-[200px]">
                        <p className="truncate font-medium text-slate-900 dark:text-slate-100" title={row.title}>
                          {row.title}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">{row.cjProductId}</p>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.variants.length}</td>
                      <td className="px-3 py-2">
                        {ev ? (
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${DECISION_BADGE[ev.decision] ?? ''}`}>
                            {DECISION_LABEL[ev.decision] ?? ev.decision}
                          </span>
                        ) : policyBlocked ? (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            Fuera pet
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Sin evaluar</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs">{pct(ev?.estimatedMarginPct)}</td>
                      <td className="px-3 py-2 text-xs">
                        {row.listings.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className="tabular-nums">
                            {row.listings.length} ({row.listings.filter((l) => l.status === 'ACTIVE' && l.publishTruth?.buyerFacingVerified).length} buyer-ready)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">{fmtDate(row.lastSyncedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex min-w-[260px] flex-wrap items-center gap-1.5">
                        {canDraft && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-primary-800/70 dark:bg-primary-950/30 dark:text-primary-300 dark:hover:bg-primary-900/40"
                            onClick={() => void createDraft(row)}
                          >
                            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                            {busyId === row.id ? '…' : 'Crear draft'}
                          </button>
                        )}
                        {draftListing && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-violet-800/70 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40"
                            onClick={() => void publishDraft(draftListing.id, row.id)}
                          >
                            <Send className="h-3.5 w-3.5" aria-hidden="true" />
                            {busyId === row.id ? '…' : 'Publicar draft'}
                          </button>
                        )}
                        {draftListing && (
                          <Link
                            to="/cj-shopify-usa/listings"
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Store Products
                          </Link>
                        )}
                        {verifiedActiveListing && (
                          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Shopify buyer-ready
                          </span>
                        )}
                        {activeListing && !verifiedActiveListing && (
                          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-medium text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-300">
                            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                            Shopify no verificado
                          </span>
                        )}
                        {!activeListing && hasShopifyLinkedListing && (
                          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-medium text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-300">
                            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                            Revisar truth
                          </span>
                        )}
                        <button
                          type="button"
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          {expandedId === row.id ? 'Ocultar' : 'Detalle'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          title="Re-evaluar márgenes con precios actuales de CJ"
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-40 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-300"
                          onClick={() => void reEvaluateProduct(row)}
                        >
                          🔄 {busyId === row.id ? '…' : 'Re-evaluar'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id || hasBlockingListing}
                          title={hasBlockingListing ? 'Primero elimina u oculta el producto vinculado desde Store Products/Shopify.' : 'Eliminar artículo'}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40"
                          onClick={() => void deleteProduct(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {busyId === row.id ? '…' : 'Eliminar'}
                        </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr className="bg-slate-50/90 dark:bg-slate-950/50">
                        <td colSpan={8} className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 space-y-2">
                          {ev && (
                            <div>
                              <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">Última evaluación</p>
                              <p>Decisión: <strong>{ev.decision}</strong> — Margen: {pct(ev.estimatedMarginPct)}</p>
                              {ev.reasons != null && (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-slate-500">Ver razones</summary>
                                  <pre className="whitespace-pre-wrap text-xs mt-1 bg-slate-100 dark:bg-slate-900 rounded p-2">
                                    {JSON.stringify(ev.reasons as Record<string, unknown>, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          )}
                          {row.variants.length > 0 && (
                            <div>
                              <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">Variantes ({row.variants.length})</p>
                              <div className="space-y-1">
                                {row.variants.map((v) => (
                                  <p key={v.id} className="font-mono">
                                    SKU: {v.cjSku ?? '—'} | VID: {v.cjVid ?? '—'} | Costo: {usd(v.unitCostUsd)} | Stock: {v.stockLastKnown ?? '?'}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                          {row.listings.length > 0 && (
                            <div>
                              <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">Shopify truth ({row.listings.length})</p>
                              <div className="space-y-1">
                                {row.listings.map((listing) => (
                                  <p key={listing.id} className="font-mono">
                                    #{listing.id}: {listingTruthLabel(listing)} | Handle: {listing.shopifyHandle ?? '—'}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
