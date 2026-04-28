import { Fragment, useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Archive, ExternalLink, Eye, GitMerge, Pause, Send } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ListingRow = {
  id: number;
  status: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  shopifyHandle: string | null;
  quantity: number | null;
  storefrontUrl: string | null;
  publishTruth?: {
    reconciledAt?: string;
    shopifyIdentifiersPresent: boolean;
    buyerFacingVerified: boolean;
    readyForStorefront?: boolean;
    reasons?: string[];
    shopify?: {
      exists: boolean | null;
      adminStatus: string | null;
      publishedOnPublication: boolean | null;
      publicationName: string | null;
      inventoryQuantity: number | null;
      handle: string | null;
    };
    storefront?: {
      status: number | null;
      finalUrl: string | null;
      passwordGate: boolean | null;
      hasAddToCart: boolean | null;
      hasPrice: boolean | null;
      error: string | null;
    };
  };
  listedPriceUsd: number | null;
  publishedAt: string | null;
  lastError: string | null;
  draftPayload?: {
    cjProductId?: string | null;
    cjSku?: string | null;
    cjVid?: string | null;
    title?: string | null;
    handle?: string | null;
    descriptionHtml?: string | null;
    images?: string[];
    quantity?: number | null;
    pricingSnapshot?: {
      supplierCostUsd?: number | null;
      shippingCostUsd?: number | null;
      paymentProcessingFeeUsd?: number | null;
      incidentBufferUsd?: number | null;
      targetProfitUsd?: number | null;
      netProfitUsd?: number | null;
      netMarginPct?: number | null;
      suggestedSellPriceUsd?: number | null;
    };
    shippingSnapshot?: {
      amountUsd?: number | null;
      serviceName?: string | null;
      carrier?: string | null;
      estimatedMinDays?: number | null;
      estimatedMaxDays?: number | null;
      originCountryCode?: string | null;
    } | null;
    variantAttributes?: Record<string, string>;
  } | null;
  updatedAt: string;
  product: { id: number; cjProductId: string; title: string } | null;
  variant: {
    id: number;
    cjSku: string | null;
    cjVid: string | null;
    stockLastKnown?: number | null;
    unitCostUsd?: number | string | null;
  } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  DRAFT:             'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  PUBLISHING:        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  ACTIVE:            'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  FAILED:            'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  PAUSED:            'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ARCHIVED:          'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
  RECONCILE_PENDING: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  RECONCILE_FAILED:  'bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-200',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT:             'Draft',
  PUBLISHING:        'Publicando…',
  ACTIVE:            'Shopify Active verificado',
  FAILED:            'Fallido',
  PAUSED:            'Pausado',
  ARCHIVED:          'Shopify Archivado',
  RECONCILE_PENDING: 'Shopify no buyer-ready',
  RECONCILE_FAILED:  'Reconciliación fallida',
};

function statusBadge(row: ListingRow): string {
  if (row.status === 'ACTIVE' && !row.publishTruth?.buyerFacingVerified) {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  }
  return STATUS_BADGE[row.status] ?? 'bg-slate-100 text-slate-700';
}

function statusLabel(row: ListingRow): string {
  if (row.status === 'ACTIVE' && !row.publishTruth?.buyerFacingVerified) {
    return 'Shopify Active no verificado';
  }
  return STATUS_LABEL[row.status] ?? row.status;
}

function truthSummary(row: ListingRow): string {
  const truth = row.publishTruth;
  const admin = truth?.shopify?.adminStatus ?? '—';
  const publication =
    truth?.shopify?.publishedOnPublication == null
      ? 'pub: —'
      : truth.shopify.publishedOnPublication
        ? 'pub: OK'
        : 'pub: NO';
  const inventory =
    truth?.shopify?.inventoryQuantity == null
      ? 'stock: —'
      : `stock: ${truth.shopify.inventoryQuantity}`;
  return `${admin} / ${publication} / ${inventory}`;
}

