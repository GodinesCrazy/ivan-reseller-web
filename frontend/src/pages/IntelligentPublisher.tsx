import { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import { API_BASE_URL } from '@/config/runtime';
import { Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

// Usar proxy de imágenes para evitar bloqueo de hotlink de AliExpress
function toProxyUrl(url: string): string {
  if (!url || !url.startsWith('http')) return url;
  const base = API_BASE_URL.replace(/\/+$/, '');
  const path = base.endsWith('/api') ? '/publisher/proxy-image' : '/api/publisher/proxy-image';
  return `${base}${path}?url=${encodeURIComponent(url)}`;
}

export default function IntelligentPublisher() {
  const location = useLocation();
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
  const LISTINGS_PER_PAGE = 50;
  const listingsTotalPages = Math.max(1, Math.ceil(listingsTotal / LISTINGS_PER_PAGE));

  const loadListings = useCallback(async (page: number) => {
    try {
      const res = await api.get(`/api/publisher/listings?page=${page}&limit=${LISTINGS_PER_PAGE}`);
      setListings(res.data?.items || []);
      setListingsTotal(res.data?.pagination?.total ?? res.data?.total ?? 0);
    } catch (error: any) {
      console.error('Error loading listings:', error);
    }
  }, []);

  const loadPublisherData = useCallback(async () => {
    try {
      setLoading(true);
      const [pendingRes] = await Promise.all([
        api.get('/api/publisher/pending'),
        loadListings(1),
      ]);
      setPending(pendingRes.data?.items || []);
      setListingsPage(1);
    } catch (error: any) {
      console.error('Error loading publisher data:', error);
      const status = error?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error al cargar productos pendientes');
      }
    } finally {
      setLoading(false);
    }
  }, [loadListings]);

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

  // Memoizar productos pendientes limitados
  const pendingLimited = useMemo(() => pending.slice(0, 20), [pending]);

  const goToListingsPage = useCallback((page: number) => {
    setListingsPage(page);
    loadListings(page);
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
      <h1 className="text-2xl font-semibold mb-2">Intelligent Publisher</h1>
      <p className="text-gray-600 mb-4">Prepare, approve and publish listings to marketplaces.</p>
      {/* Bulk publish toolbar */}
      <div className="bg-white p-4 rounded border mb-4 flex flex-col gap-3">
        <div className="text-sm font-medium">Bulk publish selected (queue jobs)</div>
        <div className="flex items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.ebay} onChange={(e)=>setBulkMk(v=>({...v, ebay: e.target.checked}))}/> eBay</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.mercadolibre} onChange={(e)=>setBulkMk(v=>({...v, mercadolibre: e.target.checked}))}/> ML</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.amazon} onChange={(e)=>setBulkMk(v=>({...v, amazon: e.target.checked}))}/> Amazon</label>
          <button onClick={async()=>{
            const productIds = Object.entries(selected).filter(([,v])=>v).map(([k])=>k);
            const marketplaces = (['ebay','mercadolibre','amazon'] as const).filter(m=>bulkMk[m]);
            if (productIds.length===0 || marketplaces.length===0) { toast.error('Select at least one product and one marketplace'); return; }
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
            toast.success('Publishing jobs queued. Track progress in notifications.');
          }} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Queue Publishing Jobs</button>
          <button onClick={()=>{ const all: Record<string, boolean> = {}; pending.forEach((p:any)=> all[p.id]=true); setSelected(all); }} className="px-3 py-2 border rounded text-sm">Select All</button>
          <button onClick={()=> setSelected({}) } className="px-3 py-2 border rounded text-sm">Clear</button>
          <button onClick={async()=>{
            const allIds = pending.map((p:any)=> String(p.id));
            const marketplaces = (['ebay','mercadolibre','amazon'] as const).filter(m=>bulkMk[m]);
            if (allIds.length===0 || marketplaces.length===0) { toast.error('No pending products or marketplaces'); return; }
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
            toast.success('All pending queued for publishing');
          }} className="px-3 py-2 bg-green-600 text-white rounded text-sm">Publish All</button>
        </div>
        <div className="h-2 bg-gray-100 rounded overflow-hidden">
          <div className="h-full bg-primary-500" style={{ width: `${bulkProgress}%` }} />
        </div>
        <div className="text-xs text-gray-600">Queued: {bulkStatus.queued}/{bulkStatus.total} • Errors: {bulkStatus.errors}</div>
      </div>
      <div className="bg-white p-4 rounded border mb-4">
        <div className="text-sm font-medium mb-2">Add product for approval (AliExpress URL)</div>
        <div className="flex gap-2">
          <input className="flex-1 px-3 py-2 border rounded" placeholder="https://www.aliexpress.com/item/..." value={url} onChange={(e)=>setUrl(e.target.value)} />
          <button onClick={async()=>{
            try {
              await api.post('/api/publisher/add_for_approval', { aliexpressUrl: url, scrape: true });
              const { data } = await api.get('/api/publisher/pending'); // ✅ Usar nuevo endpoint
              setPending(data?.items || []);
              setUrl('');
              toast.success('Product added for approval');
            } catch (e:any) {
              toast.error('Error adding product');
            }
          }} className="px-4 py-2 bg-primary-600 text-white rounded">Add</button>
        </div>
      </div>
      <div className="p-4 border rounded bg-white text-gray-700 mb-3 flex items-center justify-between">
        <div>
          Pending approvals: <span className="font-semibold">{pending.length}</span>
          {pending.length > 0 && (
            <span className="ml-2 text-xs text-gray-500">
              ({pending.filter((p: any) => p.source === 'autopilot').length} from Autopilot)
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
      <div className="bg-white border rounded">
        {pendingLimited.map((p: any) => (
          <PendingProductCard
            key={p.id}
            product={p}
            selected={!!selected[p.id]}
            onSelectChange={(checked) => setSelected(s => ({ ...s, [p.id]: checked }))}
            onApprove={(marketplaces) => approve(p.id, marketplaces)}
          />
        ))}
        {pending.length===0 && <div className="p-4 text-sm text-gray-600">No pending products.</div>}
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="text-lg font-semibold">Published Listings ({listingsTotal})</div>
          {listingsTotal > 0 && (
            <span className="text-sm text-gray-500">
              Mostrando {((listingsPage - 1) * LISTINGS_PER_PAGE) + 1}–{Math.min(listingsPage * LISTINGS_PER_PAGE, listingsTotal)} de {listingsTotal} listados
            </span>
          )}
        </div>
        <div className="bg-white border rounded">
          {listings.map((l:any)=>(
            <div key={l.id} className="p-3 border-b flex items-center gap-3">
              {l.productImage && (
                <img src={toProxyUrl(l.productImage)} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" referrerPolicy="no-referrer" />
              )}
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-medium truncate">{l.productTitle || l.listingId}</div>
                <div className="text-gray-500 text-xs">{l.marketplace.toUpperCase()} – {l.listingId} – {l.publishedAt ? new Date(l.publishedAt).toLocaleString() : ''}</div>
              </div>
              {l.listingUrl && (
                <a href={l.listingUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 text-sm hover:underline flex-shrink-0">Open</a>
              )}
            </div>
          ))}
          {listings.length===0 && <div className="p-3 text-sm text-gray-600">No listings yet.</div>}
        </div>
        {listingsTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-3 py-3 border-t bg-gray-50 rounded-b text-sm">
            <button
              disabled={listingsPage <= 1}
              onClick={() => goToListingsPage(Math.max(1, listingsPage - 1))}
              className="px-4 py-2 border rounded-lg disabled:opacity-40 hover:bg-white font-medium"
            >
              <ChevronLeft className="w-4 h-4 inline" /> Anterior
            </button>
            <span className="text-gray-600 font-medium">Página {listingsPage} de {listingsTotalPages} ({listingsTotal} total)</span>
            <button
              disabled={listingsPage >= listingsTotalPages}
              onClick={() => goToListingsPage(Math.min(listingsTotalPages, listingsPage + 1))}
              className="px-4 py-2 border rounded-lg disabled:opacity-40 hover:bg-white font-medium"
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
  selected,
  onSelectChange,
  onApprove,
}: {
  product: any;
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
        <ImageCarousel images={imgSources} title={p.title} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900">{p.title}</div>
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
          <div className="text-xs text-gray-500 mt-1 space-y-1">
            <div>Cost: ${Number(p.estimatedCost ?? p.aliexpressPrice ?? 0).toFixed(2)} → Suggested: ${Number(p.suggestedPrice ?? 0).toFixed(2)}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span>Profit: <span className="font-semibold text-green-600">${Number(p.estimatedProfit ?? 0).toFixed(2)}</span></span>
              <span>ROI: <span className="font-semibold text-blue-600">{Number(p.estimatedROI ?? 0).toFixed(1)}%</span></span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-xs ${p.source === 'autopilot' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                {p.source === 'autopilot' ? '🤖 Autopilot' : '👤 Manual'}
              </span>
              {p.queuedAt && <span className="text-gray-400">Queued: {new Date(p.queuedAt).toLocaleString()}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <label className="text-sm"><input type="checkbox" checked={marketplaces.ebay} onChange={(e) => setMarketplaces(m => ({ ...m, ebay: e.target.checked }))} className="mr-1" /> eBay</label>
        <label className="text-sm"><input type="checkbox" checked={marketplaces.mercadolibre} onChange={(e) => setMarketplaces(m => ({ ...m, mercadolibre: e.target.checked }))} className="mr-1" /> ML</label>
        <label className="text-sm"><input type="checkbox" checked={marketplaces.amazon} onChange={(e) => setMarketplaces(m => ({ ...m, amazon: e.target.checked }))} className="mr-1" /> Amazon</label>
        <button onClick={handleApprove} className="px-3 py-2 bg-blue-600 text-white rounded text-sm flex items-center gap-1 whitespace-nowrap">
          <Check className="w-4 h-4" /> Approve & Publish
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
