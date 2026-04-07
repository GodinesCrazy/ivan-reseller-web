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
import PageHeader from '@/components/ui/PageHeader';
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
import type { InventorySummary } from '@/types/dashboard';
import type { OperationsTruthItem } from '@/types/operations';
import { fetchOperationsTruth } from '@/services/operationsTruth.api';
import { useAuthStore } from '@stores/authStore';
import {
  lifecycleToneClasses,
  resolveOperationalLifecycleStage,
} from '@/utils/operational-lifecycle';

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
  status: 'PENDING' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'LEGACY_UNVERIFIED' | 'VALIDATED_READY';
  validationState?: 'LEGACY_UNVERIFIED' | 'PENDING' | 'REJECTED' | 'BLOCKED' | 'VALIDATION_INCOMPLETE' | 'VALIDATED_READY' | 'PUBLISHED';
  blockedReasons?: string[];
  resolvedCountry?: string | null;
  resolvedLanguage?: string | null;
  resolvedCurrency?: string | null;
  feeCompleteness?: number;
  projectedMargin?: number | null;
  marketplaceContextSafety?: 'safe' | 'unsafe';
  imageUrl?: string;
  estimatedUnitMargin?: number;
  profit?: number;
  createdAt: string;
  winnerDetectedAt?: string | null;
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
  const { user } = useAuthStore();
  const isAdminUser = user?.role?.toUpperCase() === 'ADMIN';
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
  const [postSaleOverview, setPostSaleOverview] = useState<Array<{
    productId: number;
    productTitle: string;
    listings: Array<{ marketplace: string; listingId: string; sku: string | null }>;
    lastOrder: { orderId: string; orderStatus: string; marketplaceOrderId: string; fulfillmentAutomationStatus: string; updatedAt: string } | null;
  }> | null>(null);
  const [operationsTruthByProduct, setOperationsTruthByProduct] = useState<Record<string, OperationsTruthItem>>({});
  const [showPostSaleOverview, setShowPostSaleOverview] = useState(false);
  const [mlCanaryPanelOpen, setMlCanaryPanelOpen] = useState(false);
  const [mlCanaryLoading, setMlCanaryLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [mlCanaryData, setMlCanaryData] = useState<{
    scanned: number;
    candidates: Array<{
      productId: number;
      title: string | null;
      publishAllowed: boolean;
      overallState: string;
      canaryTier: string;
      canaryScore: number;
      topBlockers: string[];
    }>;
  } | null>(null);
  const { formatMoney } = useCurrency();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const loadMlCanaryCandidates = useCallback(async () => {
    setMlCanaryLoading(true);
    try {
      const res = await api.get('/api/products/canary/mlc', {
        params: { environment, limit: 8, scanCap: 20 },
      });
      if (res.data?.success && res.data?.data) {
        setMlCanaryData(res.data.data);
        toast.success(`Evaluados ${res.data.data.scanned} productos validados (máx. preflight).`);
      } else {
        setMlCanaryData(null);
        toast.error('Respuesta inválida del servidor.');
      }
    } catch (e: any) {
      setMlCanaryData(null);
      toast.error(e?.response?.data?.error || 'No se pudo cargar candidatos canary ML');
    } finally {
      setMlCanaryLoading(false);
    }
  }, [environment]);

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

  useEffect(() => {
    const ids = products.map((product) => product.id).filter(Boolean);
    if (ids.length === 0) {
      setOperationsTruthByProduct({});
      return;
    }
    fetchOperationsTruth({ ids, environment })
      .then((data) => {
        const mapped = Object.fromEntries(data.items.map((item) => [String(item.productId), item]));
        setOperationsTruthByProduct(mapped);
      })
      .catch(() => setOperationsTruthByProduct({}));
  }, [products, environment]);

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

  const fetchPostSaleOverview = useCallback(async () => {
    try {
      const res = await api.get<{ overview: typeof postSaleOverview; environment: string }>('/api/products/post-sale-overview', { params: { environment } });
      if (Array.isArray(res.data?.overview)) setPostSaleOverview(res.data.overview);
      else setPostSaleOverview(null);
    } catch {
      setPostSaleOverview(null);
    }
  }, [environment]);

  const refreshProductsPageLive = useCallback(() => {
    fetchProducts(true).catch(() => {});
    void fetchInventorySummary();
    void fetchPostSaleOverview();
  }, [fetchProducts, fetchInventorySummary, fetchPostSaleOverview]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchProducts();
      void fetchInventorySummary();
      void fetchPostSaleOverview();
    }, 100);
    return () => clearTimeout(timer);
  }, [fetchProducts, fetchInventorySummary, fetchPostSaleOverview]);

  useLiveData({
    fetchFn: refreshProductsPageLive,
    intervalMs: 30000,
    enabled: true,
    pauseWhenHidden: true,
    skipInitialRun: true,
  });
  useNotificationRefetch({
    handlers: {
      PRODUCT_PUBLISHED: refreshProductsPageLive,
      PRODUCT_SCRAPED: refreshProductsPageLive,
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
    validatedReady: inventorySummary?.products?.validatedReady ?? aggregations?.byStatus?.VALIDATED_READY ?? 0,
    published: inventorySummary?.listingsTotal ?? aggregations?.byStatus?.PUBLISHED ?? 0,
  };
  const listingsByMarketplace = inventorySummary?.listingsByMarketplace ?? { ebay: 0, mercadolibre: 0, amazon: 0 };

  // Summary for visible page
  const pageRevenue = products.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
  const pageEstimatedMargin = products.reduce((sum, p) => sum + (Number(p.estimatedUnitMargin ?? p.profit) || 0), 0);

  // CSV Export
  const exportToCSV = () => {
    const csv = [
      ['ID', 'Titulo', 'Status', 'Marketplace', 'Precio', 'Margen estimado', 'URL Marketplace', 'URL Proveedor', 'Fecha'].join(','),
      ...products.map(p => [
        p.id,
        `"${(p.title || '').replace(/"/g, '""')}"`,
        p.status,
        p.marketplace,
        p.price,
        p.estimatedUnitMargin ?? p.profit ?? 0,
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

  const confirmDeleteProduct = async () => {
    if (!deleteTarget) return;
    const productId = deleteTarget.id;
    setDeleteLoading(true);
    try {
      const response = await api.delete(`/api/products/${productId}`);
      toast.success(response.data?.message || 'Producto eliminado');
      setDeleteTarget(null);
      fetchProducts();
      fetchInventorySummary();
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'Error al eliminar producto';
      toast.error(msg);
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatBlockedReason = (reason: string) => {
    const labels: Record<string, string> = {
      missingSku: 'Sin SKU',
      missingShipping: 'Sin shipping',
      unsupportedCountry: 'Pais no soportado',
      unsupportedLanguage: 'Idioma no soportado',
      unresolvedCurrency: 'Moneda no resuelta',
      incompleteFees: 'Fees incompletos',
      policyIncomplete: 'Politica incompleta',
      supplierUnavailable: 'Proveedor invalido',
      invalidMarketplaceContext: 'Contexto invalido',
      preventiveAuditPending: 'Auditoría preventiva pendiente (import oportunidad)',
    };
    return labels[reason] || reason;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      PENDING: 'warning',
      APPROVED: 'secondary',
      VALIDATED_READY: 'success',
      PUBLISHED: 'default',
      REJECTED: 'destructive',
      BLOCKED: 'destructive',
      LEGACY_UNVERIFIED: 'secondary',
      VALIDATION_INCOMPLETE: 'secondary',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const getLiveStateBadge = (state: string | null | undefined) => {
    const normalized = String(state || '').trim().toLowerCase();
    if (normalized === 'active') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">active</Badge>;
    if (normalized === 'under_review') return <Badge variant="outline" className="text-amber-700 border-amber-300 dark:text-amber-300">under_review</Badge>;
    if (normalized === 'paused') return <Badge variant="outline" className="text-orange-700 border-orange-300 dark:text-orange-300">paused</Badge>;
    if (normalized === 'failed_publish' || normalized === 'not_found') return <Badge variant="destructive">{normalized}</Badge>;
    return <Badge variant="outline" className="text-slate-500">unknown</Badge>;
  };

  const totalFiltered = paginationMeta?.total ?? products.length;
  const totalPages = paginationMeta?.totalPages ?? 1;
  const selectedOpsTruth = selectedProduct ? operationsTruthByProduct[selectedProduct.id] : null;
  const selectedLifecycle = selectedProduct
    ? resolveOperationalLifecycleStage({
        product: selectedProduct,
        operationsTruth: selectedOpsTruth,
      })
    : null;

  const selectClass = "px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-900 text-sm dark:text-slate-200";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Package}
        title="Productos"
        subtitle="Catalogo real · candidatos validados, bloqueos operativos y legacy congelado"
        below={<CycleStepsBreadcrumb currentStep={3} />}
        actions={
          <div className="flex flex-wrap gap-2">
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
        }
      />

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

      {/* Post-sale overview */}
      {!setupRequired && postSaleOverview && postSaleOverview.length > 0 && (
        <Card className="rounded-xl border border-slate-200 dark:border-slate-800 shadow-card">
          <CardHeader className="px-5 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="w-4 h-4" />
                Estado post-venta por producto
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowPostSaleOverview((v) => !v)}>
                {showPostSaleOverview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Última venta/orden por producto publicado (eBay, Mercado Libre, Amazon)</p>
          </CardHeader>
          {showPostSaleOverview && (
            <CardContent className="px-5 pb-4 pt-0">
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Producto</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Listings</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Última orden</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {postSaleOverview.map((row) => (
                      <tr key={row.productId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={row.productTitle}>{row.productTitle}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300">
                          {row.listings.map((l) => (
                            <Badge key={`${l.marketplace}-${l.listingId}`} variant="outline" className="mr-1 text-xs">
                              {l.marketplace === 'ebay' ? 'eBay' : l.marketplace === 'mercadolibre' ? 'ML' : l.marketplace}
                            </Badge>
                          ))}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300">{row.lastOrder?.marketplaceOrderId ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          {row.lastOrder ? (
                            <Badge variant={row.lastOrder.fulfillmentAutomationStatus === 'completed' ? 'default' : row.lastOrder.fulfillmentAutomationStatus === 'failed' ? 'destructive' : 'secondary'}>
                              {row.lastOrder.orderStatus} / {row.lastOrder.fulfillmentAutomationStatus}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {row.lastOrder && (
                            <a href="/orders" className="text-blue-600 dark:text-blue-400 hover:underline text-xs">Ver órdenes</a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ML Canary panel */}
      <Card className="rounded-xl border border-blue-200 dark:border-blue-900/50 shadow-card">
        <CardHeader className="px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Store className="w-4 h-4 text-blue-600" />
              Canary publicación Mercado Libre (Chile)
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setMlCanaryPanelOpen((o) => {
                  const open = !o;
                  if (open) void loadMlCanaryCandidates();
                  return open;
                });
              }}
            >
              {mlCanaryPanelOpen ? 'Ocultar' : 'Mostrar / actualizar'}
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Ordena tus productos <span className="font-medium">VALIDATED_READY</span> por idoneidad para un primer ciclo real (mismas comprobaciones que el preflight). Usa un candidato con{' '}
            <span className="font-medium">publishAllowed</span> y mejor <span className="font-medium">tier</span>; evita forzar un SKU con imágenes bloqueadas.
          </p>
        </CardHeader>
        {mlCanaryPanelOpen && (
          <CardContent className="px-5 pb-4 pt-0">
            {mlCanaryLoading ? (
              <p className="text-sm text-slate-600">Ejecutando preflight en lote…</p>
            ) : mlCanaryData && mlCanaryData.candidates.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">ID</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Título</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tier</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Score</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Listo</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {mlCanaryData.candidates.map((c) => (
                      <tr key={c.productId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 font-mono">{c.productId}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 max-w-[220px] truncate" title={c.title || ''}>
                          {c.title || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={c.canaryTier === 'recommended' ? 'default' : c.canaryTier === 'blocked' ? 'destructive' : 'secondary'}>
                            {c.canaryTier}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300">{c.canaryScore}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300">{c.publishAllowed ? 'sí' : 'no'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                            onClick={() => navigate(`/products/${c.productId}/preview?marketplace=mercadolibre`)}
                          >
                            Preview ML
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mlCanaryData.candidates.some((c) => c.topBlockers.length > 0) && (
                  <p className="text-xs text-slate-500 mt-2 px-4 pb-2">
                    Revisa bloqueadores en preview; el listado trunca causas a 5 por producto.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-600">No hay candidatos o aún no se ha cargado. Pulsa «Mostrar / actualizar».</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card cursor-pointer hover:ring-2 hover:ring-blue-300 transition-shadow" onClick={() => { updateFilter('status', 'ALL'); }}>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-2xl font-bold tabular-nums">{stats.total.toLocaleString()}</p>
              </div>
              <Package className="w-6 h-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card cursor-pointer hover:ring-2 hover:ring-yellow-300 transition-shadow" onClick={() => { updateFilter('status', filters.status === 'PENDING' ? 'ALL' : 'PENDING'); }}>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Pendientes</p>
                <p className="text-2xl font-bold tabular-nums text-yellow-600">{(stats.pending).toLocaleString()}</p>
              </div>
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card cursor-pointer hover:ring-2 hover:ring-green-300 transition-shadow" onClick={() => { updateFilter('status', filters.status === 'VALIDATED_READY' ? 'ALL' : 'VALIDATED_READY'); }}>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Validados</p>
                <p className="text-2xl font-bold tabular-nums text-green-600">{(stats.validatedReady).toLocaleString()}</p>
              </div>
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card cursor-pointer hover:ring-2 hover:ring-purple-300 transition-shadow" onClick={() => { updateFilter('status', filters.status === 'PUBLISHED' ? 'ALL' : 'PUBLISHED'); }}>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Publicados</p>
                <p className="text-2xl font-bold tabular-nums text-purple-600">{(stats.published).toLocaleString()}</p>
                {stats.published > 0 && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
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
              <Upload className="w-6 h-6 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="rounded-xl border border-slate-200 dark:border-slate-800 shadow-card">
        <CardHeader className="px-5 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filtros
            </CardTitle>
            <div className="flex items-center gap-2">
              {activeFilters.length > 0 && (
                <Button variant="ghost" onClick={resetFilters} className="text-xs text-slate-500 hover:text-red-500 h-7 px-2">
                  Limpiar todo
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="text-xs flex items-center gap-1 h-7 px-2"
              >
                {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showAdvancedFilters ? 'Menos filtros' : 'Mas filtros'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-0 space-y-3">
          {/* Row 1: Basic filters (always visible) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
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
              <option value="VALIDATED_READY">Validado</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="LEGACY_UNVERIFIED">Legacy congelado</option>
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
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Category */}
                <div>
                  <label className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mb-1">
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
                  <label className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mb-1">
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
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">Desde</label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => updateFilter('dateFrom', e.target.value)}
                    className={selectClass + ' w-full'}
                  />
                </div>
                {/* Date to */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">Hasta</label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => updateFilter('dateTo', e.target.value)}
                    className={selectClass + ' w-full'}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Price min */}
                <div>
                  <label className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mb-1">
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
                  <label className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mb-1">
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
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">Enlace marketplace</label>
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
                  <label className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mb-1">
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
                      className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
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
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                >
                  {af.label}: {af.value}
                  <button onClick={() => removeFilter(af.key)} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button onClick={resetFilters} className="text-xs text-slate-400 hover:text-red-500 underline ml-1">
                Limpiar todos
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="rounded-xl border border-slate-200 dark:border-slate-800 shadow-card">
        <CardHeader className="px-5 py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold">Productos ({totalFiltered.toLocaleString()})</CardTitle>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>Revenue pagina: <strong className="text-slate-700 dark:text-slate-200">{formatCurrencySimple(pageRevenue, 'USD')}</strong></span>
              <span>Margen unitario estimado (página): <strong className="text-green-600">{formatCurrencySimple(pageEstimatedMargin, 'USD')}</strong></span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-0">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-sm text-slate-500">Cargando productos...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 max-w-md mx-auto">
              <Package className="w-14 h-14 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <p className="font-medium text-slate-700 dark:text-slate-300 mb-2">Sin productos</p>
              <p className="text-sm text-slate-500 mb-4">
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
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Producto</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">SKU</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Marketplace</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Enlaces</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Precio</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Lifecycle canónico</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ganador</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Workflow</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Margen estimado</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {products.map((product) => {
                      const opsTruth = operationsTruthByProduct[product.id];
                      const lifecycle = resolveOperationalLifecycleStage({
                        product,
                        operationsTruth: opsTruth,
                      });
                      return (
                      <tr key={product.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 -m-2 p-2 rounded-lg"
                            onClick={() => { setSelectedProduct(product); setShowModal(true); }}
                          >
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.title} className="w-10 h-10 rounded-lg object-cover" />
                            ) : (
                              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                                <Package className="w-5 h-5 text-slate-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-medium text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate">{product.title}</div>
                              {product.validationState && product.validationState !== product.status && (
                                <div className="text-xs text-slate-500 truncate">
                                  Estado seguro: {product.validationState}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{product.sku}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {product.marketplaceListings && product.marketplaceListings.length > 0 ? (
                              (() => {
                                const mps = Array.from(new Set(product.marketplaceListings.map((l: MarketplaceListing) => l.marketplace)))
                                  .map((mp) => displayMarketplace(mp))
                                  .filter((mp) => mp !== '—');
                                if (mps.length === 0) return <Badge variant="outline" className="text-slate-500">—</Badge>;
                                return mps.map((mp) => <Badge key={mp} variant="outline" className="text-xs">{mp}</Badge>);
                              })()
                            ) : (
                              <Badge variant="outline" className="text-slate-500">{displayMarketplace(product.marketplace)}</Badge>
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
                                  <span key={listing.id} className="inline-flex items-center gap-1 text-slate-500 text-sm">
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
                              <a href={product.aliexpressUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:underline text-sm">
                                <Link2 className="w-4 h-4 shrink-0" />
                                Proveedor
                              </a>
                            )}
                            {(!product.marketplaceListings || product.marketplaceListings.length === 0) && !product.marketplaceUrl && !product.aliexpressUrl && (
                              <span className="text-slate-400 text-sm">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                          {formatCurrencySimple(product.price, product.currency || 'USD')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1 max-w-[250px]">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${lifecycleToneClasses(lifecycle.tone)}`}
                            >
                              {lifecycle.label}
                            </span>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate" title={lifecycle.detail}>
                              {lifecycle.detail}
                            </div>
                            {opsTruth?.blockerCode ? (
                              <div
                                className="text-xs text-red-600 dark:text-red-400 truncate"
                                title={opsTruth.blockerMessage || opsTruth.blockerCode}
                              >
                                Blocker: {opsTruth.blockerCode}
                              </div>
                            ) : null}
                            {product.validationState && product.validationState !== product.status ? (
                              <div className="text-[11px] text-slate-500">
                                DB: {product.status}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {product.winnerDetectedAt ? (
                            <Badge
                              variant="secondary"
                              className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                              title={`Ganador detectado el ${new Date(product.winnerDetectedAt).toLocaleDateString()}. Regla: ventas en los últimos N días >= umbral.`}
                            >
                              Ganador
                            </Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <WorkflowStatusIndicator
                            productId={Number(product.id)}
                            preloadedCurrentStage={workflowByProduct[product.id]?.currentStage}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {(product.estimatedUnitMargin ?? product.profit) ? (
                            <span className="text-sm font-medium text-green-600">
                              +{formatCurrencySimple(product.estimatedUnitMargin ?? product.profit ?? 0, product.currency || 'USD')}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => navigate(`/products/${product.id}/preview`)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Preview">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={() => navigate(`/products/${product.id}/preview?showFinancial=true`)} className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors" title="Info financiera">
                              <Calculator className="w-4 h-4" />
                            </button>
                            {product.status === 'PENDING' && (
                              <>
                                <button onClick={() => handleApprove(product.id)} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg" title="Aprobar">
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleReject(product.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg" title="Rechazar">
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {product.status === 'VALIDATED_READY' && (
                              <button onClick={() => handlePublish(product.id)} className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg" title="Publicar validado">
                                <Upload className="w-4 h-4" />
                              </button>
                            )}
                            {product.status === 'PUBLISHED' && (
                              <button onClick={() => handleUnpublish(product.id)} className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg" title="Despublicar">
                                <Archive className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(product)}
                              disabled={deleteLoading}
                              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg disabled:opacity-50"
                              title={isAdminUser ? 'Eliminar producto (admin / dueño)' : 'Eliminar producto (solo si no tiene ventas)'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500">
                    Pagina {currentPage} de {totalPages} ({totalFiltered.toLocaleString()} productos)
                  </p>
                  <div className="flex gap-1.5 items-center">
                    <Button variant="outline" className="h-7 px-2.5 text-[11px]" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                      Primera
                    </Button>
                    <Button variant="outline" className="h-7 px-2.5 text-[11px]" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                      Anterior
                    </Button>
                    <span className="text-xs font-medium tabular-nums px-2">{currentPage}</span>
                    <Button variant="outline" className="h-7 px-2.5 text-[11px]" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                      Siguiente
                    </Button>
                    <Button variant="outline" className="h-7 px-2.5 text-[11px]" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                      Ultima
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="delete-product-title">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800">
            <h2 id="delete-product-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Eliminar producto
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Vas a eliminar de forma permanente el producto <strong className="text-slate-900 dark:text-slate-100">#{deleteTarget.id}</strong>
              {deleteTarget.title ? (
                <>
                  : <span className="italic">{deleteTarget.title.slice(0, 120)}{deleteTarget.title.length > 120 ? '…' : ''}</span>
                </>
              ) : null}
              . No se puede deshacer.
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-2 py-1.5">
              El backend rechaza la eliminación si el producto tiene ventas u órdenes asociadas (historial). Si está publicado, podés despublicar antes si tu flujo lo requiere.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => !deleteLoading && setDeleteTarget(null)} disabled={deleteLoading}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void confirmDeleteProduct()}
                disabled={deleteLoading}
                className="min-w-[7rem]"
              >
                {deleteLoading ? 'Eliminando…' : 'Eliminar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {showModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold dark:text-slate-100">Detalles del producto</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {selectedProduct.imageUrl ? (
                <div className="flex justify-center">
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.title}
                    className="w-full max-w-md h-64 object-cover rounded-xl shadow-md"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const placeholder = target.nextElementSibling as HTMLElement;
                      if (placeholder) placeholder.style.display = 'flex';
                    }}
                  />
                  <div className="w-full max-w-md h-64 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center hidden">
                    <div className="text-center">
                      <Package className="w-16 h-16 text-slate-400 mx-auto mb-2" />
                      <p className="text-slate-500 text-sm">Imagen no disponible</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="w-full max-w-md h-64 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                    <div className="text-center">
                      <Package className="w-16 h-16 text-slate-400 mx-auto mb-2" />
                      <p className="text-slate-500 text-sm">Sin imagen</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Titulo</p>
                  <p className="font-medium text-sm dark:text-slate-100">{selectedProduct.title}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">SKU</p>
                  <p className="font-medium text-sm dark:text-slate-100">{selectedProduct.sku}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Precio</p>
                  <p className="font-medium text-lg dark:text-slate-100">
                    {formatCurrencySimple(selectedProduct.price, selectedProduct.currency || 'USD')}
                  </p>
                </div>
                <div>
                  <MetricLabelWithTooltip label="Marketplace" tooltipBody={metricTooltips.marketplace.body} className="text-xs text-slate-500">
                    <p className="text-xs text-slate-500">Marketplace</p>
                  </MetricLabelWithTooltip>
                  <Badge variant="outline">{displayMarketplace(selectedProduct.marketplace)}</Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Lifecycle canónico</p>
                  {selectedLifecycle ? (
                    <div className="space-y-1">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${lifecycleToneClasses(selectedLifecycle.tone)}`}
                      >
                        {selectedLifecycle.label}
                      </span>
                      <p className="text-xs text-slate-600 dark:text-slate-300">{selectedLifecycle.detail}</p>
                    </div>
                  ) : (
                    getStatusBadge(selectedProduct.validationState || selectedProduct.status)
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">
                    Estado de BD: {selectedProduct.status}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Contexto resuelto</p>
                  <p className="font-medium text-sm dark:text-slate-100">
                    {selectedProduct.resolvedCountry || '—'} / {selectedProduct.resolvedLanguage || '—'} / {selectedProduct.resolvedCurrency || '—'}
                  </p>
                  {typeof selectedProduct.feeCompleteness === 'number' && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Fees completos: {Math.round(selectedProduct.feeCompleteness * 100)}%
                    </p>
                  )}
                </div>
                {selectedProduct.profit ? (
                  <div>
                    <MetricLabelWithTooltip label="Estimated unit margin" tooltipBody={metricTooltips.potentialProfit.body} className="text-xs text-slate-500">
                      <p className="text-xs text-slate-500">Margen unitario estimado</p>
                    </MetricLabelWithTooltip>
                    <p className="font-medium text-green-600 text-lg">
                      +{formatCurrencySimple(selectedProduct.estimatedUnitMargin ?? selectedProduct.profit ?? 0, selectedProduct.currency || 'USD')}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs text-slate-500">Creado</p>
                  <p className="font-medium text-sm dark:text-slate-100">{new Date(selectedProduct.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              {selectedProduct.blockedReasons && selectedProduct.blockedReasons.length > 0 && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Bloqueos operativos</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedProduct.blockedReasons.map((reason) => (
                      <Badge key={reason} variant="destructive">
                        {formatBlockedReason(reason)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {selectedOpsTruth && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Evidencia operacional (listado, blocker, proof)
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Estado live marketplace</p>
                      <div className="mt-1">{getLiveStateBadge(selectedOpsTruth.externalMarketplaceState)}</div>
                      {selectedOpsTruth.externalMarketplaceSubStatus.length > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          {selectedOpsTruth.externalMarketplaceSubStatus.join(', ')}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Blocker actual</p>
                      <p className="font-medium text-sm text-slate-900 dark:text-slate-100">
                        {selectedOpsTruth.blockerCode || 'Sin blocker'}
                      </p>
                      {selectedOpsTruth.nextAction && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                          Next: {selectedOpsTruth.nextAction}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Proof ladder</p>
                      <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-1">
                        order={selectedOpsTruth.orderIngested ? 'yes' : 'no'} · supplier={selectedOpsTruth.supplierPurchaseProved ? 'yes' : 'no'} · tracking={selectedOpsTruth.trackingAttached ? 'yes' : 'no'} · payout={selectedOpsTruth.releasedFundsObtained ? 'yes' : 'no'} · realized={selectedOpsTruth.realizedProfitObtained ? 'yes' : 'no'}
                      </p>
                    </div>
                    {selectedOpsTruth.agentTrace && (
                      <div>
                        <p className="text-xs text-slate-500">Última decisión de agente</p>
                        <p className="font-medium text-sm text-slate-900 dark:text-slate-100">
                          {selectedOpsTruth.agentTrace?.agentName} · {selectedOpsTruth.agentTrace?.decision}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {selectedOpsTruth.agentTrace?.reasonCode}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {(selectedProduct.marketplaceUrl || selectedProduct.aliexpressUrl) && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Enlaces</p>
                  <div className="flex flex-wrap gap-3">
                    {selectedProduct.marketplaceUrl && (
                      <a href={selectedProduct.marketplaceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm">
                        <Store className="w-4 h-4" />
                        Ver en {displayMarketplace(selectedProduct.marketplace)}
                      </a>
                    )}
                    {selectedProduct.aliexpressUrl && (
                      <a href={selectedProduct.aliexpressUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm">
                        <Link2 className="w-4 h-4" />
                        Proveedor (AliExpress)
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex gap-3 justify-end">
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