function usd(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Number(n).toFixed(2)}%`;
}

function htmlPreview(html: string | null | undefined): string {
  const text = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

function reconciliationReasonText(reason: string): string {
  if (reason === 'No Shopify product id is stored for this listing yet.') {
    return 'Draft interno: aún no se ha creado el producto en Shopify. Presiona Publicar para enviarlo.';
  }
  return reason;
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjShopifyUsaListingsPage() {
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; listings: ListingRow[] }>('/api/cj-shopify-usa/listings');
      if (res.data?.ok && Array.isArray(res.data.listings)) {
        setListings(res.data.listings);
      }
    } catch (e) {
      setError(axiosMsg(e, 'No se pudieron cargar los listings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function withAction(
    id: number,
    fn: () => Promise<string | undefined>,
    errorMsg: string,
  ) {
    setBusyId(id);
    setError(null);
    setActionMsg(null);
    try {
      const msg = await fn();
      if (msg) setActionMsg(msg);
      await load();
    } catch (e) {
      setError(axiosMsg(e, errorMsg));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const publish = (id: number) =>
    withAction(
      id,
      async () => {
        await api.post('/api/cj-shopify-usa/listings/publish', { listingId: id });
        return 'Publicación iniciada.';
      },
      'Error al publicar.',
    );

  const pauseListing = (id: number) =>
    withAction(
      id,
      async () => {
        await api.post(`/api/cj-shopify-usa/listings/${id}/pause`);
        return 'Publicación pausada.';
      },
      'Error al pausar la publicación.',
    );

  async function unpublishListing(id: number) {
    const confirmed = window.confirm(
      '¿Despublicar este artículo de Shopify?\n\nSe quitará del canal de venta y quedará archivado en Shopify.',
    );
    if (!confirmed) return;
    await withAction(
      id,
      async () => {
        await api.post(`/api/cj-shopify-usa/listings/${id}/unpublish`);
        return 'Artículo despublicado.';
      },
      'Error al despublicar el artículo.',
    );
  }

  async function expandVariants(id: number) {
    const confirmed = window.confirm(
      '¿Ampliar variantes de este producto?\n\nSe agregarán TODAS las variantes disponibles de CJ (colores, tallas, etc.) al producto de Shopify y el cliente podrá elegir cuál quiere comprar.',
    );
    if (!confirmed) return;
    await withAction(
      id,
      async () => {
        const res = await api.post<{ ok: boolean; message: string }>(
          `/api/cj-shopify-usa/listings/${id}/expand-variants`,
        );
        return res.data.message ?? 'Variantes ampliadas correctamente.';
      },
      'Error al ampliar variantes.',
    );
  }

  const hasFailed = listings.some((l) => l.status === 'FAILED');
  const hasReconcilePending = listings.some((l) => l.status === 'RECONCILE_PENDING');
  const hasReconcileFailed = listings.some((l) => l.status === 'RECONCILE_FAILED');

  const draftListings = listings.filter(
    (l) => !['PUBLISHING', 'ACTIVE'].includes(l.status),
  );

  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  async function resyncReconcile() {
    setResyncing(true);
    setError(null);
    try {
      await api.post('/api/cj-shopify-usa/listings/reconcile');
      setActionMsg('Re-sincronización iniciada. Recarga en unos segundos para ver el estado actualizado.');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al re-sincronizar');
    } finally { setResyncing(false); }
  }

  async function publishAllDrafts() {
    if (draftListings.length === 0) return;
    setBulkPublishing(true);
    setError(null);
    setActionMsg(null);
    let ok = 0;
    const failedIds: number[] = [];
    for (const listing of draftListings) {
      try {
        await api.post('/api/cj-shopify-usa/listings/publish', { listingId: listing.id });
        ok++;
      } catch {
        failedIds.push(listing.id);
      }
    }
    await load();
    setBulkPublishing(false);
    if (failedIds.length > 0) {
      setError(`${failedIds.length} listings fallaron al publicar: IDs ${failedIds.join(', ')}. Revisa el detalle de cada uno.`);
    }
    setActionMsg(
      `Publicación masiva completada: ${ok} publicados${failedIds.length > 0 ? `, ${failedIds.length} fallidos (ver arriba)` : ' — todos OK ✓'}.`,
    );
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando store products…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Productos en tu tienda Shopify. Drafts listos para publicar, listings activos y su estado de sincronización.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={resyncing}
            onClick={() => void resyncReconcile()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition"
          >
            {resyncing ? '…' : '🔄 Re-sync Shopify'}
          </button>
          {draftListings.length > 0 && (
            <button
              type="button"
              disabled={bulkPublishing}
              onClick={() => void publishAllDrafts()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-3 py-1.5 text-sm font-semibold transition"
            >
              {bulkPublishing ? '…publicando' : `Publicar todos (${draftListings.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Status banners */}
      {hasFailed && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-900 dark:text-red-100 space-y-1">
          <p className="font-semibold">Listings fallidos — acción requerida</p>
          <p>Uno o más listings tienen estado <strong>FAILED</strong>. Revisar el error en Detalle y reintentar publicar.</p>
        </div>
      )}
      {hasReconcilePending && (
        <div className="rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 px-4 py-3 text-sm text-violet-900 dark:text-violet-100 space-y-1">
          <p className="font-semibold">Shopify no está buyer-ready</p>
          <p>Uno o más productos existen en Shopify pero no pasan toda la verdad actual: estado Admin, publicación, inventario o storefront.</p>
        </div>
      )}
      {hasReconcileFailed && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-900 dark:text-red-100 space-y-1">
          <p className="font-semibold">Reconciliación fallida — verificar en Shopify Admin</p>
          <p>El sistema no pudo confirmar el ID del producto en Shopify. Verificar manualmente en el panel de Shopify.</p>
        </div>
      )}

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

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/80 text-left text-xs font-medium text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Precio</th>
              <th className="px-3 py-2">SKU CJ</th>
              <th className="px-3 py-2">Shopify ID</th>
              <th className="px-3 py-2">Shopify truth</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {listings.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500 text-sm">
                  Sin listings. Ve a <strong>Products</strong>, selecciona un producto APPROVED y crea un draft.
                </td>
              </tr>
            ) : (
              listings.map((row) => {
                const draft = row.draftPayload ?? null;
                const pricing = draft?.pricingSnapshot;
                const shipping = draft?.shippingSnapshot;
                const draftImages = Array.isArray(draft?.images) ? draft.images.slice(0, 4) : [];
                const descriptionPreview = htmlPreview(draft?.descriptionHtml);
                const canPublish = !['PUBLISHING', 'ACTIVE'].includes(row.status);
                const canPause =
                  Boolean(row.shopifyProductId) &&
                  !['DRAFT', 'PUBLISHING', 'PAUSED', 'ARCHIVED'].includes(row.status);
                const canUnpublish =
                  Boolean(row.shopifyProductId) &&
                  !['DRAFT', 'PUBLISHING', 'ARCHIVED'].includes(row.status);

                return (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                    <td className="px-3 py-2 font-mono tabular-nums text-xs">{row.id}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadge(row)}`}>
                        {statusLabel(row)}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[180px]">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100 text-xs" title={row.product?.title}>
                        {row.product?.title ?? '—'}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">{row.product?.cjProductId ?? ''}</p>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-xs">{usd(row.listedPriceUsd)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.variant?.cjSku ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.shopifyProductId ? (
                        <span className="font-mono text-slate-600 dark:text-slate-400" title={row.shopifyProductId}>
                          {row.shopifyProductId.slice(-8)}…
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{truthSummary(row)}</td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-[360px] flex-wrap items-center gap-1.5">
                        {canPublish && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-primary-800/70 dark:bg-primary-950/30 dark:text-primary-300 dark:hover:bg-primary-900/40"
                            onClick={() => void publish(row.id)}
                          >
                            <Send className="h-3.5 w-3.5" aria-hidden="true" />
                            {busyId === row.id ? '…' : 'Publicar'}
                          </button>
                        )}
                        {canPause && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
                            onClick={() => void pauseListing(row.id)}
                          >
                            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                            {busyId === row.id ? '…' : 'Pausar'}
                          </button>
                        )}
                        {canUnpublish && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40"
                            onClick={() => void unpublishListing(row.id)}
                          >
                            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                            {busyId === row.id ? '…' : 'Despublicar'}
                          </button>
                        )}
                        {row.status === 'ACTIVE' && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            title="Agregar todas las variantes CJ (colores, tallas) al producto de Shopify"
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-violet-800/70 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40"
                            onClick={() => void expandVariants(row.id)}
                          >
                            <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
                            {busyId === row.id ? '…' : 'Ampliar variantes'}
                          </button>
                        )}
                        {row.status === 'ACTIVE' && row.storefrontUrl && row.publishTruth?.buyerFacingVerified && (
                          <a
                            href={row.storefrontUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Ver tienda
                          </a>
                        )}
                        <button
                          type="button"
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          {expandedId === row.id ? 'Ocultar' : 'Detalle'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <tr className="bg-slate-50/90 dark:bg-slate-950/50">
                      <td colSpan={8} className="px-4 py-4 text-xs text-slate-600 dark:text-slate-400">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
                          <div className="space-y-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-500">Draft interno</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {draft?.title || row.product?.title || 'Producto sin título'}
                              </p>
                              {descriptionPreview && (
                                <p className="mt-1 max-w-4xl leading-5 text-slate-600 dark:text-slate-400">
                                  {descriptionPreview}
                                </p>
                              )}
                            </div>

                            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                              <p><strong>Precio venta:</strong> {usd(pricing?.suggestedSellPriceUsd ?? row.listedPriceUsd)}</p>
                              <p><strong>Costo CJ:</strong> {usd(pricing?.supplierCostUsd ?? Number(row.variant?.unitCostUsd ?? 0))}</p>
                              <p><strong>Envío:</strong> {usd(pricing?.shippingCostUsd ?? shipping?.amountUsd)}</p>
                              <p><strong>Fee pago:</strong> {usd(pricing?.paymentProcessingFeeUsd)}</p>
                              <p><strong>Buffer:</strong> {usd(pricing?.incidentBufferUsd)}</p>
                              <p><strong>Profit neto:</strong> {usd(pricing?.netProfitUsd)}</p>
                              <p><strong>Margen neto:</strong> {pct(pricing?.netMarginPct)}</p>
                              <p><strong>Profit objetivo:</strong> {usd(pricing?.targetProfitUsd)}</p>
                              <p><strong>Cantidad draft:</strong> {draft?.quantity ?? row.quantity ?? '—'}</p>
                              <p><strong>Stock CJ:</strong> {row.variant?.stockLastKnown ?? '—'}</p>
                              <p><strong>Servicio envío:</strong> {shipping?.serviceName ?? '—'}</p>
                              <p><strong>Origen envío:</strong> {shipping?.originCountryCode ?? '—'}</p>
                              <p><strong>Entrega estimada:</strong> {shipping?.estimatedMaxDays ? `${shipping.estimatedMaxDays} días` : '—'}</p>
                              <p><strong>SKU CJ:</strong> <span className="font-mono">{draft?.cjSku ?? row.variant?.cjSku ?? '—'}</span></p>
                              <p><strong>CJ Variant ID:</strong> <span className="font-mono">{draft?.cjVid ?? row.variant?.cjVid ?? '—'}</span></p>
                              <p className="sm:col-span-2 lg:col-span-3"><strong>Handle previsto:</strong> <span className="font-mono">{draft?.handle ?? row.shopifyHandle ?? '—'}</span></p>
                            </div>

                            {draftImages.length > 0 && (
                              <div className="flex gap-2 pt-1">
                                {draftImages.map((src) => (
                                  <img
                                    key={src}
                                    src={src}
                                    alt=""
                                    className="h-14 w-14 rounded border border-slate-200 object-cover dark:border-slate-700"
                                    loading="lazy"
                                  />
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-1 rounded border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                            <p className="mb-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-500">Verdad Shopify</p>
                            <p><strong>Estado Ivan reconciliado:</strong> {row.status}</p>
                            <p><strong>Shopify Admin status:</strong> {row.publishTruth?.shopify?.adminStatus ?? '—'}</p>
                            <p><strong>Shopify existe:</strong> {row.publishTruth?.shopify?.exists == null ? '—' : row.publishTruth.shopify.exists ? 'Sí' : 'No'}</p>
                            <p><strong>Publication:</strong> {row.publishTruth?.shopify?.publicationName ?? '—'} / {row.publishTruth?.shopify?.publishedOnPublication == null ? '—' : row.publishTruth.shopify.publishedOnPublication ? 'Publicado' : 'No publicado'}</p>
                            <p><strong>Inventory available:</strong> {row.publishTruth?.shopify?.inventoryQuantity ?? '—'}</p>
                            <p><strong>Shopify Product ID:</strong> {row.shopifyProductId ?? '—'}</p>
                            <p><strong>Shopify Variant ID:</strong> {row.shopifyVariantId ?? '—'}</p>
                            <p><strong>Handle Shopify:</strong> {row.shopifyHandle ?? '—'}</p>
                            <p><strong>Storefront URL:</strong> {row.storefrontUrl ?? '—'}</p>
                            <p><strong>Buyer-facing:</strong> {row.publishTruth?.buyerFacingVerified ? 'OK' : 'No verificado'}</p>
                            <p><strong>Última publicación verificada:</strong> {fmtDate(row.publishedAt)}</p>
                            <p><strong>Reconciliado:</strong> {fmtDate(row.publishTruth?.reconciledAt ?? null)}</p>
                            <p><strong>Actualizado:</strong> {fmtDate(row.updatedAt)}</p>
                          </div>
                        </div>
                        {row.publishTruth?.reasons && row.publishTruth.reasons.length > 0 && (
                          <div className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 mt-1">
                            <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">Razones de reconciliación</p>
                            <ul className="list-disc pl-4 space-y-1">
                              {row.publishTruth.reasons.map((reason) => <li key={reason}>{reconciliationReasonText(reason)}</li>)}
                            </ul>
                          </div>
                        )}
                        {row.lastError && (
                          <div className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 mt-1">
                            <p className="font-medium text-red-800 dark:text-red-200 mb-1">Último error</p>
                            <pre className="whitespace-pre-wrap text-red-700 dark:text-red-300">{row.lastError}</pre>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
