import { Fragment, useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type ListingRow = {
  id: number;
  status: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  shopifyHandle: string | null;
  listedPriceUsd: number | null;
  publishedAt: string | null;
  lastError: string | null;
  updatedAt: string;
  product: { id: number; cjProductId: string; title: string } | null;
  variant: { id: number; cjSku: string | null; cjVid: string | null } | null;
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
  ACTIVE:            'Activo',
  FAILED:            'Fallido',
  PAUSED:            'Pausado',
  ARCHIVED:          'Archivado',
  RECONCILE_PENDING: 'Reconciliación pendiente',
  RECONCILE_FAILED:  'Reconciliación fallida',
};

function usd(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${Number(n).toFixed(2)}`;
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

  async function publish(id: number) {
    setBusyId(id);
    setError(null);
    setActionMsg(null);
    try {
      await api.post('/api/cj-shopify-usa/listings/publish', { listingId: id });
      setActionMsg('Publicación iniciada.');
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'Error al publicar.'));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const hasFailed = listings.some((l) => l.status === 'FAILED');
  const hasReconcilePending = listings.some((l) => l.status === 'RECONCILE_PENDING');
  const hasReconcileFailed = listings.some((l) => l.status === 'RECONCILE_FAILED');

  if (loading) return <p className="text-sm text-slate-500">Cargando store products…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Productos en tu tienda Shopify. Drafts listos para publicar, listings activos y su estado de sincronización.
      </p>

      {/* Status banners */}
      {hasFailed && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-900 dark:text-red-100 space-y-1">
          <p className="font-semibold">Listings fallidos — acción requerida</p>
          <p>Uno o más listings tienen estado <strong>FAILED</strong>. Revisar el error en Detalle y reintentar publicar.</p>
        </div>
      )}
      {hasReconcilePending && (
        <div className="rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 px-4 py-3 text-sm text-violet-900 dark:text-violet-100 space-y-1">
          <p className="font-semibold">Reconciliación pendiente</p>
          <p>Shopify aceptó el producto pero el ID aún no está disponible. Espera unos minutos y recarga.</p>
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
              <th className="px-3 py-2">Publicado</th>
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
              listings.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                    <td className="px-3 py-2 font-mono tabular-nums text-xs">{row.id}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status] ?? 'bg-slate-100 text-slate-700'}`}>
                        {STATUS_LABEL[row.status] ?? row.status}
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
                    <td className="px-3 py-2 text-xs text-slate-400">{fmtDate(row.publishedAt)}</td>
                    <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                      {['DRAFT', 'FAILED'].includes(row.status) && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          className="text-xs font-medium text-primary-600 dark:text-primary-400 disabled:opacity-40"
                          onClick={() => void publish(row.id)}
                        >
                          {busyId === row.id ? '…' : 'Publicar'}
                        </button>
                      )}
                      {row.status === 'ACTIVE' && row.shopifyHandle && (
                        <a
                          href={`https://${row.shopifyHandle}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-emerald-600 dark:text-emerald-400 underline"
                        >
                          Ver en tienda
                        </a>
                      )}
                      <button
                        type="button"
                        className="text-xs text-slate-500 underline"
                        onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                      >
                        {expandedId === row.id ? 'Ocultar' : 'Detalle'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <tr className="bg-slate-50/90 dark:bg-slate-950/50">
                      <td colSpan={8} className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                        <p><strong>Estado:</strong> {row.status}</p>
                        <p><strong>Shopify Product ID:</strong> {row.shopifyProductId ?? '—'}</p>
                        <p><strong>Shopify Variant ID:</strong> {row.shopifyVariantId ?? '—'}</p>
                        <p><strong>Handle:</strong> {row.shopifyHandle ?? '—'}</p>
                        <p><strong>Publicado:</strong> {fmtDate(row.publishedAt)}</p>
                        <p><strong>Actualizado:</strong> {fmtDate(row.updatedAt)}</p>
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
