import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, FileText, RefreshCw, Send, ShieldAlert, Trash2 } from 'lucide-react';

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
  imageCount?: number;
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

function normalizeTitleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(cj[a-z0-9]+|\d{8,}[a-z0-9]*)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleQualityIssues(title: string): string[] {
  const key = normalizeTitleKey(title);
  const words = key.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words);
  const genericTitles = new Set([
    'pet',
    'pet supplies',
    'pet product',
    'pet grooming brush',
    'pet feeding bowl',
    'pet water fountain',
    'pet travel carrier',
    'pet nail grooming tool',
    'adjustable pet collar',
    'adjustable dog leash',
    'dog harness',
    'cat enrichment toy',
    'dog enrichment toy',
    'pet enrichment toy',
    'dog comfort bed',
    'cat comfort bed',
  ]);
  const issues: string[] = [];
  if (!title.trim() || title.trim().length < 14) issues.push('titulo muy corto');
  if (words.length < 3) issues.push('titulo poco especifico');
  if (genericTitles.has(key)) issues.push('titulo generico');
  if (/\bcj[a-z0-9]{6,}\b/i.test(title) || /\b\d{10,}\b/.test(title)) issues.push('contiene codigo proveedor');
  if (uniqueWords.size > 0 && uniqueWords.size <= Math.ceil(words.length / 2) && words.length >= 6) {
    issues.push('repite palabras');
  }
  if (/\b(slave|bondage|bdsm|fetish|erotic|adult toys?|sex(y)?|lingerie|corset|mannequin)\b/i.test(title)) {
    issues.push('terminos no confiables');
  }
  return issues;
}

type ManualReadiness = {
  state: 'active' | 'draft' | 'ready' | 'review' | 'blocked';
  label: string;
  nextAction: string;
  reasons: string[];
  className: string;
};

