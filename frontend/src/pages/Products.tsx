import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Upload,
  Archive,
  Filter,
  Search,
  Eye,
  Trash2,
  ExternalLink,
  Calculator,
  Store,
  Link2,
  ChevronDown,
  ChevronUp,
  X,
  Download,
  ArrowUpDown,
  Calendar,
  DollarSign,
  Tag,
  AlertCircle,
  Settings
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useCurrency } from '../hooks/useCurrency';
import MetricLabelWithTooltip from '@/components/MetricLabelWithTooltip';
import { metricTooltips } from '@/config/metricTooltips';
import { formatCurrencySimple } from '@/utils/currency';
import WorkflowStatusIndicator from '@/components/WorkflowStatusIndicator';
import WorkflowProgressBar from '@/components/WorkflowProgressBar';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';
import InventorySummaryCard from '@/components/InventorySummaryCard';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import { useEnvironment } from '@/contexts/EnvironmentContext';

interface MarketplaceListing {
  id: number;
  marketplace: string;
  listingId: string;
  listingUrl: string | null;
  publishedAt: string | null;
}

interface Product {
  id: string;
  title: string;
  sku: string;
  price: number;
  currency?: string;
  stock: number;
  marketplace: string;
  marketplaceUrl?: string | null;
  marketplaceListings?: MarketplaceListing[];
  aliexpressUrl?: string | null;
  status: 'PENDING' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
  imageUrl?: string;
  profit?: number;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface Aggregations {
  totalAll: number;
  byStatus: Record<string, number>;
  categories: string[];
}

interface InventorySummary {
  products: { total: number; pending: number; approved: number; published: number };
  listingsByMarketplace: { ebay: number; mercadolibre: number; amazon: number };
  listingsTotal?: number;
  mercadolibreActiveCount?: number;
  ordersByStatus?: { CREATED: number; PAID: number; PURCHASING: number; PURCHASED: number; FAILED: number };
  pendingPurchasesCount?: number;
}

interface ProductFilters {
  search: string;
  status: string;
  marketplace: string;
  category: string;
  dateFrom: string;
  dateTo: string;
  dateField: 'createdAt' | 'publishedAt';
  priceMin: string;
  priceMax: string;
  hasLink: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

const DEFAULT_FILTERS: ProductFilters = {
  search: '',
  status: 'ALL',
  marketplace: 'ALL',
  category: 'ALL',
  dateFrom: '',
  dateTo: '',
  dateField: 'createdAt',
  priceMin: '',
  priceMax: '',
  hasLink: '',
  sortBy: 'createdAt',
  sortDir: 'desc',
};

/** Show "—" when marketplace is unknown, N/A or empty */
function displayMarketplace(m: string | undefined | null): string {
  if (m === undefined || m === null) return '—';
  const s = String(m).trim().toLowerCase();
  if (s === '' || s === 'unknown' || s === 'n/a') return '—';
  return String(m).trim();
}

const ITEMS_PER_PAGE = 25;

const VALID_MARKETPLACES = ['ebay', 'mercadolibre', 'amazon', 'ml'];

export default function Products() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { environment } = useEnvironment();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(null);
  const [aggregations, setAggregations] = useState<Aggregations | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [workflowByProduct, setWorkflowByProduct] = useState<Record<string, any>>({});
  const [approvingPending, setApprovingPending] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [inventorySummary, setInventorySummary] = useState<InventorySummary | null>(null);
  const { formatMoney } = useCurrency();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const updateFilter = useCallback((key: keyof ProductFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    if (key !== 'search') setCurrentPage(1);
  }, []);

  // Aplicar marketplace desde URL (?marketplace=ebay|mercadolibre|amazon)
  useEffect(() => {
    const mp = searchParams.get('marketplace')?.toLowerCase() || '';
    const normalized = mp === 'ml' ? 'mercadolibre' : mp;
    if (normalized && (VALID_MARKETPLACES.includes(normalized) || mp === 'ml')) {
      const value = normalized || 'mercadolibre';
      setFilters((prev) => (prev.marketplace === value ? prev : { ...prev, marketplace: value }));
      setCurrentPage(1);
    }
  }, [searchParams]);

