import { useState, useCallback } from 'react';
import {
  Globe,
  RefreshCw,
  ExternalLink,
  Package,
  CheckCircle2,
  XCircle,
  PauseCircle,
  AlertCircle,
  Eye,
  ShoppingBag,
  BarChart3,
  Clock,
  Truck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import KpiCard from '@/components/ui/KpiCard';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useLiveData } from '@/hooks/useLiveData';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import api from '@/services/api';
import toast from 'react-hot-toast';

interface MarketplaceListing {
  id: number;
  productId: number;
  marketplace: string;
  listingId: string;
  listingUrl: string | null;
  supplierUrl: string | null;
  sku: string | null;
  viewCount: number | null;
  status: string;
  publishedAt: string | null;
  lastReconciledAt: string | null;
  shippingTruthStatus: string | null;
  legalTextsAppended: boolean;
  productTitle: string | null;
  productImage: string | null;
}

interface ListingsResponse {
  success: boolean;
  items: MarketplaceListing[];
  total: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const MARKETPLACE_LABELS: Record<string, string> = {
  ebay: 'eBay',
  mercadolibre: 'Mercado Libre',
  amazon: 'Amazon',
};

const MARKETPLACE_COLORS: Record<string, string> = {
  ebay: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  mercadolibre: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  amazon: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          Activo
        </span>
      );
    case 'paused':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <PauseCircle className="w-3 h-3" />
          Pausado
        </span>
      );
    case 'failed_publish':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          <XCircle className="w-3 h-3" />
          Error publicación
        </span>
      );
    case 'not_found':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          <AlertCircle className="w-3 h-3" />
          No encontrado
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          {status}
        </span>
      );
  }
}

