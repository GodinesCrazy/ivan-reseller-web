import { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import { API_BASE_URL } from '@/config/runtime';
import { Check, X, ChevronLeft, ChevronRight, ExternalLink, Wallet, TrendingUp, Wrench } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { formatCurrencySimple } from '@/utils/currency';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import OperationsTruthSummaryPanel from '@/components/OperationsTruthSummaryPanel';
import PostSaleProofLadderPanel from '@/components/PostSaleProofLadderPanel';
import AgentDecisionTracePanel from '@/components/AgentDecisionTracePanel';
import { fetchOperationsTruth } from '@/services/operationsTruth.api';
import type { OperationsTruthItem, OperationsTruthResponse } from '@/types/operations';

// Usar proxy de imágenes para evitar bloqueo de hotlink de AliExpress
function toProxyUrl(url: string): string {
  if (!url || !url.startsWith('http')) return url;
  const base = API_BASE_URL.replace(/\/+$/, '');
  const path = base.endsWith('/api') ? '/publisher/proxy-image' : '/api/publisher/proxy-image';
  return `${base}${path}?url=${encodeURIComponent(url)}`;
}

function sanitizeProductTitle(title: string): string {
  if (!title || typeof title !== 'string') return title;
  // Corregir %A (posible corrupción de "para") y otros artefactos de encoding
  return title
    .replace(/%A\s+/gi, 'para ')
    .replace(/\s+%A\s+/g, ' para ');
}

function formatDateEs(date: Date | string): string {
  return new Date(date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function getLiveStateBadge(state: string | null | undefined) {
  const normalized = String(state || '').trim().toLowerCase();
  if (normalized === 'active') return <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">active</span>;
  if (normalized === 'under_review') return <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">under_review</span>;
  if (normalized === 'paused') return <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">paused</span>;
  if (normalized === 'failed_publish' || normalized === 'not_found') return <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">{normalized}</span>;
  return <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">unknown</span>;
}

export default function IntelligentPublisher() {
  const location = useLocation();
  const { environment } = useEnvironment();
  const navigate = useNavigate();
  const [pending, setPending] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkMk, setBulkMk] = useState<{ ebay: boolean; mercadolibre: boolean; amazon: boolean }>({ ebay: true, mercadolibre: false, amazon: false });
  const [bulkStatus, setBulkStatus] = useState<{ total: number; queued: number; done: number; errors: number; running: boolean }>({ total: 0, queued: 0, done: 0, errors: 0, running: false });
  const [loading, setLoading] = useState(true);
  const [listingsPage, setListingsPage] = useState(1);
  const [listingsTotal, setListingsTotal] = useState(0);
  const [listingsMarketplaceFilter, setListingsMarketplaceFilter] = useState<'all' | 'ebay' | 'mercadolibre' | 'amazon'>('all');
  const [repairingMl, setRepairingMl] = useState(false);
  const [pendingPage, setPendingPage] = useState(1);
  const [capitalData, setCapitalData] = useState<{
    availableCash: number;
    canPublish: boolean;
    remainingExposure: number;
  } | null>(null);
  const [operationsTruth, setOperationsTruth] = useState<OperationsTruthResponse | null>(null);
  const LISTINGS_PER_PAGE = 50;
  const PENDING_PER_PAGE = 20;
  const listingsTotalPages = Math.max(1, Math.ceil(listingsTotal / LISTINGS_PER_PAGE));
  const pendingTotalPages = Math.max(1, Math.ceil(pending.length / PENDING_PER_PAGE));

  const loadListings = useCallback(async (page: number, marketplace?: 'all' | 'ebay' | 'mercadolibre' | 'amazon') => {
    try {
      const mp = marketplace ?? listingsMarketplaceFilter;
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(LISTINGS_PER_PAGE));
      if (mp && mp !== 'all') params.set('marketplace', mp);
      const res = await api.get(`/api/publisher/listings?${params.toString()}`);
      setListings(res.data?.items || []);
      setListingsTotal(res.data?.pagination?.total ?? res.data?.total ?? 0);
    } catch (error: any) {
      console.error('Error loading listings:', error);
    }
  }, [listingsMarketplaceFilter]);

  const loadCapitalData = useCallback(async () => {
    try {
      const [wcRes, allocRes] = await Promise.all([
        api.get<{ detail?: { availableCash?: number } }>('/api/finance/working-capital-detail', {
          params: { environment },
        }).catch(() => ({ data: {} })),
        api.get<{ capitalAllocation?: { canPublish?: boolean; remainingExposure?: number } }>('/api/finance/leverage-and-risk', {
          params: { environment },
        }).catch(() => ({ data: {} })),
      ]);
      const detail = wcRes.data?.detail;
      const alloc = allocRes.data?.capitalAllocation;
      setCapitalData({
        availableCash: detail?.availableCash ?? 0,
        canPublish: alloc?.canPublish ?? false,
        remainingExposure: alloc?.remainingExposure ?? 0,
      });
    } catch {
      setCapitalData(null);
    }
  }, [environment]);

  const loadPublisherData = useCallback(async () => {
    try {
      setLoading(true);
      const [pendingRes] = await Promise.all([
        api.get('/api/publisher/pending'),
        loadListings(1),
        loadCapitalData(),
      ]);
      setPending(pendingRes.data?.items || []);
      setListingsPage(1);
      setPendingPage(1);
    } catch (error: any) {
      console.error('Error loading publisher data:', error);
      const status = error?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error al cargar productos pendientes');
      }
    } finally {
      setLoading(false);
    }
  }, [loadListings, loadCapitalData]);

  // ✅ CORREGIDO: Recargar cuando se monta el componente O cuando cambia la location (navegación)
  useEffect(() => {
    loadPublisherData();
  }, [loadPublisherData, location.pathname]); // ✅ Agregar location.pathname para recargar al navegar

  useLiveData({
    fetchFn: loadPublisherData,
    intervalMs: 30000,
    enabled: true,
  });
  useNotificationRefetch({
    handlers: { PRODUCT_PUBLISHED: loadPublisherData },
    enabled: true,
  });

  useEffect(() => {
    let cancelled = false;
    const productIds = Array.from(new Set([
      ...pending.map((item: any) => Number(item.id)).filter((value) => Number.isFinite(value) && value > 0),
      ...listings.map((item: any) => Number(item.productId)).filter((value) => Number.isFinite(value) && value > 0),
    ]));

    if (productIds.length === 0) {
      setOperationsTruth(null);
      return;
    }

    fetchOperationsTruth({ ids: productIds, environment })
      .then((data) => {
        if (!cancelled) setOperationsTruth(data);
      })
      .catch(() => {
        if (!cancelled) setOperationsTruth(null);
      });

    return () => {
      cancelled = true;
    };
  }, [pending, listings, environment]);

  const operationsTruthByProduct = useMemo(() => {
    const entries = operationsTruth?.items ?? [];
    return new Map(entries.map((item) => [item.productId, item]));
  }, [operationsTruth]);

  const operationsTruthByListing = useMemo(() => {
    const entries = operationsTruth?.items ?? [];
    return new Map(
      entries
        .filter((item) => item.marketplace && item.listingId)
        .map((item) => [`${item.marketplace}:${item.listingId}`, item] as const)
    );
  }, [operationsTruth]);

  const resolveListingTruth = useCallback((listing: any): OperationsTruthItem | null => {
    const productId = Number(listing?.productId);
    if (Number.isFinite(productId) && operationsTruthByProduct.has(productId)) {
      return operationsTruthByProduct.get(productId) ?? null;
    }
    const marketplace = String(listing?.marketplace || '').trim().toLowerCase();
    const listingId = String(listing?.listingId || '').trim();
    if (marketplace && listingId) {
      return operationsTruthByListing.get(`${marketplace}:${listingId}`) ?? null;
    }
    return null;
  }, [operationsTruthByListing, operationsTruthByProduct]);

  const approve = useCallback(async (productId: string, marketplaces: string[]) => {
    try {
      const response = await api.post(`/api/publisher/approve/${productId}`, { marketplaces });
      const data = response.data;
      setPending((prev) => prev.filter(p => p.id !== productId));

      // Job encolado: publicación asíncrona (mismo flujo que Queue Publishing Jobs)
      if (data?.jobQueued === true) {
        toast.success(
          'Producto aprobado. La publicación se está procesando; recibirás una notificación cuando termine.',
          { duration: 6000 }
        );
        return;
      }

      // Fallback síncrono (Redis no disponible): usar publishResults
      if (data?.publishResults && Array.isArray(data.publishResults)) {
        const successCount = data.publishResults.filter((r: any) => r.success).length;
        const totalCount = data.publishResults.length;

        if (successCount === totalCount && totalCount > 0) {
          toast.success(`Producto aprobado y publicado en ${successCount} marketplace(s)`);
        } else if (successCount > 0) {
          toast.success(`Producto aprobado. Publicado en ${successCount}/${totalCount} marketplace(s)`);
        } else if (totalCount > 0) {
          const failed = data.publishResults.filter((r: any) => !r.success);
          const errorDetails = failed
            .map((r: any) => `${r.marketplace || 'Marketplace'}: ${r.error || 'Error desconocido'}`)
            .join('. ');
          toast.error(
            (t: { id: string }) => (
              <div className="flex flex-col gap-2">
                <span>Producto aprobado, pero la publicación falló.</span>
                <span className="text-sm">{errorDetails}</span>
                <button
                  onClick={() => {
                    toast.dismiss(t.id);
                    navigate('/settings?tab=api-credentials');
                  }}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700 underline"
                >
                  Ir a Configuración →
                </button>
              </div>
            ),
            { duration: 10000 }
          );
        } else {
          toast.success('Producto aprobado');
        }
      } else {
        toast.success('Producto aprobado');
      }
    } catch (e: any) {
      const res = e?.response?.data;
      const errorMessage = res?.message || res?.error || e?.message || 'Error al aprobar producto';
      const settingsUrl = res?.settingsUrl || '/settings?tab=api-credentials';
      if (res?.action === 'update_credentials' || res?.invalidCredentials?.length || /credential|ebay|expired/i.test(errorMessage)) {
        toast.error(
          (t) => (
            <div className="flex flex-col gap-2">
              <span>{errorMessage}</span>
              <button
                onClick={() => { toast.dismiss(t.id); navigate(settingsUrl); }}
                className="text-sm font-medium text-primary-600 hover:text-primary-700 underline"
              >
                Ir a Configuración →
              </button>
            </div>
          ),
          { duration: 8000 }
        );
      } else {
        toast.error(errorMessage);
      }
    }
  }, [navigate]);

  // Memoizar productos pendientes paginados
  const displayedPending = useMemo(() => {
    const start = (pendingPage - 1) * PENDING_PER_PAGE;
    return pending.slice(start, start + PENDING_PER_PAGE);
  }, [pending, pendingPage]);

  const goToListingsPage = useCallback((page: number) => {
    setListingsPage(page);
    loadListings(page, listingsMarketplaceFilter);
  }, [loadListings, listingsMarketplaceFilter]);

  const handleRepairAllMlListings = useCallback(async () => {
    setRepairingMl(true);
    const t = toast.loading('Reparando listados de Mercado Libre…');
    try {
      const { data } = await api.post('/api/publisher/listings/repair-ml', { limit: 5000 });
      toast.dismiss(t);
      const repaired = data?.repaired ?? 0;
      const failed = data?.failed ?? 0;
      if (repaired > 0 || failed > 0) {
        toast.success(`ML: ${repaired} reparados${failed > 0 ? `, ${failed} fallidos` : ''}.`);
        loadListings(listingsPage, listingsMarketplaceFilter);
      } else {
        toast.success('No hay listados ML para reparar.');
      }
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err?.response?.data?.error || 'Error al reparar listados ML');
    } finally {
      setRepairingMl(false);
    }
  }, [listingsPage, listingsMarketplaceFilter]);

  const handleListingsMarketplaceFilter = useCallback((mp: 'all' | 'ebay' | 'mercadolibre' | 'amazon') => {
    setListingsMarketplaceFilter(mp);
    setListingsPage(1);
    loadListings(1, mp);
  }, [loadListings]);

  // Memoizar progreso de bulk status
  const bulkProgress = useMemo(() => {
    return bulkStatus.total ? (bulkStatus.queued / bulkStatus.total) * 100 : 0;
  }, [bulkStatus.total, bulkStatus.queued]);

  if (loading) {
    return (
      <div className="p-6">
        <LoadingSpinner text="Cargando publicador..." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">Publicador inteligente</h1>
      <p className="text-gray-600 mb-4">
        Prepara, aprueba y publica anuncios con verdad canónica de listing, blocker y next action. Las estimaciones comerciales siguen siendo secundarias y no equivalen a proof comercial.
      </p>
      {operationsTruth && (
        <div className="space-y-4 mb-4">
          <OperationsTruthSummaryPanel data={operationsTruth} />
          <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1fr] gap-4">
            <PostSaleProofLadderPanel
              summary={operationsTruth.summary.proofCounts}
              title="Proof ladder around current publishing sample"
              subtitle="Publication activity no longer implies released funds or realized profit."
            />
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Publishing truth rule</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Publishing surfaces must foreground external listing state, blockers, and next actions before any estimated margin.
              </p>
            </div>
          </div>
          <AgentDecisionTracePanel items={operationsTruth.items} />
        </div>
      )}
      {/* Bulk publish toolbar */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded mb-4 flex flex-col gap-3">
        <div className="text-sm font-medium">Publicación masiva seleccionada (encolar trabajos)</div>
        <div className="flex items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.ebay} onChange={(e)=>setBulkMk(v=>({...v, ebay: e.target.checked}))}/> eBay</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.mercadolibre} onChange={(e)=>setBulkMk(v=>({...v, mercadolibre: e.target.checked}))}/> ML</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.amazon} onChange={(e)=>setBulkMk(v=>({...v, amazon: e.target.checked}))}/> Amazon</label>
          <button onClick={async()=>{
            const productIds = Object.entries(selected).filter(([,v])=>v).map(([k])=>k);
            const marketplaces = (['ebay','mercadolibre','amazon'] as const).filter(m=>bulkMk[m]);
            if (productIds.length===0 || marketplaces.length===0) { toast.error('Selecciona al menos un producto y un marketplace'); return; }
            setBulkStatus({ total: productIds.length, queued: 0, done: 0, errors: 0, running: true });
            // queue jobs sequentially to avoid hammering
            for (const pid of productIds) {
              try {
                await api.post('/api/jobs/publishing', { productId: Number(pid), marketplaces });
                setBulkStatus(s=>({ ...s, queued: s.queued + 1 }));
              } catch {
                setBulkStatus(s=>({ ...s, queued: s.queued + 1, errors: s.errors + 1 }));
              }
              await new Promise(r=>setTimeout(r, 300));
            }
            setBulkStatus(s=>({ ...s, running: false }));
            toast.success('Trabajos de publicación encolados. Sigue el progreso en notificaciones.');
          }} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Encolar trabajos de publicación</button>
          <button onClick={()=>{ const all: Record<string, boolean> = {}; pending.forEach((p:any)=> all[p.id]=true); setSelected(all); }} className="px-3 py-2 border rounded text-sm">Seleccionar todo</button>
          <button onClick={()=> setSelected({}) } className="px-3 py-2 border rounded text-sm">Limpiar</button>
          <button onClick={async()=>{
            const allIds = pending.map((p:any)=> String(p.id));
            const marketplaces = (['ebay','mercadolibre','amazon'] as const).filter(m=>bulkMk[m]);
            if (allIds.length===0 || marketplaces.length===0) { toast.error('No hay productos pendientes o marketplaces'); return; }
            setBulkStatus({ total: allIds.length, queued: 0, done: 0, errors: 0, running: true });
            for (const pid of allIds) {
              try {
                await api.post('/api/jobs/publishing', { productId: Number(pid), marketplaces });
                setBulkStatus(s=>({ ...s, queued: s.queued + 1 }));
              } catch {
                setBulkStatus(s=>({ ...s, queued: s.queued + 1, errors: s.errors + 1 }));
              }
              await new Promise(r=>setTimeout(r, 300));
            }
            setBulkStatus(s=>({ ...s, running: false }));
            toast.success('Todos los pendientes encolados para publicar');
          }} className="px-3 py-2 bg-green-600 text-white rounded text-sm">Publicar todo</button>
        </div>
        <div className="h-2 bg-gray-100 rounded overflow-hidden">
          <div className="h-full bg-primary-500" style={{ width: `${bulkProgress}%` }} />
        </div>
        <div className="text-xs text-gray-600">En cola: {bulkStatus.queued}/{bulkStatus.total} • Errores: {bulkStatus.errors}</div>
      </div>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded mb-4">
        <div className="text-sm font-medium mb-2">Añadir producto para aprobación (URL de AliExpress)</div>
        <div className="flex gap-2">
          <input className="flex-1 px-3 py-2 border rounded" placeholder="https://www.aliexpress.com/item/..." value={url} onChange={(e)=>setUrl(e.target.value)} />
          <button onClick={async()=>{
            try {
              await api.post('/api/publisher/add_for_approval', { aliexpressUrl: url, scrape: true });
              const { data } = await api.get('/api/publisher/pending'); // ✅ Usar nuevo endpoint
              setPending(data?.items || []);
              setUrl('');
              toast.success('Producto añadido para aprobación');
            } catch (e:any) {
              toast.error('Error al añadir producto');
            }
          }} className="px-4 py-2 bg-primary-600 text-white rounded">Añadir</button>
        </div>
      </div>
      {capitalData != null && (
        <div className="p-4 rounded border bg-white mb-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">Capital disponible:</span>
            <span className="font-semibold text-gray-900">{formatCurrencySimple(capitalData.availableCash, 'USD')}</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">Puede publicar:</span>
            {capitalData.canPublish ? (
              <span className="font-medium text-green-600">
                Sí
                {capitalData.remainingExposure > 0 && (
                  <span className="text-gray-500 font-normal ml-1">(+{formatCurrencySimple(capitalData.remainingExposure, 'USD')})</span>
                )}
              </span>
            ) : (
              <span className="font-medium text-amber-600">Límite alcanzado</span>
            )}
          </div>
        </div>
      )}
      <div className="p-4 border rounded bg-white text-gray-700 dark:text-gray-300 mb-3 flex items-center justify-between">
        <div>
          Aprobaciones pendientes: <span className="font-semibold">{pending.length}</span>
          {pending.length > 0 && (
            <span className="ml-2 text-xs text-gray-500">
              ({pending.filter((p: any) => p.source === 'autopilot').length} del Autopilot)
            </span>
          )}
        </div>
        <button 
          onClick={async () => {
            try {
              setLoading(true);
              const { data } = await api.get('/api/publisher/pending');
              setPending(data?.items || []);
              toast.success('Lista actualizada');
            } catch (e: any) {
              toast.error('Error al actualizar');
            } finally {
              setLoading(false);
            }
          }}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          Actualizar
        </button>
      </div>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
        {displayedPending.map((p: any) => (
          <PendingProductCard
            key={p.id}
            product={p}
            operationsTruth={operationsTruthByProduct.get(Number(p.id)) ?? null}
            selected={!!selected[p.id]}
            onSelectChange={(checked) => setSelected(s => ({ ...s, [p.id]: checked }))}
            onApprove={(marketplaces) => approve(p.id, marketplaces)}
          />
        ))}
        {pending.length === 0 && <div className="p-4 text-sm text-gray-600">No hay productos pendientes.</div>}
        {pending.length > 0 && pendingTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-3 px-4 border-t bg-gray-50 dark:bg-gray-700/50 rounded-b text-sm">
            <button
              disabled={pendingPage <= 1}
              onClick={() => setPendingPage((prev) => Math.max(1, prev - 1))}
              className="px-4 py-2 border rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-gray-600 font-medium"
            >
              <ChevronLeft className="w-4 h-4 inline" /> Anterior
            </button>
            <span className="text-gray-600 font-medium">
              Página {pendingPage} de {pendingTotalPages} ({pending.length} pendientes)
            </span>
            <button
              disabled={pendingPage >= pendingTotalPages}
              onClick={() => setPendingPage((prev) => Math.min(pendingTotalPages, prev + 1))}
              className="px-4 py-2 border rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-gray-600 font-medium"
            >
              Siguiente <ChevronRight className="w-4 h-4 inline" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="text-lg font-semibold">Anuncios publicados ({listingsTotal})</div>
          {listingsTotal > 0 && (
            <span className="text-sm text-gray-500">
              Mostrando {((listingsPage - 1) * LISTINGS_PER_PAGE) + 1}–{Math.min(listingsPage * LISTINGS_PER_PAGE, listingsTotal)} de {listingsTotal} listados
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          {(['all', 'ebay', 'mercadolibre', 'amazon'] as const).map((mp) => (
            <button
              key={mp}
              onClick={() => handleListingsMarketplaceFilter(mp)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                listingsMarketplaceFilter === mp
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {mp === 'all' ? 'Todos' : mp === 'mercadolibre' ? 'Mercado Libre' : mp === 'ebay' ? 'eBay' : 'Amazon'}
            </button>
          ))}
          <button
            type="button"
            onClick={handleRepairAllMlListings}
            disabled={repairingMl}
            className="ml-auto px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800/50 disabled:opacity-50 inline-flex items-center gap-1.5"
            title="Corregir título, descripción y atributos de todos los listados ML (error VIP67)"
          >
            <Wrench className="w-4 h-4" />
            {repairingMl ? 'Reparando…' : 'Reparar todos los listados ML'}
          </button>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
          {listings.map((l:any)=>(
            <div key={l.id} className="p-3 border-b flex items-center gap-3">
              {l.productImage && (
                <img src={toProxyUrl(l.productImage)} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" referrerPolicy="no-referrer" />
              )}
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-medium truncate">{l.productTitle || l.listingId}</div>
                <div className="text-gray-500 text-xs">{l.marketplace.toUpperCase()} – {l.listingId} – {l.publishedAt ? formatDateEs(l.publishedAt) : ''}</div>
                {(() => {
                  const truth = resolveListingTruth(l);
                  if (!truth) {
                    return <div className="text-[11px] text-gray-400 mt-1">Sin canonical listing truth asociado</div>;
                  }
                  return (
                    <div className="mt-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {getLiveStateBadge(truth.externalMarketplaceState)}
                        {truth.externalMarketplaceSubStatus.length > 0 && (
                          <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate" title={truth.externalMarketplaceSubStatus.join(', ')}>
                            {truth.externalMarketplaceSubStatus.join(', ')}
                          </span>
                        )}
                      </div>
                      {truth.blockerCode ? (
                        <div className="text-[11px] text-red-600 dark:text-red-400" title={truth.blockerMessage || truth.blockerCode}>
                          Blocker: {truth.blockerCode}
                        </div>
                      ) : (
                        <div className="text-[11px] text-green-600 dark:text-green-400">Sin blocker actual</div>
                      )}
                      {truth.nextAction && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-300" title={truth.nextAction}>
                          Next: {truth.nextAction}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              {l.listingUrl && (
                <a href={l.listingUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 text-sm hover:underline flex-shrink-0">Abrir</a>
              )}
            </div>
          ))}
          {listings.length===0 && <div className="p-3 text-sm text-gray-600">Aún no hay anuncios.</div>}
        </div>
        {listingsTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-3 py-3 border-t bg-gray-50 dark:bg-gray-700/50 rounded-b text-sm">
            <button
              disabled={listingsPage <= 1}
              onClick={() => goToListingsPage(Math.max(1, listingsPage - 1))}
              className="px-4 py-2 border rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-gray-600 font-medium"
            >
              <ChevronLeft className="w-4 h-4 inline" /> Anterior
            </button>
            <span className="text-gray-600 font-medium">Página {listingsPage} de {listingsTotalPages} ({listingsTotal} total)</span>
            <button
              disabled={listingsPage >= listingsTotalPages}
              onClick={() => goToListingsPage(Math.min(listingsTotalPages, listingsPage + 1))}
              className="px-4 py-2 border rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-gray-600 font-medium"
            >
              Siguiente <ChevronRight className="w-4 h-4 inline" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ✅ Tarjeta de producto pendiente con imágenes y más detalle
function PendingProductCard({
  product: p,
  operationsTruth,
  selected,
  onSelectChange,
  onApprove,
}: {
  product: any;
  operationsTruth: OperationsTruthItem | null;
  selected: boolean;
  onSelectChange: (checked: boolean) => void;
  onApprove: (marketplaces: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [marketplaces, setMarketplaces] = useState<Record<string, boolean>>({ ebay: true, mercadolibre: false, amazon: false });
  const imgSources = Array.isArray(p.images) ? p.images : (p.imageUrl ? [p.imageUrl] : []);

  const handleApprove = () => {
    const mks = (['ebay', 'mercadolibre', 'amazon'] as const).filter(m => marketplaces[m]);
    onApprove(mks);
  };

  const desc = p.description || '';
  const showDesc = desc.length > 0;
  const descShort = desc.length > 150 ? desc.slice(0, 150) + '...' : desc;

  return (
    <div className="p-4 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3 flex-1 w-full">
        <input type="checkbox" className="mt-1 flex-shrink-0" checked={selected} onChange={(e) => onSelectChange(e.target.checked)} />
        <ImageCarousel images={imgSources} title={sanitizeProductTitle(p.title)} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900">{sanitizeProductTitle(p.title)}</div>
          {showDesc && (
            <div className="text-xs text-gray-600 mt-1">
              {expanded ? desc : descShort}
              {desc.length > 150 && (
                <button type="button" onClick={() => setExpanded(!expanded)} className="ml-1 text-primary-600 hover:underline">
                  {expanded ? 'Ver menos' : 'Ver más'}
                </button>
              )}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-1 space-y-2">
            {operationsTruth && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Verdad operativa (listing / blocker)</p>
                <div className="flex flex-wrap gap-2 items-center">
                  {getLiveStateBadge(operationsTruth.externalMarketplaceState)}
                  {operationsTruth.externalMarketplaceSubStatus.length > 0 && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {operationsTruth.externalMarketplaceSubStatus.join(', ')}
                    </span>
                  )}
                </div>
                {operationsTruth.blockerCode ? (
                  <p className="text-xs text-red-600 dark:text-red-400" title={operationsTruth.blockerMessage || operationsTruth.blockerCode}>
                    Blocker: {operationsTruth.blockerCode}
                    {operationsTruth.blockerMessage ? ` — ${operationsTruth.blockerMessage}` : ''}
                  </p>
                ) : (
                  <p className="text-xs text-green-600 dark:text-green-400">Sin blocker canónico actual</p>
                )}
                {operationsTruth.nextAction && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">Siguiente acción: {operationsTruth.nextAction}</p>
                )}
              </div>
            )}
            <div className="rounded-md border border-dashed border-gray-200 dark:border-gray-600 p-2 space-y-1 text-[11px] text-gray-500 dark:text-gray-400">
              <p className="font-medium text-gray-600 dark:text-gray-300">Costos y margen — solo estimación pre-publicación</p>
              <div>
                Coste: {formatCurrencySimple(p.estimatedCost ?? p.aliexpressPrice ?? 0, p.currency || 'USD')}
                {p.shippingCost != null && p.shippingCost > 0 && (
                  <span> (+ {formatCurrencySimple(p.shippingCost, p.currency || 'USD')} envío)</span>
                )}
                {p.totalCost != null && p.totalCost !== (p.estimatedCost ?? p.aliexpressPrice ?? 0) && (
                  <span> = Total: {formatCurrencySimple(p.totalCost, p.currency || 'USD')}</span>
                )}
                {' → '}Sugerido: {formatCurrencySimple(p.suggestedPrice ?? 0, p.currency || 'USD')}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span>Margen bruto estimado: <span className="font-semibold text-gray-700 dark:text-gray-200">{formatCurrencySimple(p.estimatedProfit ?? 0, p.currency || 'USD')}</span></span>
                <span>ROI estimado: <span className="font-semibold text-gray-700 dark:text-gray-200">{Number(p.estimatedROI ?? 0).toFixed(1)}%</span></span>
              </div>
              {p.estimatedProfitByMarketplace && (
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(p.estimatedProfitByMarketplace).map(([mk, val]) => (
                    <span key={mk}>
                      {mk === 'mercadolibre' ? 'ML' : mk} (estim.):{' '}
                      <span className="text-gray-700 dark:text-gray-200">
                        +{formatCurrencySimple(Number(val), p.currency || 'USD')}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-500 dark:text-gray-500 pt-1">
                No es ganancia realizada ni prueba de listing activo; prioriza el bloque de verdad operativa arriba.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-xs ${p.source === 'autopilot' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                {p.source === 'autopilot' ? '🤖 Autopilot' : '👤 Manual'}
              </span>
              {p.category && <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">{p.category}</span>}
              {p.deliveryDays != null && p.deliveryDays > 0 && <span className="text-gray-500">{p.deliveryDays} días envío</span>}
              {p.queuedAt && <span className="text-gray-400">En cola: {formatDateEs(p.queuedAt)}</span>}
              {p.aliexpressUrl && (
                <a href={p.aliexpressUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                  <ExternalLink className="w-3 h-3" /> Ver en AliExpress
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <label className="text-sm"><input type="checkbox" checked={marketplaces.ebay} onChange={(e) => setMarketplaces(m => ({ ...m, ebay: e.target.checked }))} className="mr-1" /> eBay</label>
        <label className="text-sm"><input type="checkbox" checked={marketplaces.mercadolibre} onChange={(e) => setMarketplaces(m => ({ ...m, mercadolibre: e.target.checked }))} className="mr-1" /> ML</label>
        <label className="text-sm"><input type="checkbox" checked={marketplaces.amazon} onChange={(e) => setMarketplaces(m => ({ ...m, amazon: e.target.checked }))} className="mr-1" /> Amazon</label>
        <button onClick={handleApprove} className="px-3 py-2 bg-blue-600 text-white rounded text-sm flex items-center gap-1 whitespace-nowrap">
          <Check className="w-4 h-4" /> Aprobar y publicar
        </button>
      </div>
    </div>
  );
}

// ✅ MEJORADO: Carrusel de imágenes (usa proxy para AliExpress para evitar bloqueo de hotlink)
function ImageCarousel({ images, title }: { images: string[]; title: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const rawImages = images || [];
  const isAliCdn = (u: string) => /alicdn\.com|aliexpress\.com/i.test(u);
  const displayImages = rawImages.map(u => (isAliCdn(u) ? toProxyUrl(u) : u));

  if (!rawImages.length) {
    return (
      <div className="w-20 h-20 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
        <span className="text-gray-400 text-xs">No img</span>
      </div>
    );
  }

  const len = rawImages.length;
  const nextImage = () => setCurrentIndex((prev) => (prev + 1) % len);
  const prevImage = () => setCurrentIndex((prev) => (prev - 1 + len) % len);

  return (
    <div className="relative w-20 h-20 rounded overflow-hidden flex-shrink-0 group">
      <img 
        src={displayImages[currentIndex]} 
        alt={`${title} - Imagen ${currentIndex + 1}`}
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
        onError={(e) => {
          if (len > 1) {
            const nextIndex = (currentIndex + 1) % len;
            if (nextIndex !== currentIndex) {
              setCurrentIndex(nextIndex);
            } else {
              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/80x80?text=No+Image';
            }
          } else {
            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/80x80?text=No+Image';
          }
        }}
      />
      
      {/* Controles del carrusel (solo si hay múltiples imágenes) */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
            className="absolute left-0 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-1 rounded-r opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Imagen anterior"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-1 rounded-l opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Siguiente imagen"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
          
          {/* Indicador de posición */}
          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {currentIndex + 1} / {len}
          </div>
        </>
      )}
    </div>
  );
}
