import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type ListingRow = {
  id: number;
  mlListingId: string | null;
  mlSku: string | null;
  status: string;
  listedPriceCLP: string | null;
  listedPriceUsd: string | null;
  fxRateUsed: string | null;
  quantity: number | null;
  publishedAt: string | null;
  lastError: string | null;
  legalTextsAppended: boolean;
  fxStale: boolean;
  fxAgeHours: number | null;
  product: { title: string; cjProductId: string };
  variant: { cjSku: string } | null;
  evaluation: { fxRateAt?: string | null } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador', PUBLISHING: 'Publicando…', ACTIVE: 'Activo',
  FAILED: 'Fallido', PAUSED: 'Pausado', ARCHIVED: 'Archivado',
  NOT_VIABLE: 'No viable', ML_POLICY_BLOCK: 'Bloqueado ML',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT:           'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  PUBLISHING:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  ACTIVE:          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  FAILED:          'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  PAUSED:          'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ARCHIVED:        'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
  NOT_VIABLE:      'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
  ML_POLICY_BLOCK: 'bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function clpFormat(n: string | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n));
}

function axiosMsg(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fallback;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjMlChileListingsPage() {
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{
    lastError: string | null;
    draftPayload: unknown;
    status: string;
  } | null>(null);
  const [repriceMsg, setRepriceMsg] = useState<{ id: number; msg: string; ok: boolean } | null>(null);
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; listings: ListingRow[] }>('/api/cj-ml-chile/listings');
      if (res.data?.listings) setListings(res.data.listings);
    } catch (e) {
      setError(axiosMsg(e, 'No se pudieron cargar listings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function doAction(id: number, action: 'publish' | 'pause' | 'force-reset') {
    setBusyId(id);
    setError(null);
    try {
      if (action === 'publish') {
        await api.post(`/api/cj-ml-chile/listings/${id}/publish`);
      } else if (action === 'pause') {
        await api.post(`/api/cj-ml-chile/listings/${id}/pause`);
      } else {
        await api.post(`/api/cj-ml-chile/listings/${id}/force-reset`);
      }
      await load();
    } catch (e) {
      setError(axiosMsg(e, `Error en acción ${action}.`));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function doReprice(id: number) {
    setBusyId(id);
    setRepriceMsg(null);
    try {
      const r = await api.post<{ newPriceCLP: number; newFxRate: number; mlUpdated: boolean }>(
        `/api/cj-ml-chile/listings/${id}/reprice`
      );
      const msg = `Precio: ${clpFormat(String(r.data.newPriceCLP))} · FX=${r.data.newFxRate}${r.data.mlUpdated ? ' · ML actualizado' : ''}`;
      setRepriceMsg({ id, msg, ok: true });
      await load();
    } catch (e) {
      setRepriceMsg({ id, msg: axiosMsg(e, 'Error al repreciar'), ok: false });
    } finally {
      setBusyId(null);
    }
  }

  async function showDetail(id: number) {
    if (detailId === id) { setDetailId(null); setDetail(null); return; }
    setDetailId(id);
    try {
      const res = await api.get<{
        ok: boolean;
        listing: { lastError: string | null; draftPayload: unknown; status: string };
      }>(`/api/cj-ml-chile/listings/${id}`);
      if (res.data?.listing) {
        setDetail({
          lastError: res.data.listing.lastError,
          draftPayload: res.data.listing.draftPayload,
          status: res.data.listing.status,
        });
      }
    } catch {
      setDetail({ lastError: 'No se pudo cargar detalle', draftPayload: null, status: '?' });
    }
  }

  // Filtered
  const filtered = filterStatus ? listings.filter((l) => l.status === filterStatus) : listings;
  const staleCount = listings.filter((l) => l.fxStale && (l.status === 'DRAFT' || l.status === 'ACTIVE')).length;
  const hasPolicyBlock = listings.some((l) => l.status === 'ML_POLICY_BLOCK');
  const statusCounts: Record<string, number> = {};
  for (const l of listings) statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Module readiness summary */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-4 py-3 text-xs space-y-1">
        <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Estado del módulo CJ → ML Chile</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {([
            { label: 'Búsqueda CJ (warehouse Chile)', ok: true },
            { label: 'Evaluación + warehouse check', ok: true },
            { label: 'Pricing CLP con IVA 19%', ok: true },
            { label: 'Draft listing ML Chile', ok: true },
            { label: 'Publicar en Mercado Libre', ok: true },
            { label: 'Repriceo automático (FX)', ok: true },
            { label: 'Postventa (órdenes)', ok: true },
          ] as const).map((item) => (
            <div key={item.label} className="flex items-start gap-1.5">
              <span className={item.ok ? 'text-emerald-600 dark:text-emerald-400 mt-0.5' : 'text-amber-600 dark:text-amber-400 mt-0.5'}>
                {item.ok ? '✓' : '○'}
              </span>
              <span className={item.ok ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">
        Drafts listos para publicar. Origen:{' '}
        <Link to="/cj-ml-chile/products" className="text-emerald-600 dark:text-emerald-400 underline">
          Productos CJ
        </Link>
        {' '}→ Evaluar → Crear draft.
      </p>

      {/* FX stale banner */}
      {staleCount > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 space-y-1">
          <p className="font-semibold">⚠ {staleCount} listing{staleCount !== 1 ? 's' : ''} con precio posiblemente desactualizado</p>
          <p>Tipo de cambio (FX) usado tiene más de 24 horas. Usa "Re-evaluar precio" para actualizar con la tasa actual.</p>
        </div>
      )}

      {/* ML Policy block banner */}
      {hasPolicyBlock && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 space-y-1">
          <p className="font-semibold">Publicación bloqueada — vendedor ML no verificado o categoría restringida</p>
          <p>
            Uno o más listings tienen estado <strong>ML_POLICY_BLOCK</strong>. Mercado Libre rechazó la publicación por una restricción de política.
          </p>
          <p><strong>Qué hacer:</strong> verificar tu cuenta de vendedor en Mercado Libre, confirmar categoría permitida, y reintentar.</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
          {error}
        </div>
      )}

      {/* Filter bar */}
      {listings.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          <select
            aria-label="Filtrar por estado"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300"
          >
            <option value="">Todos ({listings.length})</option>
            {Object.entries(statusCounts).map(([s, c]) => (
              <option key={s} value={s}>{STATUS_LABELS[s] ?? s} ({c})</option>
            ))}
          </select>
          {filterStatus && (
            <button
              type="button"
              onClick={() => setFilterStatus('')}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
            >
              Limpiar filtro
            </button>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
            {filtered.length} listing{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Listings table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        {listings.length === 0 ? (
          <div className="px-6 py-14 text-center space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Sin listings. Crea un draft desde{' '}
              <Link to="/cj-ml-chile/products" className="text-emerald-600 dark:text-emerald-400 underline">
                Productos CJ
              </Link>{' '}
              tras evaluación APPROVED.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">Sin listings para el filtro seleccionado.</p>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2.5">ID</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Título</th>
                <th className="px-3 py-2.5">Precio CLP</th>
                <th className="px-3 py-2.5">FX</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5">ML</th>
                <th className="px-3 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <Fragment key={row.id}>
                  <tr className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors ${
                    row.fxStale && (row.status === 'DRAFT' || row.status === 'ACTIVE')
                      ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                  }`}>
                    <td className="px-3 py-2.5 font-mono tabular-nums text-xs">{row.id}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={row.status} />
                      {row.fxStale && (row.status === 'DRAFT' || row.status === 'ACTIVE') && (
                        <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">FX stale ({row.fxAgeHours}h)</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px] truncate text-xs" title={row.product.title}>{row.product.title}</td>
                    <td className="px-3 py-2.5 tabular-nums text-xs">
                      <span className="font-medium text-emerald-700 dark:text-emerald-300">{clpFormat(row.listedPriceCLP)}</span>
                      {row.listedPriceUsd && (
                        <span className="text-slate-400 ml-1">(${Number(row.listedPriceUsd).toFixed(2)})</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {row.fxRateUsed ? `${Number(row.fxRateUsed).toFixed(0)}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">{row.mlSku || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {row.mlListingId ? (
                        <a
                          href={`https://articulo.mercadolibre.cl/MLC-${row.mlListingId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-600 dark:text-emerald-400 underline"
                        >
                          {row.mlListingId}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 space-x-2 whitespace-nowrap">
                      {row.status === 'ML_POLICY_BLOCK' ? (
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400 cursor-not-allowed" title="Bloqueado por política ML">
                          Bloqueado (política)
                        </span>
                      ) : (
                        <>
                          {row.status === 'DRAFT' && (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              className="text-xs font-medium text-emerald-600 dark:text-emerald-400 disabled:opacity-40"
                              onClick={() => void doAction(row.id, 'publish')}
                            >
                              {busyId === row.id ? '…' : 'Publicar'}
                            </button>
                          )}
                          {row.status === 'ACTIVE' && (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              className="text-xs font-medium text-slate-600 dark:text-slate-400 disabled:opacity-40"
                              onClick={() => void doAction(row.id, 'pause')}
                            >
                              Pausar
                            </button>
                          )}
                          {(row.status === 'FAILED' || row.status === 'PAUSED' || row.status === 'ARCHIVED') && (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              className="text-xs font-medium text-orange-600 dark:text-orange-400 disabled:opacity-40"
                              onClick={() => void doAction(row.id, 'force-reset')}
                            >
                              Reset a Draft
                            </button>
                          )}
                          {(row.status === 'DRAFT' || row.status === 'ACTIVE') && (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              className={`text-xs font-medium disabled:opacity-40 ${
                                row.fxStale ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
                              }`}
                              onClick={() => void doReprice(row.id)}
                            >
                              {row.fxStale ? '⚠ Repreciar' : 'Repreciar'}
                            </button>
                          )}
                        </>
                      )}
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
                      <td colSpan={8} className="px-3 py-3 text-xs text-slate-600 dark:text-slate-400">
                        <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">Estado API: {detail.status}</p>
                        {detail.lastError && (
                          <div className="rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 mb-2">
                            <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-200 mb-0.5">Último error</p>
                            <pre className="text-[11px] text-rose-700 dark:text-rose-300 whitespace-pre-wrap break-all">{detail.lastError}</pre>
                          </div>
                        )}
                        {row.legalTextsAppended && (
                          <p className="text-emerald-600 dark:text-emerald-400 text-[11px] mb-1">✓ Footer legal de garantía Chile incluido</p>
                        )}
                        {repriceMsg?.id === row.id && (
                          <p className={`text-[11px] mb-1 ${repriceMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{repriceMsg.msg}</p>
                        )}
                        <details>
                          <summary className="cursor-pointer text-slate-500">Draft payload (JSON)</summary>
                          <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-100 dark:bg-slate-900 p-2 text-[11px]">
                            {JSON.stringify(detail.draftPayload, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