export default function Listings() {
  const navigate = useNavigate();
  const { environment } = useEnvironment();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterMarketplace, setFilterMarketplace] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchListings = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { limit: 25, page, environment };
      if (filterMarketplace) params.marketplace = filterMarketplace;

      const response = await api.get<ListingsResponse>('/api/publisher/listings', { params });
      const data = response.data;
      let items = data.items ?? [];

      if (filterStatus) {
        items = items.filter((l) => l.status === filterStatus);
      }

      setListings(items);
      setTotal(data.total ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 1);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (!status || (status !== 429 && status !== 403)) {
        toast.error('Error al cargar listings');
      }
    } finally {
      setLoading(false);
    }
  }, [environment, filterMarketplace, filterStatus, page]);

  useLiveData({ fetchFn: fetchListings, intervalMs: 30000, enabled: true });

  // KPI counts from listings
  const activeCount = listings.filter((l) => l.status === 'active').length;
  const pausedCount = listings.filter((l) => l.status === 'paused').length;
  const failedCount = listings.filter((l) => l.status === 'failed_publish' || l.status === 'not_found').length;
  const mlCount = listings.filter((l) => l.marketplace === 'mercadolibre').length;
  const ebayCount = listings.filter((l) => l.marketplace === 'ebay').length;
  const amazonCount = listings.filter((l) => l.marketplace === 'amazon').length;

  const handleFilterChange = (mp: string, st: string) => {
    setFilterMarketplace(mp);
    setFilterStatus(st);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Globe}
        title="Listings"
        below={<CycleStepsBreadcrumb currentStep={5} />}
        subtitle={`${total} listings en marketplace · última reconciliación disponible en cada fila`}
        badge={
          activeCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3 h-3" />
              {activeCount} activo{activeCount !== 1 ? 's' : ''}
            </span>
          ) : undefined
        }
        actions={
          <Button onClick={fetchListings} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        }
      />

      {/* KPI STRIP */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            icon={BarChart3}
            label="Total"
            value={total}
            subtitle="todos los listings"
            tone="default"
            onClick={() => handleFilterChange('', '')}
          />
          <KpiCard
            icon={CheckCircle2}
            label="Activos"
            value={activeCount}
            subtitle="en marketplace"
            tone={activeCount > 0 ? 'success' : 'default'}
            onClick={() => handleFilterChange('', 'active')}
          />
          <KpiCard
            icon={AlertCircle}
            label="Problemas"
            value={failedCount}
            subtitle="error o no encontrado"
            tone={failedCount > 0 ? 'danger' : 'default'}
            onClick={() => handleFilterChange('', 'failed_publish')}
          />
          <KpiCard
            icon={ShoppingBag}
            label="MercadoLibre"
            value={mlCount}
            subtitle="listings ML"
            tone="info"
            onClick={() => handleFilterChange('mercadolibre', '')}
          />
          <KpiCard
            icon={Globe}
            label="eBay"
            value={ebayCount}
            subtitle="listings eBay"
            tone="default"
            onClick={() => handleFilterChange('ebay', '')}
          />
          <KpiCard
            icon={Package}
            label="Amazon"
            value={amazonCount}
            subtitle="listings Amazon"
            tone="warning"
            onClick={() => handleFilterChange('amazon', '')}
          />
        </div>
      )}

      {/* NEXT STEP BANNER — visible when there are active listings */}
      {!loading && activeCount > 0 && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">4</div>
            <div>
              <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                {activeCount} listing{activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''} — siguiente etapa: monitorear órdenes
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                Cuando llegue un pedido del cliente aparecerá en <strong>Órdenes</strong> para activar la compra al proveedor.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shrink-0"
          >
            Ver Órdenes →
          </button>
        </div>
      )}

      {/* FILTERS */}
      <div className="ir-panel p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">Filtrar:</span>

        {/* Marketplace filter */}
        {(['', 'mercadolibre', 'ebay', 'amazon'] as const).map((mp) => (
          <button
            key={mp}
            onClick={() => handleFilterChange(mp, filterStatus)}
            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
              filterMarketplace === mp
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {mp === '' ? 'Todos' : MARKETPLACE_LABELS[mp] ?? mp}
          </button>
        ))}

        <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>

        {/* Status filter */}
        {(['', 'active', 'paused', 'failed_publish'] as const).map((st) => (
          <button
            key={st}
            onClick={() => handleFilterChange(filterMarketplace, st)}
            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
              filterStatus === st
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {st === '' ? 'Todos los estados' : st === 'active' ? 'Activos' : st === 'paused' ? 'Pausados' : 'Con error'}
          </button>
        ))}
      </div>

      {/* TABLE */}
      {loading ? (
        <div className="ir-panel p-6 flex items-center justify-center min-h-[200px]">
          <LoadingSpinner text="Cargando listings..." />
        </div>
      ) : listings.length === 0 ? (
        <div className="ir-panel p-5">
          <div className="text-center py-16">
            <div className="mx-auto h-14 w-14 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Globe className="w-7 h-7 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Sin listings</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
              {filterMarketplace || filterStatus
                ? 'Sin resultados para este filtro. Prueba con otros.'
                : 'No hay listings publicados aún. Usa el Publicador para publicar productos.'}
            </p>
            {(filterMarketplace || filterStatus) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => handleFilterChange('', '')}
              >
                Limpiar filtros
              </Button>
            )}
            {!filterMarketplace && !filterStatus && (
              <Button
                size="sm"
                className="mt-3"
                onClick={() => navigate('/publisher')}
              >
                Ir al Publicador
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="ir-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="ir-table-header">Producto</th>
                  <th className="ir-table-header">Marketplace</th>
                  <th className="ir-table-header">Listing ID</th>
                  <th className="ir-table-header">Estado</th>
                  <th className="ir-table-header hidden md:table-cell">Shipping truth</th>
                  <th className="ir-table-header hidden md:table-cell">Vistas</th>
                  <th className="ir-table-header hidden lg:table-cell">Publicado</th>
                  <th className="ir-table-header hidden lg:table-cell">Reconciliado</th>
                  <th className="ir-table-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.id} className="ir-table-row">
                    {/* Producto */}
                    <td className="ir-table-cell py-3 pr-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {listing.productImage ? (
                          <img
                            src={listing.productImage}
                            alt=""
                            className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-slate-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <button
                            onClick={() => navigate(`/products/${listing.productId}/preview`)}
                            className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 hover:underline text-left truncate block max-w-[200px]"
                            title={listing.productTitle ?? ''}
                          >
                            {listing.productTitle ?? `Producto #${listing.productId}`}
                          </button>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">ID prod: {listing.productId}</p>
                        </div>
                      </div>
                    </td>

                    {/* Marketplace */}
                    <td className="ir-table-cell py-3 pr-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${MARKETPLACE_COLORS[listing.marketplace] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                        {MARKETPLACE_LABELS[listing.marketplace] ?? listing.marketplace}
                      </span>
                    </td>

                    {/* Listing ID */}
                    <td className="ir-table-cell py-3 pr-3">
                      <p className="font-mono text-xs text-slate-700 dark:text-slate-300">{listing.listingId}</p>
                      {listing.sku && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">SKU: {listing.sku}</p>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="ir-table-cell py-3 pr-3">
                      <StatusBadge status={listing.status} />
                    </td>

                    {/* Shipping truth */}
                    <td className="ir-table-cell py-3 pr-3 hidden md:table-cell">
                      {listing.shippingTruthStatus ? (
                        <span className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <Truck className="w-3 h-3 text-slate-400" />
                          {listing.shippingTruthStatus === 'me2_enforced'
                            ? 'ME2 enforced'
                            : listing.shippingTruthStatus === 'me2_attempted_not_enforced'
                              ? 'ME2 parcial'
                              : listing.shippingTruthStatus === 'not_specified'
                                ? 'Sin especificar'
                                : listing.shippingTruthStatus}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>

                    {/* Vistas */}
                    <td className="ir-table-cell py-3 pr-3 hidden md:table-cell">
                      {listing.viewCount != null ? (
                        <span className="flex items-center gap-1 text-sm text-slate-700 dark:text-slate-300">
                          <Eye className="w-3.5 h-3.5 text-slate-400" />
                          {listing.viewCount.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>

                    {/* Publicado */}
                    <td className="ir-table-cell py-3 pr-3 hidden lg:table-cell">
                      {listing.publishedAt ? (
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          {new Date(listing.publishedAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>

                    {/* Reconciliado */}
                    <td className="ir-table-cell py-3 pr-3 hidden lg:table-cell">
                      {listing.lastReconciledAt ? (
                        <span className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(listing.lastReconciledAt).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                          <AlertCircle className="w-3 h-3" />
                          Sin reconciliar
                        </span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="ir-table-cell py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        {/* Primary next-step CTA by status */}
                        {listing.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => navigate('/orders')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-[11px] font-semibold transition-colors whitespace-nowrap"
                            title="Listing activo — monitorear órdenes entrantes"
                          >
                            <ShoppingBag className="w-3 h-3" />
                            Ver Órdenes
                          </button>
                        )}
                        {(listing.status === 'failed_publish' || listing.status === 'not_found') && (
                          <button
                            type="button"
                            onClick={() => navigate(`/publisher?highlight=${listing.productId}`)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50 text-[11px] font-semibold transition-colors whitespace-nowrap"
                            title="Publicación fallida — ir al Publisher a reintentar"
                          >
                            <XCircle className="w-3 h-3" />
                            Reintentar
                          </button>
                        )}
                        {listing.status === 'paused' && (
                          <button
                            type="button"
                            onClick={() => navigate(`/products/${listing.productId}/preview`)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-[11px] font-semibold transition-colors whitespace-nowrap"
                            title="Listing pausado — revisar en ProductPreview"
                          >
                            <PauseCircle className="w-3 h-3" />
                            Revisar
                          </button>
                        )}
                        {/* Secondary actions */}
                        <div className="flex items-center gap-1">
                          {listing.listingUrl && (
                            <a
                              href={listing.listingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-medium transition-colors"
                              title="Abrir en marketplace"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Ver
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => navigate(`/products/${listing.productId}/preview`)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-medium transition-colors"
                            title="Ver producto"
                          >
                            <Package className="w-3 h-3" />
                            Producto
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Página {page} de {totalPages} · {total} listings en total
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  ← Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Siguiente →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer note */}
      <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center pb-2">
        La verdad operativa completa (blockers, proof ladder, estado externo) está en{' '}
        <button
          onClick={() => navigate('/control-center')}
          className="underline hover:text-slate-600 dark:hover:text-slate-300"
        >
          Control Center
        </button>
        .
      </p>
    </div>
  );
}
