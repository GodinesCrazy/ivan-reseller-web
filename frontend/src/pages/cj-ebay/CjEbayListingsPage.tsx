import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';
import CjEbayOperatorPathCallout from '@/components/cj-ebay/CjEbayOperatorPathCallout';

type ListingRow = {
  id: number;
  status: string;
  listedPriceUsd: number | null;
  quantity: number | null;
  ebayListingId: string | null;
  ebayOfferId: string | null;
  ebaySku: string | null;
  lastError: string | null;
  handlingTimeDays: number | null;
  publishedAt: string | null;
  updatedAt: string;
  productTitle: string;
  cjProductId: string;
  variantCjSku: string | null;
  variantCjVid: string | null;
};

export default function CjEbayListingsPage() {
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{
    lastError: string | null;
    draftPayload: unknown;
    status: string;
    qualityWarnings?: Array<{ code: string; message: string }>;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; listings: ListingRow[] }>('/api/cj-ebay/listings');
      if (res.data?.ok && Array.isArray(res.data.listings)) {
        setListings(res.data.listings);
      }
    } catch (e: unknown) {
      let msg = 'No se pudieron cargar listings.';
      if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
        const d = e.response.data as { message?: string; error?: string };
        msg = d.message || d.error || msg;
      } else if (e instanceof Error) msg = e.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await api.post('/api/cj-ebay/listings/publish', { listingId: id });
      await load();
    } catch (e: unknown) {
      let msg = 'Error al publicar.';
      if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
        const d = e.response.data as { message?: string; error?: string };
        msg = d.message || d.error || msg;
        if (e.response.status === 423 && !msg.includes('ACCOUNT_POLICY_BLOCK')) {
          msg = `${msg} (publicación bloqueada en servidor)`;
        }
      } else if (e instanceof Error) msg = e.message;
      setError(msg);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function pause(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/api/cj-ebay/listings/${id}/pause`);
      await load();
    } catch (e: unknown) {
      let msg = 'Error al pausar.';
      if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
        const d = e.response.data as { message?: string; error?: string };
        msg = d.message || d.error || msg;
      } else if (e instanceof Error) msg = e.message;
      setError(msg);
    } finally {
      setBusyId(null);
    }
  }

  async function showDetail(id: number) {
    if (detailId === id) {
      setDetailId(null);
      setDetail(null);
      return;
    }
    setDetailId(id);
    try {
      const res = await api.get<{
        ok: boolean;
        listing: {
          lastError: string | null;
          draftPayload: unknown;
          status: string;
        };
      }>(`/api/cj-ebay/listings/${id}`);
      if (res.data?.ok && res.data.listing) {
        const dp = res.data.listing.draftPayload as Record<string, unknown> | null;
        setDetail({
          lastError: res.data.listing.lastError,
          draftPayload: dp,
          status: res.data.listing.status,
          qualityWarnings: Array.isArray(dp?.qualityWarnings)
            ? (dp.qualityWarnings as Array<{ code: string; message: string }>)
            : undefined,
        });
      }
    } catch {
      setDetail({ lastError: 'No se pudo cargar detalle', draftPayload: null, status: '?' });
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando listings…</p>;
  }

  return (
    <div className="space-y-4">
      <CjEbayOperatorPathCallout variant="listings" />

      {/* Module readiness summary */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-4 py-3 text-xs space-y-1">
        <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Estado del módulo CJ → eBay USA</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {([
            { label: 'Búsqueda CJ', ok: true },
            { label: 'Selección variante / stock real', ok: true },
            { label: 'Configuración pricing', ok: true },
            { label: 'Evaluate (APPROVED)', ok: true },
            { label: 'Crear draft listing', ok: true },
            { label: 'Publicar en eBay (ship-from China)', ok: false, note: 'Pendiente: aprobación cuenta eBay overseas warehouse' },
            { label: 'Postventa (órdenes)', ok: false, note: 'Se abre cuando exista un listing publicado real' },
          ] as const).map((item) => (
            <div key={item.label} className="flex items-start gap-1.5">
              <span className={item.ok ? 'text-emerald-600 dark:text-emerald-400 mt-0.5' : 'text-amber-600 dark:text-amber-400 mt-0.5'}>
                {item.ok ? '✓' : '○'}
              </span>
              <span className={item.ok ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}>
                {item.label}
                {'note' in item && item.note && (
                  <span className="block text-[11px] text-amber-600 dark:text-amber-400">{item.note}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">
        Drafts listos para publicar. Origen:{' '}
        <Link to="/cj-ebay/products" className="text-primary-600 dark:text-primary-400 underline">
          Productos CJ
        </Link>
        {' '}→ Evaluar → Crear draft.
      </p>
      {listings.some((r) => r.status === 'ACCOUNT_POLICY_BLOCK') && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 space-y-1">
          <p className="font-semibold">Publicación bloqueada — cuenta eBay no autorizada para ship-from China</p>
          <p>
            Uno o más listings tienen estado <strong>ACCOUNT_POLICY_BLOCK</strong>. eBay rechazó el publish con
            error 25019 (Overseas Warehouse Block Policy / Location_Mismatch_Inventory_Block).
            Este NO es un problema de título, descripción ni precio.
          </p>
          <p>
            <strong>Causa:</strong> la cuenta eBay aún no está aprobada para el modelo de overseas warehouse
            / Global Seller (CJ Dropshipping ship-from China).
          </p>
          <p>
            <strong>Qué hacer:</strong> esperar la aprobación de eBay para vendedor global / overseas warehouse,
            luego reintentar el publish desde este panel. El draft se conserva.
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            No reintentar publish mientras el bloqueo esté activo — eBay rechazará cada intento.
          </p>
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
              <th className="px-3 py-2">Título</th>
              <th className="px-3 py-2">Precio</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">eBay</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {listings.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Sin listings. Creá un draft desde <strong>Oportunidades</strong> / <strong>Product Research</strong> (CJ) o desde{' '}
                  <strong>Productos CJ</strong> tras evaluación APPROVED.
                </td>
              </tr>
            ) : (
              listings.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                    <td className="px-3 py-2 font-mono tabular-nums">{row.id}</td>
                    <td className="px-3 py-2">
                      {row.status === 'ACCOUNT_POLICY_BLOCK' ? (
                        <span
                          className="rounded bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200"
                          title="Bloqueado por política de cuenta eBay (overseas warehouse). No es error de contenido."
                        >
                          POLICY BLOCK
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs">
                          {row.status}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={row.productTitle}>
                      {row.productTitle}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.listedPriceUsd != null
                        ? row.listedPriceUsd.toLocaleString(undefined, {
                            style: 'currency',
                            currency: 'USD',
                          })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.ebaySku || '—'}</td>
                    <td className="px-3 py-2">
                      {row.ebayListingId ? (
                        <a
                          href={`https://www.ebay.com/itm/${row.ebayListingId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary-600 dark:text-primary-400 underline"
                        >
                          {row.ebayListingId}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                      {row.status === 'ACCOUNT_POLICY_BLOCK' ? (
                        <span
                          className="text-xs font-medium text-amber-600 dark:text-amber-400 cursor-not-allowed"
                          title="Publicación bloqueada por política de cuenta eBay (overseas warehouse). Ver banner arriba."
                        >
                          Bloqueado (política)
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === row.id || !['DRAFT', 'FAILED'].includes(row.status)}
                          className="text-xs font-medium text-primary-600 dark:text-primary-400 disabled:opacity-40"
                          onClick={() => void publish(row.id)}
                        >
                          {busyId === row.id ? '…' : 'Publicar'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === row.id || row.status !== 'ACTIVE'}
                        className="text-xs font-medium text-slate-600 dark:text-slate-400 disabled:opacity-40"
                        onClick={() => void pause(row.id)}
                      >
                        Pausar
                      </button>
                      <button
                        type="button"
                        className="text-xs text-slate-500 underline"
                        onClick={() => void showDetail(row.id)}
                      >
                        {detailId === row.id ? 'Ocultar' : 'Detalle'}
                      </button>
                    </td>
                  </tr>
                  {detailId === row.id && detail && (
                    <tr className="bg-slate-50/90 dark:bg-slate-950/50">
                      <td colSpan={7} className="px-3 py-3 text-xs text-slate-600 dark:text-slate-400">
                        <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">
                          Estado API: {detail.status}
                        </p>
                        {detail.status === 'ACCOUNT_POLICY_BLOCK' ? (
                          <div className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 mb-2 space-y-1 text-amber-900 dark:text-amber-100">
                            <p className="font-semibold">Bloqueo de cuenta eBay — no es error del listing</p>
                            <p>
                              eBay rechazó el publish con error 25019: <em>Overseas Warehouse Block Policy /
                              Location_Mismatch_Inventory_Block</em>. La cuenta no está autorizada para
                              publicar con ship-from China (CJ Dropshipping).
                            </p>
                            <p>
                              <strong>El draft se conserva.</strong> No corregir título ni descripción — el
                              problema es a nivel de cuenta/política, no de contenido.
                            </p>
                            <p>
                              <strong>Acción requerida:</strong> esperar aprobación de eBay para el perfil
                              de vendedor global / overseas warehouse. Una vez aprobada, reintentar publish
                              desde este panel (primero cambiar el estado a DRAFT o contactar soporte).
                            </p>
                          </div>
                        ) : (
                          detail.lastError && (
                            <pre className="whitespace-pre-wrap text-rose-800 dark:text-rose-200 mb-2">
                              {detail.lastError}
                            </pre>
                          )
                        )}
                        {detail.qualityWarnings && detail.qualityWarnings.length > 0 && (
                          <div className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-2 py-1.5 mb-2 space-y-0.5">
                            <p className="font-medium text-amber-800 dark:text-amber-200 text-[11px] uppercase tracking-wide">Avisos de calidad</p>
                            {detail.qualityWarnings.map((w) => (
                              <p key={w.code} className="text-amber-700 dark:text-amber-300">
                                <span className="font-mono text-[10px] mr-1 opacity-70">[{w.code}]</span>
                                {w.message}
                              </p>
                            ))}
                          </div>
                        )}
                        <details>
                          <summary className="cursor-pointer text-slate-500">Draft payload (JSON)</summary>
                          <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-100 dark:bg-slate-900 p-2">
                            {JSON.stringify(detail.draftPayload, null, 2)}
                          </pre>
                        </details>
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
