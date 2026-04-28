import { useCallback, useEffect, useState } from 'react';
import { api } from '@/services/api';

type Listing = {
  id: number; status: string; shopifyHandle: string | null;
  listedPriceUsd: number | null; publishedAt: string | null;
  product: { title: string; tdSku: string; images?: string[] } | null;
  variant: { tdVariantSku: string; title: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT:      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  PUBLISHING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  ACTIVE:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  FAILED:     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  PAUSED:     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ARCHIVED:   'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
};

export default function TopDawgShopifyUsaListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busyId, setBusyId]     = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [msg, setMsg]           = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get('/api/topdawg-shopify-usa/listings');
    setListings(res.data.listings ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const drafts = listings.filter(l => l.status === 'DRAFT');

  async function bulkPublish() {
    if (!drafts.length) return;
    setBulkBusy(true); setMsg(null); setError(null);
    try {
      await api.post('/api/topdawg-shopify-usa/listings/publish', { listingIds: drafts.map(l => l.id) });
      setMsg(`Publicados ${drafts.length} productos.`);
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error publishing'); }
    finally { setBulkBusy(false); }
  }

  async function action(id: number, endpoint: string, label: string) {
    setBusyId(id); setMsg(null); setError(null);
    try {
      await api.post(`/api/topdawg-shopify-usa/listings/${id}/${endpoint}`);
      setMsg(`${label} completado.`);
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : `Error: ${label}`); }
    finally { setBusyId(null); }
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando listings…</p>;

  return (
    <div className="space-y-4">
      {msg   && <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-200">{msg}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-2 text-sm text-red-800 dark:text-red-200">{error}</div>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{listings.length} listings · {drafts.length} drafts · {listings.filter(l=>l.status==='ACTIVE').length} activos</p>
        {drafts.length > 0 && (
          <button onClick={() => void bulkPublish()} disabled={bulkBusy}
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
            {bulkBusy ? 'Publicando…' : `Publicar todos los drafts (${drafts.length})`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/80 text-xs font-medium text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-right">Precio</th>
              <th className="px-3 py-2 text-left">Shopify</th>
              <th className="px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {listings.map(l => (
              <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                <td className="px-3 py-2">
                  <p className="font-medium line-clamp-1 text-slate-800 dark:text-slate-200">{l.product?.title ?? '—'}</p>
                  <p className="text-xs font-mono text-slate-400">{l.product?.tdSku}</p>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[l.status] ?? 'bg-slate-100 text-slate-700'}`}>{l.status}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{l.listedPriceUsd != null ? `$${Number(l.listedPriceUsd).toFixed(2)}` : '—'}</td>
                <td className="px-3 py-2">
                  {l.shopifyHandle
                    ? <a href={`https://shop.ivanreseller.com/products/${l.shopifyHandle}`} target="_blank" rel="noreferrer" className="text-xs text-orange-600 dark:text-orange-400 underline">Ver →</a>
                    : <span className="text-slate-400 text-xs">—</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2 justify-center">
                    {l.status === 'DRAFT' && (
                      <button onClick={() => void action(l.id, 'publish', 'Publicar')} disabled={busyId === l.id}
                        className="rounded px-2 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
                        {busyId === l.id ? '…' : '▶ Publicar'}
                      </button>
                    )}
                    {l.status === 'ACTIVE' && (
                      <button onClick={() => void action(l.id, 'pause', 'Pausar')} disabled={busyId === l.id}
                        className="rounded px-2 py-1 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 disabled:opacity-50">
                        ⏸ Pausar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
