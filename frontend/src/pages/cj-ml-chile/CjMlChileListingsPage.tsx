import { useEffect, useState } from 'react';
import { api } from '@/services/api';

interface Listing {
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
  product: { title: string; cjProductId: string };
  variant: { cjSku: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  PUBLISHING: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  PAUSED: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  ARCHIVED: 'bg-slate-100 dark:bg-slate-700 text-slate-500',
  NOT_VIABLE: 'bg-slate-100 dark:bg-slate-700 text-slate-400',
};

function clpFormat(n: string | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n));
}

export default function CjMlChileListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<{ id: number; msg: string; ok: boolean } | null>(null);

  const load = () => {
    setLoading(true);
    api.get('/api/cj-ml-chile/listings')
      .then((r) => setListings(r.data.listings ?? []))
      .catch((e) => setError(e?.response?.data?.message ?? e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function doAction(id: number, action: 'publish' | 'pause' | 'force-reset') {
    setActionLoading(id);
    setActionMsg(null);
    try {
      if (action === 'publish') {
        await api.post(`/api/cj-ml-chile/listings/${id}/publish`);
        setActionMsg({ id, msg: 'Publicado en ML Chile', ok: true });
      } else if (action === 'pause') {
        await api.post(`/api/cj-ml-chile/listings/${id}/pause`);
        setActionMsg({ id, msg: 'Pausado', ok: true });
      } else {
        await api.post(`/api/cj-ml-chile/listings/${id}/force-reset`);
        setActionMsg({ id, msg: 'Reset a DRAFT', ok: true });
      }
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(e);
      setActionMsg({ id, msg, ok: false });
    } finally { setActionLoading(null); }
  }

  if (loading) return <div className="text-sm text-slate-500">Cargando listings…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{listings.length} listing{listings.length !== 1 ? 's' : ''}</p>
        <button onClick={load} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Actualizar</button>
      </div>

      {listings.length === 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">
          Sin listings aún. Ve a Products, evalúa un producto y crea un draft.
        </div>
      )}

      <div className="space-y-3">
        {listings.map((l) => (
          <div key={l.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1">{l.product.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{l.mlSku} · {l.mlListingId ? `ML: ${l.mlListingId}` : 'Sin ID ML aún'}</p>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[l.status] ?? STATUS_COLORS.DRAFT}`}>
                {l.status}
              </span>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">
              <span>Precio: <span className="font-semibold text-emerald-700 dark:text-emerald-300">{clpFormat(l.listedPriceCLP)}</span></span>
              {l.listedPriceUsd && <span>≈ ${Number(l.listedPriceUsd).toFixed(2)} USD</span>}
              {l.fxRateUsed && <span>FX: {Number(l.fxRateUsed).toFixed(0)} CLP/USD</span>}
              {l.legalTextsAppended && <span className="text-emerald-600 dark:text-emerald-400">Footer legal ✓</span>}
              {l.publishedAt && <span>Publicado: {new Date(l.publishedAt).toLocaleDateString('es-CL')}</span>}
            </div>

            {l.lastError && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">{l.lastError}</p>}

            {actionMsg?.id === l.id && (
              <p className={`text-xs ${actionMsg.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{actionMsg.msg}</p>
            )}

            <div className="flex gap-2 flex-wrap">
              {l.status === 'DRAFT' && (
                <button
                  onClick={() => doAction(l.id, 'publish')}
                  disabled={actionLoading === l.id}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50 transition-colors"
                >
                  {actionLoading === l.id ? 'Publicando…' : 'Publicar en ML Chile'}
                </button>
              )}
              {l.status === 'ACTIVE' && (
                <button
                  onClick={() => doAction(l.id, 'pause')}
                  disabled={actionLoading === l.id}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
                >
                  Pausar
                </button>
              )}
              {(l.status === 'FAILED' || l.status === 'PAUSED' || l.status === 'ARCHIVED') && (
                <button
                  onClick={() => doAction(l.id, 'force-reset')}
                  disabled={actionLoading === l.id}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  Resetear a Draft
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