  // Debounce search input
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search);
      setCurrentPage(1);
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [filters.search]);

  // Fetch workflow statuses for visible products
  useEffect(() => {
    const ids = products.map((p) => p.id).filter(Boolean);
    if (ids.length === 0) return;
    api.get(`/api/products/workflow-status-batch?ids=${ids.join(',')}`)
      .then((res) => {
        if (res.data?.success && res.data?.data) {
          const byId: Record<string, any> = {};
          Object.entries(res.data.data).forEach(([k, v]) => { byId[k] = v; });
          setWorkflowByProduct(byId);
        }
      })
      .catch(() => {});
  }, [products]);

  const fetchProducts = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const params = new URLSearchParams();
      if (filters.status !== 'ALL') params.set('status', filters.status);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filters.marketplace !== 'ALL') params.set('marketplace', filters.marketplace);
      if (filters.category !== 'ALL') params.set('category', filters.category);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.dateFrom || filters.dateTo) params.set('dateField', filters.dateField);
      if (filters.priceMin) params.set('priceMin', filters.priceMin);
      if (filters.priceMax) params.set('priceMax', filters.priceMax);
      if (filters.hasLink) params.set('hasLink', filters.hasLink);
      params.set('sortBy', filters.sortBy);
      params.set('sortDir', filters.sortDir);
      params.set('page', String(currentPage));
      params.set('limit', String(ITEMS_PER_PAGE));

      const [response, invRes] = await Promise.all([
        api.get(`/api/products?${params}`),
        api.get<InventorySummary>('/api/dashboard/inventory-summary', { params: { environment } }).catch(() => ({ data: null })),
      ]);
      if (invRes?.data) setInventorySummary(invRes.data);

      if (response.data?.setupRequired === true || response.data?.error === 'setup_required') {
        setSetupRequired(true);
        setProducts([]);
        setLoading(false);
        return;
      }

      setSetupRequired(false);
      const productsData = response.data?.data?.products || response.data?.products || [];
      setProducts(Array.isArray(productsData) ? productsData : []);
      if (response.data?.pagination) setPaginationMeta(response.data.pagination);
      if (response.data?.aggregations) setAggregations(response.data.aggregations);
    } catch (error: any) {
      if (error.response?.data?.setupRequired === true || error.response?.data?.error === 'setup_required') {
        setSetupRequired(true);
        setProducts([]);
        setLoading(false);
        return;
      }
      setSetupRequired(false);
      console.error('Error fetching products:', error);
      if (!silent) toast.error(error?.response?.data?.error || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.marketplace, filters.category, filters.dateFrom, filters.dateTo, filters.dateField, filters.priceMin, filters.priceMax, filters.hasLink, filters.sortBy, filters.sortDir, debouncedSearch, currentPage, environment]);

  const fetchInventorySummary = useCallback(async () => {
    try {
      const res = await api.get<InventorySummary>('/api/dashboard/inventory-summary', { params: { environment } });
      if (res.data) setInventorySummary(res.data);
    } catch {
      setInventorySummary(null);
    }
  }, [environment]);

  useEffect(() => {
    const timer = setTimeout(() => { fetchProducts(); }, 100);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  useEffect(() => {
    fetchInventorySummary();
  }, [fetchInventorySummary]);

  useLiveData({
    fetchFn: () => {
      fetchProducts(true).catch(() => {});
      fetchInventorySummary();
    },
    intervalMs: 15000,
    enabled: true,
  });
  useNotificationRefetch({
    handlers: {
      PRODUCT_PUBLISHED: () => {
        fetchProducts(true);
        fetchInventorySummary();
      },
      PRODUCT_SCRAPED: () => fetchProducts(true),
    },
    enabled: true,
  });

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setDebouncedSearch('');
    setCurrentPage(1);
  };

  // Active filter chips
  const activeFilters: { key: keyof ProductFilters; label: string; value: string }[] = [];
  if (filters.status !== 'ALL') activeFilters.push({ key: 'status', label: 'Status', value: filters.status });
  if (filters.marketplace !== 'ALL') activeFilters.push({ key: 'marketplace', label: 'Marketplace', value: filters.marketplace });
  if (filters.category !== 'ALL') activeFilters.push({ key: 'category', label: 'Categoria', value: filters.category });
  if (filters.dateFrom) activeFilters.push({ key: 'dateFrom', label: 'Desde', value: filters.dateFrom });
  if (filters.dateTo) activeFilters.push({ key: 'dateTo', label: 'Hasta', value: filters.dateTo });
  if (filters.priceMin) activeFilters.push({ key: 'priceMin', label: 'Precio min', value: `$${filters.priceMin}` });
  if (filters.priceMax) activeFilters.push({ key: 'priceMax', label: 'Precio max', value: `$${filters.priceMax}` });
  if (filters.hasLink) activeFilters.push({ key: 'hasLink', label: 'Con enlace', value: filters.hasLink === 'true' ? 'Si' : 'No' });
  if (debouncedSearch) activeFilters.push({ key: 'search', label: 'Busqueda', value: debouncedSearch });

  const removeFilter = (key: keyof ProductFilters) => {
    const defaults = DEFAULT_FILTERS;
    updateFilter(key, defaults[key]);
  };

  // Stats: prefer inventory-summary (single source of truth); fallback to aggregations
  const stats = {
    total: inventorySummary?.products?.total ?? aggregations?.totalAll ?? products.length,
    pending: inventorySummary?.products?.pending ?? aggregations?.byStatus?.PENDING ?? 0,
    approved: inventorySummary?.products?.approved ?? aggregations?.byStatus?.APPROVED ?? 0,
    published: inventorySummary?.listingsTotal ?? aggregations?.byStatus?.PUBLISHED ?? 0,
  };
  const listingsByMarketplace = inventorySummary?.listingsByMarketplace ?? { ebay: 0, mercadolibre: 0, amazon: 0 };

  // Summary for visible page
  const pageRevenue = products.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
  const pageProfit = products.reduce((sum, p) => sum + (Number(p.profit) || 0), 0);

  // CSV Export
  const exportToCSV = () => {
    const csv = [
      ['ID', 'Titulo', 'Status', 'Marketplace', 'Precio', 'Beneficio', 'URL Marketplace', 'URL Proveedor', 'Fecha'].join(','),
      ...products.map(p => [
        p.id,
        `"${(p.title || '').replace(/"/g, '""')}"`,
        p.status,
        p.marketplace,
        p.price,
        p.profit || 0,
        p.marketplaceUrl || '',
        p.aliexpressUrl || '',
        new Date(p.createdAt).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `productos_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('CSV exportado');
  };

  // Action handlers (unchanged logic)
  const handleApprove = async (productId: string) => {
    try {
      const response = await api.patch(`/api/products/${productId}/status`, { status: 'APPROVED' });
      toast.success(response.data?.message || 'Producto aprobado');
      fetchProducts();
      fetchInventorySummary();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al aprobar producto');
    }
  };

  const handleReject = async (productId: string) => {
    try {
      const response = await api.patch(`/api/products/${productId}/status`, { status: 'REJECTED' });
      toast.success(response.data?.message || 'Producto rechazado');
      fetchProducts();
      fetchInventorySummary();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al rechazar producto');
    }
  };

  const handlePublish = async (productId: string) => {
    try {
      const response = await api.post(`/api/publisher/approve/${productId}`, { marketplaces: ['ebay'] });
      const data = response.data;
      if (data?.jobQueued === true) {
        toast.success('Producto en cola de publicacion.', { duration: 6000 });
      } else if (data?.publishResults && Array.isArray(data.publishResults)) {
        const ok = data.publishResults.filter((r: any) => r.success).length;
        const total = data.publishResults.length;
        if (ok === total && total > 0) toast.success(`Publicado en ${ok} marketplace(s).`);
        else if (ok > 0) toast.success(`Publicado en ${ok}/${total} marketplace(s).`);
        else {
          const errMsg = data.publishResults.filter((r: any) => !r.success).map((r: any) => `${r.marketplace}: ${r.error || 'Error'}`).join('. ');
          toast.error(errMsg || 'Error al publicar');
        }
      } else {
        toast.success(data?.message || 'Producto aprobado.');
      }
      fetchProducts();
      fetchInventorySummary();
    } catch (error: any) {
      const res = error?.response?.data;
      const msg = res?.message || res?.error || error?.message || 'Error al publicar';
      toast.error(res?.action === 'configure_credentials' ? `${msg} Configura credenciales.` : msg);
    }
  };

  const handleUnpublish = async (productId: string) => {
    if (!confirm('Despublicar este producto?')) return;
    try {
      const response = await api.post(`/api/products/${productId}/unpublish`);
      toast.success(response.data?.message || 'Producto despublicado');
      fetchProducts();
      fetchInventorySummary();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al despublicar');
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Eliminar este producto?')) return;
    try {
      const response = await api.delete(`/api/products/${productId}`);
      toast.success(response.data?.message || 'Producto eliminado');
      fetchProducts();
      fetchInventorySummary();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al eliminar producto');
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      PENDING: 'warning',
      APPROVED: 'success',
      PUBLISHED: 'default',
      REJECTED: 'destructive'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const totalFiltered = paginationMeta?.total ?? products.length;
  const totalPages = paginationMeta?.totalPages ?? 1;

  const selectClass = "px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Productos</h1>
          <div className="flex gap-2">
            <Button variant="outline" className="flex gap-2" onClick={exportToCSV} title="Exportar productos visibles a CSV">
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
            {stats.pending > 0 && (
              <Button
                variant="outline"
                className="flex gap-2"
                disabled={approvingPending}
                onClick={async () => {
                  setApprovingPending(true);
                  try {
                    const res = await api.post('/api/products/approve-pending');
                    toast.success(res.data?.message || 'Productos procesados');
                    fetchProducts();
                    fetchInventorySummary();
                  } catch (e: any) {
                    toast.error(e?.response?.data?.error || 'Error al procesar pendientes');
                  } finally {
                    setApprovingPending(false);
                  }
                }}
              >
                {approvingPending ? 'Procesando...' : `Procesar ${stats.pending} pendientes`}
              </Button>
            )}
            <Button className="flex gap-2" onClick={() => navigate('/opportunities')}>
              <Package className="w-4 h-4" />
              Buscar oportunidades
            </Button>
          </div>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-0.5">Productos aprobados y publicados en marketplaces</p>
        <div className="mt-3">
          <CycleStepsBreadcrumb currentStep={3} />
        </div>
      </div>

      {setupRequired && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100">Configuración requerida</h3>
                <p className="mt-1 text-amber-800 dark:text-amber-200">
                  Para ver y gestionar productos, configura al menos un marketplace (eBay, Mercado Libre o Amazon) y una API de búsqueda (AliExpress Affiliate, ScraperAPI o ZenRows).
                </p>
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={() => navigate('/api-settings')}
                >
                  <Settings className="w-4 h-4" />
                  Ir a configuración de APIs
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!setupRequired && <InventorySummaryCard summary={inventorySummary} />}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:ring-2 hover:ring-blue-300 transition-shadow" onClick={() => { updateFilter('status', 'ALL'); }}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold">{stats.total.toLocaleString()}</p>
              </div>
              <Package className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 hover:ring-yellow-300 transition-shadow" onClick={() => { updateFilter('status', filters.status === 'PENDING' ? 'ALL' : 'PENDING'); }}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-600">{(stats.pending).toLocaleString()}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 hover:ring-green-300 transition-shadow" onClick={() => { updateFilter('status', filters.status === 'APPROVED' ? 'ALL' : 'APPROVED'); }}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Aprobados</p>
                <p className="text-2xl font-bold text-green-600">{(stats.approved).toLocaleString()}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 hover:ring-purple-300 transition-shadow" onClick={() => { updateFilter('status', filters.status === 'PUBLISHED' ? 'ALL' : 'PUBLISHED'); }}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Publicados</p>
                <p className="text-2xl font-bold text-purple-600">{(stats.published).toLocaleString()}</p>
                {stats.published > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    eBay: {listingsByMarketplace.ebay} · ML: {listingsByMarketplace.mercadolibre}
                    {typeof inventorySummary?.mercadolibreActiveCount === 'number' && inventorySummary.mercadolibreActiveCount !== listingsByMarketplace.mercadolibre && (
                      <span className="text-amber-600 dark:text-amber-400" title="Activos en Mercado Libre (verificado via API)">
                        {' '}({inventorySummary.mercadolibreActiveCount} activos)
                      </span>
                    )}
                    {' · '}Amazon: {listingsByMarketplace.amazon}
                  </p>
                )}
              </div>
              <Upload className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros
            </CardTitle>
            <div className="flex items-center gap-2">
              {activeFilters.length > 0 && (
                <Button variant="ghost" onClick={resetFilters} className="text-xs text-gray-500 hover:text-red-500 h-8 px-2">
                  Limpiar todo
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="text-xs flex items-center gap-1 h-8 px-2"
              >
                {showAdvancedFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showAdvancedFilters ? 'Menos filtros' : 'Mas filtros'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Basic filters (always visible) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por titulo o ID..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
              className={selectClass}
            >
              <option value="ALL">Todos los estados</option>
              <option value="PENDING">Pendiente</option>
              <option value="APPROVED">Aprobado</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="REJECTED">Rechazado</option>
            </select>
            <select
              value={filters.marketplace}
              onChange={(e) => updateFilter('marketplace', e.target.value)}
              className={selectClass}
            >
              <option value="ALL">Todos los marketplaces</option>
              <option value="ebay">eBay</option>
              <option value="mercadolibre">Mercado Libre</option>
              <option value="amazon">Amazon</option>
            </select>
          </div>

          {/* Row 2-3: Advanced filters (collapsible) */}
          {showAdvancedFilters && (
            <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Category */}
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    <Tag className="w-3 h-3" /> Categoria
                  </label>
                  <select
                    value={filters.category}
                    onChange={(e) => updateFilter('category', e.target.value)}
                    className={selectClass + ' w-full'}
                  >
                    <option value="ALL">Todas</option>
                    {(aggregations?.categories || []).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                {/* Date field selector */}
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    <Calendar className="w-3 h-3" /> Tipo de fecha
                  </label>
                  <select
                    value={filters.dateField}
                    onChange={(e) => updateFilter('dateField', e.target.value)}
                    className={selectClass + ' w-full'}
                  >
                    <option value="createdAt">Fecha creacion</option>
                    <option value="publishedAt">Fecha publicacion</option>
                  </select>
                </div>
                {/* Date from */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Desde</label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => updateFilter('dateFrom', e.target.value)}
                    className={selectClass + ' w-full'}
                  />
                </div>
                {/* Date to */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Hasta</label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => updateFilter('dateTo', e.target.value)}
                    className={selectClass + ' w-full'}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Price min */}
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    <DollarSign className="w-3 h-3" /> Precio minimo
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={filters.priceMin}
                    onChange={(e) => updateFilter('priceMin', e.target.value)}
                  />
                </div>
                {/* Price max */}
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    <DollarSign className="w-3 h-3" /> Precio maximo
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="999.99"
                    value={filters.priceMax}
                    onChange={(e) => updateFilter('priceMax', e.target.value)}
                  />
                </div>
                {/* Has marketplace link */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Enlace marketplace</label>
                  <select
                    value={filters.hasLink}
                    onChange={(e) => updateFilter('hasLink', e.target.value)}
                    className={selectClass + ' w-full'}
                  >
                    <option value="">Todos</option>
                    <option value="true">Con enlace</option>
                    <option value="false">Sin enlace</option>
                  </select>
                </div>
                {/* Sort */}
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    <ArrowUpDown className="w-3 h-3" /> Ordenar por
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={filters.sortBy}
                      onChange={(e) => updateFilter('sortBy', e.target.value)}
                      className={selectClass + ' flex-1'}
                    >
                      <option value="createdAt">Fecha creacion</option>
                      <option value="publishedAt">Fecha publicacion</option>
                      <option value="price">Precio</option>
                      <option value="title">Titulo</option>
                      <option value="status">Estado</option>
                    </select>
                    <button
                      onClick={() => updateFilter('sortDir', filters.sortDir === 'asc' ? 'desc' : 'asc')}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700 text-sm"
                      title={filters.sortDir === 'asc' ? 'Ascendente' : 'Descendente'}
                    >
                      {filters.sortDir === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active filter chips */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {activeFilters.map(af => (
                <span
                  key={af.key}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-700"
                >
                  {af.label}: {af.value}
                  <button onClick={() => removeFilter(af.key)} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-red-500 underline ml-1">
                Limpiar todos
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>Productos ({totalFiltered.toLocaleString()})</CardTitle>
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span>Revenue pagina: <strong className="text-gray-700 dark:text-gray-200">{formatCurrencySimple(pageRevenue, 'USD')}</strong></span>
              <span>Beneficio pagina: <strong className="text-green-600">{formatCurrencySimple(pageProfit, 'USD')}</strong></span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Cargando productos...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 max-w-md mx-auto">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Sin productos</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {activeFilters.length > 0
                  ? 'No hay productos que coincidan con los filtros aplicados.'
                  : 'No tienes productos publicados. El ciclo comienza en Tendencias.'}
              </p>
              {activeFilters.length > 0 ? (
                <Button variant="outline" onClick={resetFilters}>Limpiar filtros</Button>
              ) : (
                <Button onClick={() => navigate('/dashboard?tab=trends')}>Comenzar ciclo (Tendencias)</Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Producto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">SKU</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Marketplace</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Enlaces</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Precio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Workflow</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Beneficio</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -m-2 p-2 rounded"
                            onClick={() => { setSelectedProduct(product); setShowModal(true); }}
                          >
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.title} className="w-10 h-10 rounded object-cover" />
                            ) : (
                              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                                <Package className="w-5 h-5 text-gray-400" />
                              </div>
                            )}
                            <span className="font-medium text-gray-900 dark:text-gray-100 max-w-xs truncate">{product.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{product.sku}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {product.marketplaceListings && product.marketplaceListings.length > 0 ? (
                              (() => {
                                const mps = Array.from(new Set(product.marketplaceListings.map((l: MarketplaceListing) => l.marketplace)))
                                  .map((mp) => displayMarketplace(mp))
                                  .filter((mp) => mp !== '—');
                                if (mps.length === 0) return <Badge variant="outline" className="text-gray-500">—</Badge>;
                                return mps.map((mp) => <Badge key={mp} variant="outline" className="text-xs">{mp}</Badge>);
                              })()
                            ) : (
                              <Badge variant="outline" className="text-gray-500">{displayMarketplace(product.marketplace)}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {product.marketplaceListings && product.marketplaceListings.length > 0 ? (
                              product.marketplaceListings.map((listing) => (
                                listing.listingUrl ? (
                                  <a key={listing.id} href={listing.listingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                                    <ExternalLink className="w-4 h-4 shrink-0" />
                                    Ver en {displayMarketplace(listing.marketplace)}
                                  </a>
                                ) : (
                                  <span key={listing.id} className="inline-flex items-center gap-1 text-gray-500 text-sm">
                                    <ExternalLink className="w-4 h-4 shrink-0" />
                                    {displayMarketplace(listing.marketplace)} ({listing.listingId})
                                  </span>
                                )
                              ))
                            ) : product.marketplaceUrl ? (
                              <a href={product.marketplaceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                                <ExternalLink className="w-4 h-4 shrink-0" />
                                Ver en {displayMarketplace(product.marketplace)}
                              </a>
                            ) : null}
                            {product.aliexpressUrl && (
                              <a href={product.aliexpressUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:underline text-sm">
                                <Link2 className="w-4 h-4 shrink-0" />
                                Proveedor
                              </a>
                            )}
                            {(!product.marketplaceListings || product.marketplaceListings.length === 0) && !product.marketplaceUrl && !product.aliexpressUrl && (
                              <span className="text-gray-400 text-sm">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrencySimple(product.price, product.currency || 'USD')}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(product.status)}</td>
                        <td className="px-4 py-3">
                          <WorkflowStatusIndicator
                            productId={Number(product.id)}
                            preloadedCurrentStage={workflowByProduct[product.id]?.currentStage}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {product.profit ? (
                            <span className="text-sm font-medium text-green-600">
                              +{formatCurrencySimple(product.profit, product.currency || 'USD')}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => navigate(`/products/${product.id}/preview`)} className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Preview">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={() => navigate(`/products/${product.id}/preview?showFinancial=true`)} className="p-1 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded transition-colors" title="Info financiera">
                              <Calculator className="w-4 h-4" />
                            </button>
                            {product.status === 'PENDING' && (
                              <>
                                <button onClick={() => handleApprove(product.id)} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded" title="Aprobar">
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleReject(product.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" title="Rechazar">
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {product.status === 'APPROVED' && (
                              <button onClick={() => handlePublish(product.id)} className="p-1 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded" title="Publicar">
                                <Upload className="w-4 h-4" />
                              </button>
                            )}
                            {product.status === 'PUBLISHED' && (
                              <button onClick={() => handleUnpublish(product.id)} className="p-1 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded" title="Despublicar">
                                <Archive className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => handleDelete(product.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" title="Eliminar">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Pagina {currentPage} de {totalPages} ({totalFiltered.toLocaleString()} productos)
                  </p>
                  <div className="flex gap-2 items-center">
                    <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                      Primera
                    </Button>
                    <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                      Anterior
                    </Button>
                    <span className="text-sm font-medium px-2">{currentPage}</span>
                    <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                      Siguiente
                    </Button>
                    <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                      Ultima
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Product Detail Modal */}
      {showModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-2xl font-bold dark:text-gray-100">Detalles del producto</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {selectedProduct.imageUrl ? (
                <div className="flex justify-center">
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.title}
                    className="w-full max-w-md h-64 object-cover rounded-lg shadow-md"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const placeholder = target.nextElementSibling as HTMLElement;
                      if (placeholder) placeholder.style.display = 'flex';
                    }}
                  />
                  <div className="w-full max-w-md h-64 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center hidden">
                    <div className="text-center">
                      <Package className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">Imagen no disponible</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="w-full max-w-md h-64 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Package className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">Sin imagen</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Titulo</p>
                  <p className="font-medium dark:text-gray-100">{selectedProduct.title}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">SKU</p>
                  <p className="font-medium dark:text-gray-100">{selectedProduct.sku}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Precio</p>
                  <p className="font-medium text-lg dark:text-gray-100">
                    {formatCurrencySimple(selectedProduct.price, selectedProduct.currency || 'USD')}
                  </p>
                </div>
                <div>
                  <MetricLabelWithTooltip label="Marketplace" tooltipBody={metricTooltips.marketplace.body} className="text-sm text-gray-600 dark:text-gray-400">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Marketplace</p>
                  </MetricLabelWithTooltip>
                  <Badge variant="outline">{displayMarketplace(selectedProduct.marketplace)}</Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Estado</p>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedProduct.status)}
                    <MetricLabelWithTooltip
                      label={selectedProduct.status}
                      tooltipBody={
                        selectedProduct.status === 'PENDING' ? metricTooltips.statusPending.body :
                        selectedProduct.status === 'APPROVED' ? metricTooltips.statusApproved.body :
                        selectedProduct.status === 'PUBLISHED' ? metricTooltips.statusPublished.body :
                        selectedProduct.status === 'REJECTED' ? metricTooltips.statusRejected.body :
                        'Estado del producto en el sistema'
                      }
                      className="inline-block"
                    >
                      <span className="cursor-help text-gray-400">?</span>
                    </MetricLabelWithTooltip>
                  </div>
                </div>
                {selectedProduct.profit ? (
                  <div>
                    <MetricLabelWithTooltip label="Expected Profit" tooltipBody={metricTooltips.potentialProfit.body} className="text-sm text-gray-600 dark:text-gray-400">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Beneficio estimado</p>
                    </MetricLabelWithTooltip>
                    <p className="font-medium text-green-600 text-lg">
                      +{formatCurrencySimple(selectedProduct.profit, selectedProduct.currency || 'USD')}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Creado</p>
                  <p className="font-medium dark:text-gray-100">{new Date(selectedProduct.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              {(selectedProduct.marketplaceUrl || selectedProduct.aliexpressUrl) && (
                <div className="pt-4 border-t dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Enlaces</p>
                  <div className="flex flex-wrap gap-3">
                    {selectedProduct.marketplaceUrl && (
                      <a href={selectedProduct.marketplaceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                        <Store className="w-4 h-4" />
                        Ver en {displayMarketplace(selectedProduct.marketplace)}
                      </a>
                    )}
                    {selectedProduct.aliexpressUrl && (
                      <a href={selectedProduct.aliexpressUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                        <Link2 className="w-4 h-4" />
                        Proveedor (AliExpress)
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t dark:border-gray-700 flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cerrar
              </Button>
              {selectedProduct.status === 'PUBLISHED' && selectedProduct.marketplaceUrl && (
                <Button
                  className="flex items-center gap-2"
                  onClick={() => window.open(selectedProduct.marketplaceUrl!, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver en Marketplace
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