function buildManualReadiness(row: ProductRow, duplicateTitleCount: number): ManualReadiness {
  const ev = row.evaluations[0] ?? null;
  const activeListing = row.listings.find((l) => l.status === 'ACTIVE');
  const verifiedActiveListing = row.listings.find((l) => l.status === 'ACTIVE' && l.publishTruth?.buyerFacingVerified);
  const draftListing = row.listings.find((l) => l.status === 'DRAFT');
  const linkedListing = row.listings.find((l) => Boolean(l.shopifyProductId));
  const reasons: string[] = [];

  if ((row.imageCount ?? 0) <= 0) reasons.push('sin imagenes');
  if (row.policy?.isPetProduct === false) reasons.push('no cumple politica pet');
  if (row.variants.length === 0) reasons.push('sin variantes');
  if (row.variants.length > 0 && row.variants.every((v) => Number(v.stockLastKnown ?? 0) <= 0)) reasons.push('sin stock vendible');
  if (duplicateTitleCount > 1) reasons.push('posible titulo duplicado');
  reasons.push(...titleQualityIssues(row.title));

  if (verifiedActiveListing) {
    return {
      state: 'active',
      label: 'Publicado OK',
      nextAction: 'Monitorear stock y margen',
      reasons: [],
      className: 'border-emerald-700/60 bg-emerald-950/35 text-emerald-200',
    };
  }

  if (activeListing || linkedListing) {
    return {
      state: 'review',
      label: 'Revisar Shopify',
      nextAction: 'Abrir Store Products',
      reasons: reasons.length ? reasons : ['listing vinculado sin verificacion buyer-ready'],
      className: 'border-amber-700/60 bg-amber-950/35 text-amber-200',
    };
  }

  if (draftListing) {
    return {
      state: reasons.length ? 'review' : 'draft',
      label: reasons.length ? 'Draft con alertas' : 'Draft listo',
      nextAction: reasons.length ? 'Corregir antes de publicar' : 'Publicar draft',
      reasons,
      className: reasons.length
        ? 'border-amber-700/60 bg-amber-950/35 text-amber-200'
        : 'border-sky-700/60 bg-sky-950/35 text-sky-200',
    };
  }

  if (reasons.length) {
    return {
      state: 'blocked',
      label: 'Bloqueado',
      nextAction: 'Corregir o eliminar',
      reasons,
      className: 'border-rose-700/60 bg-rose-950/35 text-rose-200',
    };
  }

  if (!ev) {
    return {
      state: 'review',
      label: 'Sin evaluar',
      nextAction: 'Recalcular',
      reasons: ['falta costo, envio y margen actual'],
      className: 'border-slate-700 bg-slate-900 text-slate-300',
    };
  }

  if (ev.decision === 'REJECTED') {
    return {
      state: 'blocked',
      label: 'No rentable',
      nextAction: 'Ver razones o eliminar',
      reasons: ['evaluacion rechazada'],
      className: 'border-rose-700/60 bg-rose-950/35 text-rose-200',
    };
  }

  if (ev.decision === 'PENDING') {
    return {
      state: 'review',
      label: 'Pendiente',
      nextAction: 'Recalcular',
      reasons: ['evaluacion incompleta'],
      className: 'border-amber-700/60 bg-amber-950/35 text-amber-200',
    };
  }

  return {
    state: 'ready',
    label: 'Listo para draft',
    nextAction: 'Preparar draft',
    reasons: [],
    className: 'border-emerald-700/60 bg-emerald-950/35 text-emerald-200',
  };
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
  const duplicateTitleCounts = products.reduce((map, product) => {
    const key = normalizeTitleKey(product.title);
    if (key) map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const readinessRows = products.map((product) =>
    buildManualReadiness(product, duplicateTitleCounts.get(normalizeTitleKey(product.title)) ?? 0),
  );
  const readinessTotals = {
    ready: readinessRows.filter((row) => row.state === 'ready').length,
    draft: readinessRows.filter((row) => row.state === 'draft').length,
    review: readinessRows.filter((row) => row.state === 'review').length,
    blocked: readinessRows.filter((row) => row.state === 'blocked').length,
    active: readinessRows.filter((row) => row.state === 'active').length,
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

      <div className="grid gap-3 md:grid-cols-5">
        {[
          { label: 'Listos para draft', val: readinessTotals.ready, cls: 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200' },
          { label: 'Draft listo', val: readinessTotals.draft, cls: 'border-sky-700/60 bg-sky-950/30 text-sky-200' },
          { label: 'Requieren revisar', val: readinessTotals.review, cls: 'border-amber-700/60 bg-amber-950/30 text-amber-200' },
          { label: 'Bloqueados', val: readinessTotals.blocked, cls: 'border-rose-700/60 bg-rose-950/30 text-rose-200' },
          { label: 'Publicados OK', val: readinessTotals.active, cls: 'border-teal-700/60 bg-teal-950/30 text-teal-200' },
        ].map((item) => (
          <div key={item.label} className={`rounded-lg border px-3 py-2 ${item.cls}`}>
            <p className="text-[11px] uppercase tracking-wide opacity-80">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{item.val}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-sky-800/70 bg-sky-950/25 px-4 py-3 text-xs text-sky-100">
        Ciclo manual recomendado: <strong>1. Recalcular</strong> confirma costo, stock, envio y margen; <strong>2. Preparar draft</strong> solo si pasa calidad comercial; <strong>3. Publicar draft</strong> envia a Shopify y canales; <strong>4. Store Products</strong> confirma buyer-ready. Los bloqueos de calidad son intencionales para evitar productos duplicados, sin imagenes, no-pet o con titulos que generen desconfianza.
      </div>

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
                <th className="px-3 py-2">Calidad manual</th>
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
                const readiness = buildManualReadiness(row, duplicateTitleCounts.get(normalizeTitleKey(row.title)) ?? 0);

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
                      <td className="px-3 py-2 min-w-[180px]">
                        <div className={`rounded-md border px-2.5 py-2 text-xs ${readiness.className}`}>
                          <div className="flex items-center gap-1.5 font-semibold">
                            {readiness.state === 'blocked' ? (
                              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : readiness.state === 'active' || readiness.state === 'ready' || readiness.state === 'draft' ? (
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            {readiness.label}
                          </div>
                          <p className="mt-1 opacity-80">{readiness.nextAction}</p>
                          {readiness.reasons.length > 0 && (
                            <p className="mt-1 line-clamp-2 opacity-90" title={readiness.reasons.join(' · ')}>
                              {readiness.reasons.slice(0, 2).join(' · ')}
                            </p>
                          )}
                        </div>
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
                            {busyId === row.id ? '...' : 'Preparar'}
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
                            {busyId === row.id ? '...' : 'Publicar'}
                          </button>
                        )}
                        {draftListing && (
                          <Link
                            to="/cj-shopify-usa/listings"
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Ver en tienda
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
                          title="Volver a calcular stock, costo, envío y margen con datos actuales de CJ"
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-40 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-300"
                          onClick={() => void reEvaluateProduct(row)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          {busyId === row.id ? '...' : 'Recalcular'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id || hasBlockingListing}
                          title={hasBlockingListing ? 'Primero elimina u oculta el producto vinculado desde Store Products/Shopify.' : 'Eliminar artículo'}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40"
                          onClick={() => void deleteProduct(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {busyId === row.id ? '...' : 'Eliminar local'}
                        </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr className="bg-slate-50/90 dark:bg-slate-950/50">
                        <td colSpan={9} className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 space-y-2">
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
                          <div>
                            <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">Checklist manual</p>
                            <div className="grid gap-2 md:grid-cols-3">
                              {[
                                { label: 'Imagenes', ok: (row.imageCount ?? 0) > 0, detail: `${row.imageCount ?? 0}` },
                                { label: 'Politica pet', ok: row.policy?.isPetProduct !== false, detail: row.policy?.isPetProduct === false ? 'bloqueado' : 'OK' },
                                { label: 'Titulo comercial', ok: titleQualityIssues(row.title).length === 0, detail: titleQualityIssues(row.title).join(', ') || 'OK' },
                                { label: 'Stock', ok: row.variants.some((v) => Number(v.stockLastKnown ?? 0) > 0), detail: `${row.variants.reduce((sum, v) => sum + Number(v.stockLastKnown ?? 0), 0)}` },
                                { label: 'Duplicados', ok: (duplicateTitleCounts.get(normalizeTitleKey(row.title)) ?? 0) <= 1, detail: `${duplicateTitleCounts.get(normalizeTitleKey(row.title)) ?? 0}` },
                                { label: 'Margen', ok: ev?.decision === 'APPROVED', detail: ev ? `${ev.decision} / ${pct(ev.estimatedMarginPct)}` : 'sin evaluar' },
                              ].map((item) => (
                                <div
                                  key={item.label}
                                  className={`rounded-md border px-3 py-2 ${item.ok ? 'border-emerald-800/60 bg-emerald-950/20 text-emerald-200' : 'border-rose-800/60 bg-rose-950/20 text-rose-200'}`}
                                >
                                  <p className="font-semibold">{item.ok ? 'OK' : 'Revisar'} · {item.label}</p>
                                  <p className="mt-0.5 text-[11px] opacity-80">{item.detail}</p>
                                </div>
                              ))}
                            </div>
                          </div>
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
