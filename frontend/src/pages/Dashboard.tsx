import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  TrendingUp,
  Brain,
  BarChart3,
  AlertCircle,
  ChevronRight,
  DollarSign,
  ShoppingBag,
  Activity,
  Package,
  Radio,
  CheckCircle2,
  XCircle,
  Truck,
  ArrowRight,
  RefreshCw,
  Target,
  Layers,
  Settings,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@services/api';
import LoadingSpinner, { CardSkeleton } from '@/components/ui/LoadingSpinner';
import InventorySummaryCard from '@/components/InventorySummaryCard';
import AutopilotLiveWidget from '@/components/AutopilotLiveWidget';
import BalanceSummaryWidget from '@/components/BalanceSummaryWidget';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';
import { log } from '@/utils/logger';
import { getTrendingKeywords, type TrendKeyword } from '@/services/trends.api';
import { useAuthStore } from '@stores/authStore';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import type { InventorySummary } from '@/types/dashboard';
import type { OperationsTruthResponse } from '@/types/operations';
import { fetchOperationsTruth } from '@/services/operationsTruth.api';

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam && ['overview', 'trends'].includes(tabParam) ? tabParam : 'overview');
  const { environment, setEnvironment, isProduction: isProductionMode } = useEnvironment();

  // Real backend health state
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [trendingKeywords, setTrendingKeywords] = useState<TrendKeyword[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);

  // Datos del dashboard principal (desde GET /api/dashboard/stats)
  const [dashboardData, setDashboardData] = useState({
    totalRevenue: 0,
    totalProfit: 0,
    platformCommissionPaid: 0,
    salesCount: 0,
    activeProducts: 0
  });
  const [loading, setLoading] = useState(true);
  const [dataLoadError, setDataLoadError] = useState(false);
  const [lastDataUpdated, setLastDataUpdated] = useState<string | null>(null);

  const [recentActivity, setRecentActivity] = useState<Array<{
    id: string;
    type: string;
    title: string;
    amount: string;
    time: string;
    status: string;
  }>>([]);

  const [platformRevenue, setPlatformRevenue] = useState<{
    totalPlatformRevenue: number;
    totalCommissionsCollected: number;
    salesCount: number;
    perUser: Array<{ userId: number; username: string; email: string; salesCount: number; grossProfit: number; platformCommission: number; userProfit: number }>;
  } | null>(null);

  const [businessDiagnostics, setBusinessDiagnostics] = useState<Record<string, { status: string; message?: string; count?: number }> | null>(null);

  const [inventorySummary, setInventorySummary] = useState<InventorySummary | null>(null);

  /** Última orden (venta real) para card "Estado de la única venta real" */
  const [latestOrder, setLatestOrder] = useState<{
    id: string;
    status: string;
    errorMessage?: string | null;
    paypalOrderId?: string | null;
    createdAt: string;
    title?: string | null;
  } | null>(null);
  const [operationsTruth, setOperationsTruth] = useState<OperationsTruthResponse | null>(null);
  const [autopilotRuntime, setAutopilotRuntime] = useState<{ running: boolean; status: string; lastRun?: string | null } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDashboardData();
    }, 100);
    return () => clearTimeout(timer);
  }, [environment]);

  // Sincronizar tab desde URL (p. ej. /dashboard?tab=trends)
  useEffect(() => {
    if (tabParam && ['overview', 'trends'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Load real trends when trends tab is active
  useEffect(() => {
    if (activeTab !== 'trends') return;
    let cancelled = false;
    setTrendsLoading(true);
    getTrendingKeywords({ region: 'US', maxKeywords: 20 })
      .then((kw) => { if (!cancelled) setTrendingKeywords(kw); })
      .catch(() => { if (!cancelled) setTrendingKeywords([]); })
      .finally(() => { if (!cancelled) setTrendsLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // ✅ B6: CARGAR DATOS REALES DE LA API (completado)
      // ✅ FIX-002: Degradación suave - rastrear errores para mostrar mensaje informativo
      let hasErrors = false;
      const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
      const allResponses = await Promise.all([
        api.get('/api/dashboard/stats', { params: { environment } }).catch(err => {
          // ✅ FIX: Si es setup_required, no marcar como error (se manejará en App.tsx)
          if (err.response?.data?.setupRequired === true || err.response?.data?.error === 'setup_required') {
            // Redirigir a setup (el hook useSetupCheck se encargará)
            return { data: { setupRequired: true } };
          }
          hasErrors = true;
          // Solo loggear si es error HTTP real (no CORS/red)
          if (err.response) {
            log.warn('⚠️  Error loading stats (HTTP):', err.response.status);
          } else {
            log.warn('⚠️  Error loading stats (red/CORS):', err.message);
          }
          return { data: {} };
        }),
        api.get('/api/dashboard/recent-activity', { params: { limit: 10, environment } }).catch(err => {
          hasErrors = true;
          if (err.response) {
            log.warn('⚠️  Error loading activity (HTTP):', err.response.status);
          } else {
            log.warn('⚠️  Error loading activity (red/CORS):', err.message);
          }
          return { data: { activities: [] } };
        }),
        // Inventario (productos, listings, órdenes, compras pendientes) - en vivo vía loadDashboardData
        api.get('/api/dashboard/inventory-summary', { params: { environment } }).catch(err => {
          if (err.response) {
            log.warn('⚠️  Error loading inventory summary (HTTP):', err.response.status);
          } else {
            log.warn('⚠️  Error loading inventory summary (red/CORS):', err.message);
          }
          return { data: null };
        }),
        // Estado del sistema (business diagnostics - ventas/listings por usuario y entorno)
        api.get('/api/system/business-diagnostics', { params: { environment } }).catch(() => ({ data: null })),
        // Backend health
        api.get('/api/health').then((r) => ({ ok: r.status === 200 })).catch(() => ({ ok: false })),
        // Ingresos plataforma (solo admin)
        isAdmin ? api.get('/api/admin/platform-revenue').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        // Canonical operations truth
        fetchOperationsTruth({ environment }).catch(() => null),
        // Real autopilot runtime
        api.get('/api/autopilot/status').catch(() => ({ data: null })),
        // Última orden (para card "Estado de la única venta real")
        api.get('/api/orders', { params: { limit: 1, environment } }).catch(() => ({ data: [] })),
      ]);
      const [statsRes, activityRes, inventoryRes, businessDiagRes, healthRes, platformRevRes] = allResponses;
      const operationsTruthRes = allResponses[6] as OperationsTruthResponse | null;
      const autopilotStatusRes = allResponses[7] as { data?: { running?: boolean; status?: string; lastRun?: string | null } | null };
      const ordersRes = allResponses[8] as { data?: Array<{ id: string; status: string; errorMessage?: string | null; paypalOrderId?: string | null; createdAt: string; title?: string | null }> };

      // ✅ FIX-002: Si hay errores y no hay datos reales, mostrar mensaje informativo
      const hasRealData = statsRes.data && Object.keys(statsRes.data).length > 0;
      setDataLoadError(hasErrors && !hasRealData);

      const stats = statsRes.data || {};
      if (stats._lastUpdated) setLastDataUpdated(stats._lastUpdated);
      const activities = activityRes.data?.activities || [];

      // Backend: { products, sales: { totalSales (count), totalRevenue, totalProfit, totalCommissions, platformCommissionPaid }, commissions }
      const totalRevenue = Number(stats?.sales?.totalRevenue ?? stats?.sales?.total ?? 0);
      const totalProfit = Number(stats?.sales?.totalProfit ?? 0);
      const platformCommissionPaid = Number(stats?.sales?.platformCommissionPaid ?? stats?.sales?.totalCommissions ?? 0);
      const salesCount = Number(stats?.sales?.totalSales ?? 0);
      const inv = inventoryRes?.data;
      const listingsTotal = typeof inv?.listingsTotal === 'number'
        ? inv.listingsTotal
        : (inv?.listingsByMarketplace
          ? (inv.listingsByMarketplace.ebay ?? 0) + (inv.listingsByMarketplace.mercadolibre ?? 0) + (inv.listingsByMarketplace.amazon ?? 0)
          : undefined);
      const activeProducts = Number(listingsTotal ?? stats?.products?.published ?? stats?.products?.active ?? 0);

      setDashboardData({
        totalRevenue,
        totalProfit,
        platformCommissionPaid,
        salesCount,
        activeProducts
      });

      // Formatear actividad reciente desde datos reales
      const formattedActivities = activities.map((activity: any, index: number) => {
        const timeAgo = formatTimeAgo(new Date(activity.createdAt));
        let type = 'activity';
        let status = 'info';
        let amount = '';

        // Determinar tipo y estado basado en la acción
        if (activity.action.includes('login')) {
          type = 'activity';
          status = 'info';
        } else if (activity.action.includes('sale') || activity.action.includes('SALE')) {
          type = 'sale';
          status = 'success';
          // Extraer monto si está en description
          const amountMatch = activity.description.match(/\$([\d.]+)/);
          amount = amountMatch ? `+$${amountMatch[1]}` : '';
        } else if (activity.action.includes('product') || activity.action.includes('PRODUCT')) {
          type = 'inventory';
          status = 'info';
        } else if (activity.action.includes('opportunity') || activity.action.includes('OPPORTUNITY')) {
          type = 'opportunity';
          status = 'info';
        }

        return {
          id: String(activity.id || index),
          type,
          title: activity.description || activity.action,
          amount: amount || '',
          time: timeAgo,
          status
        };
      });

      setRecentActivity(formattedActivities);

      // Inventory summary para InventorySummaryCard (en vivo)
      if (inv && typeof inv === 'object') {
        const listTotal = typeof inv.listingsTotal === 'number'
          ? inv.listingsTotal
          : (inv.listingsByMarketplace
            ? (inv.listingsByMarketplace.ebay ?? 0) + (inv.listingsByMarketplace.mercadolibre ?? 0) + (inv.listingsByMarketplace.amazon ?? 0)
            : 0);
        setInventorySummary({
          products: inv.products ?? { total: 0, pending: 0, approved: 0, published: 0 },
          listingsByMarketplace: inv.listingsByMarketplace ?? { ebay: 0, mercadolibre: 0, amazon: 0 },
          listingsTotal: listTotal,
          listingsSource: inv.listingsSource,
          lastSyncAt: inv.lastSyncAt,
          ordersByStatus: inv.ordersByStatus ?? { CREATED: 0, PAID: 0, PURCHASING: 0, PURCHASED: 0, FAILED: 0 },
          pendingPurchasesCount: inv.pendingPurchasesCount ?? 0,
        });
      } else {
        setInventorySummary(null);
      }

      // Última orden para card "Estado de la única venta real"
      const ordersList = Array.isArray(ordersRes?.data) ? ordersRes.data : [];
      const lastOrder = ordersList[0];
      setLatestOrder(
        lastOrder
          ? {
              id: lastOrder.id,
              status: lastOrder.status,
              errorMessage: lastOrder.errorMessage ?? null,
              paypalOrderId: lastOrder.paypalOrderId ?? null,
              createdAt: lastOrder.createdAt,
              title: (lastOrder as { title?: string | null }).title ?? null,
            }
          : null
      );

      // Estado del sistema (business diagnostics) - en vivo
      if (businessDiagRes?.data && typeof businessDiagRes.data === 'object' && !(businessDiagRes.data as any).error) {
        setBusinessDiagnostics(businessDiagRes.data as Record<string, { status: string; message?: string; count?: number }>);
      } else {
        setBusinessDiagnostics(null);
      }

      // Backend health - en vivo
      setBackendHealthy(healthRes?.ok === true);

      // Ingresos plataforma (admin) - en vivo
      if (isAdmin && platformRevRes?.data?.success && platformRevRes.data.totalPlatformRevenue !== undefined) {
        setPlatformRevenue({
          totalPlatformRevenue: platformRevRes.data.totalPlatformRevenue ?? 0,
          totalCommissionsCollected: platformRevRes.data.totalCommissionsCollected ?? 0,
          salesCount: platformRevRes.data.salesCount ?? 0,
          perUser: platformRevRes.data.perUser ?? [],
        });
      } else {
        setPlatformRevenue(null);
      }

      if (operationsTruthRes && typeof operationsTruthRes === 'object' && Array.isArray(operationsTruthRes.items)) {
        setOperationsTruth(operationsTruthRes);
      } else {
        setOperationsTruth(null);
      }
      if (autopilotStatusRes?.data) {
        setAutopilotRuntime({
          running: autopilotStatusRes.data.running === true,
          status: autopilotStatusRes.data.status ?? 'unknown',
          lastRun: autopilotStatusRes.data.lastRun ?? null,
        });
      } else {
        setAutopilotRuntime(null);
      }
    } catch (error: any) {
      log.error('Error loading dashboard data:', error);
      // ✅ FIX-002: No mostrar toast automático, solo marcar error
      setDataLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useLiveData({
    fetchFn: loadDashboardData,
    intervalMs: 15000,
    enabled: activeTab === 'overview',
  });
  useNotificationRefetch({
    handlers: {
      SALE_CREATED: loadDashboardData,
      PRODUCT_PUBLISHED: loadDashboardData,
      INVENTORY_UPDATED: loadDashboardData,
      SYSTEM_ALERT: loadDashboardData,
    },
    enabled: activeTab === 'overview',
  });

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Hace unos momentos';
    if (diffMins < 60) return `Hace ${diffMins}min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    return date.toLocaleDateString();
  };

  const tabs = [
    { id: 'overview', label: 'Resumen', icon: BarChart3 },
    { id: 'trends', label: 'Tendencias', icon: TrendingUp },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sale': return <DollarSign className="h-4 w-4 text-green-600" />;
      case 'opportunity': return <Brain className="h-4 w-4 text-blue-600" />;
      case 'automation': return <Settings className="h-4 w-4 text-purple-600" />;
      case 'inventory': return <ShoppingBag className="h-4 w-4 text-orange-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getActivityBg = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-50 border-green-200';
      case 'info': return 'bg-blue-50 border-blue-200';
      case 'warning': return 'bg-yellow-50 border-yellow-200';
      case 'alert': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700';
    }
  };

  const truthSummary = operationsTruth?.summary;
  const blockerTotal = (truthSummary?.blockerCounts ?? []).reduce((acc, blocker) => acc + Number(blocker.count || 0), 0);
  const activeListingsCount = truthSummary?.liveStateCounts.active ?? dashboardData.activeProducts;
  const underReviewCount = truthSummary?.liveStateCounts.under_review ?? 0;
  const failedPublishCount = truthSummary?.liveStateCounts.failed_publish ?? 0;
  const orderIngestedCount = truthSummary?.proofCounts.orderIngested ?? 0;
  const trackingAttachedCount = truthSummary?.proofCounts.trackingAttached ?? 0;
  const fulfillmentPendingCount = Math.max(orderIngestedCount - trackingAttachedCount, 0);
  const realizedProfitCount = truthSummary?.proofCounts.realizedProfitObtained ?? 0;
  const readyToPublishCount = inventorySummary?.products?.approved ?? 0;
  const pilotOrReviewCount = operationsTruth?.items?.filter((item) => {
    const externalState = String(item.externalMarketplaceState || '').toLowerCase();
    const hasPilotSignal = [
      item.localListingState,
      item.publicationReadinessState,
      ...(item.externalMarketplaceSubStatus ?? []),
    ].some((value) => String(value || '').toLowerCase().includes('pilot'));
    return hasPilotSignal || externalState === 'under_review';
  }).length ?? underReviewCount;
  const immediateActionCount = blockerTotal + (inventorySummary?.pendingPurchasesCount ?? 0) + failedPublishCount;
  const topBlockers = [...(truthSummary?.blockerCounts ?? [])].sort((a, b) => b.count - a.count).slice(0, 3);
  const actionableTruthItems = (operationsTruth?.items ?? [])
    .filter((item) => item.blockerCode || item.nextAction)
    .slice(0, 5);
  const getTruthActionTarget = (item: NonNullable<OperationsTruthResponse['items'][number]>) => {
    if (item.orderIngested && !item.trackingAttached) {
      return { to: '/orders', label: 'Ir a Órdenes' };
    }
    if (item.externalMarketplaceState && item.externalMarketplaceState !== 'unknown') {
      return { to: '/publisher', label: 'Ir a Publicador' };
    }
    return { to: '/products', label: 'Ir a Productos' };
  };

  const renderOverview = () => (
    <div className="space-y-4">
      {/* DATA ERROR BANNER */}
      {dataLoadError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-900 dark:text-amber-100 flex-1">Algunos datos no pudieron refrescarse — mostrando última evidencia disponible.</p>
          <Link to="/control-center" className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline whitespace-nowrap">Control Center →</Link>
        </div>
      )}

      {/* KPI STRIP */}
      {loading ? (
        <CardSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* LISTOS */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500 text-right leading-tight">Listos</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{readyToPublishCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">para publicar</p>
          </div>

          {/* PILOTO */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                <Radio className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500 text-right leading-tight">Piloto</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{pilotOrReviewCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">en revisión</p>
          </div>

          {/* ACTIVOS */}
          <div className={`rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow ${
            activeListingsCount > 0
              ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
          }`}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                activeListingsCount > 0 ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-slate-100 dark:bg-slate-800'
              }`}>
                <CheckCircle2 className={`h-4 w-4 ${activeListingsCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
              </div>
              <span className={`text-xs text-right leading-tight ${activeListingsCount > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>Activos</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${activeListingsCount > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>{activeListingsCount}</p>
            <p className={`text-xs mt-0.5 ${activeListingsCount > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}>en marketplace</p>
          </div>

          {/* BLOQUEADOS */}
          <div className={`rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow ${
            blockerTotal > 0
              ? 'border-red-200 dark:border-red-800/50 bg-red-50/40 dark:bg-red-900/10'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
          }`}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                blockerTotal > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-slate-100 dark:bg-slate-800'
              }`}>
                <XCircle className={`h-4 w-4 ${blockerTotal > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`} />
              </div>
              <span className={`text-xs text-right leading-tight ${blockerTotal > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>Bloqueados</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${blockerTotal > 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-900 dark:text-white'}`}>{blockerTotal}</p>
            <p className={`text-xs mt-0.5 ${blockerTotal > 0 ? 'text-red-600 dark:text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>{blockerTotal > 0 ? 'requieren acción' : 'sin bloqueos'}</p>
          </div>

          {/* CON ORDEN */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                <ShoppingBag className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500 text-right leading-tight">Con orden</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{orderIngestedCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">órdenes activas</p>
          </div>

          {/* FULFILLMENT */}
          <div className={`rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow ${
            fulfillmentPendingCount > 0
              ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-900/10'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
          }`}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                fulfillmentPendingCount > 0 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-slate-100 dark:bg-slate-800'
              }`}>
                <Truck className={`h-4 w-4 ${fulfillmentPendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
              </div>
              <span className={`text-xs text-right leading-tight ${fulfillmentPendingCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>Fulfillment</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${fulfillmentPendingCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>{fulfillmentPendingCount}</p>
            <p className={`text-xs mt-0.5 ${fulfillmentPendingCount > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-slate-500 dark:text-slate-400'}`}>{fulfillmentPendingCount > 0 ? 'por resolver' : 'al día'}</p>
          </div>
        </div>
      )}

      {/* CYCLE FUNNEL + BLOCKER PANEL */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* BUSINESS CYCLE FUNNEL */}
          <div className="lg:col-span-2 ir-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-500" />
                Ciclo operativo E2E
              </h3>
              {operationsTruth && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {new Date(operationsTruth.generatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {[
                { label: 'Listos', count: readyToPublishCount, textColor: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800' },
                { label: 'Piloto', count: pilotOrReviewCount, textColor: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-200 dark:border-indigo-800' },
                { label: 'Activo', count: activeListingsCount, textColor: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800' },
                { label: 'Con orden', count: orderIngestedCount, textColor: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800' },
                { label: 'Fulfillment', count: fulfillmentPendingCount, textColor: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800' },
                { label: 'Realizado', count: realizedProfitCount, textColor: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/20', border: 'border-teal-200 dark:border-teal-800' },
              ].map((stage, i, arr) => (
                <div key={stage.label} className="flex items-center shrink-0">
                  <div className={`rounded-lg border ${stage.border} ${stage.bg} px-3 py-2 text-center min-w-[72px]`}>
                    <p className={`text-lg font-bold tabular-nums ${stage.textColor}`}>{stage.count}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap">{stage.label}</p>
                  </div>
                  {i < arr.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-slate-300 dark:text-slate-600 mx-0.5 shrink-0" />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              {dashboardData.salesCount > 0 && (
                <span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{dashboardData.salesCount}</span> ventas ·{' '}
                  <span className="font-semibold text-slate-700 dark:text-slate-300">${dashboardData.totalProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span> margen neto
                </span>
              )}
              {dashboardData.totalRevenue > 0 && (
                <span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">${dashboardData.totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span> ingresos
                </span>
              )}
              {(inventorySummary?.pendingPurchasesCount ?? 0) > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  {inventorySummary?.pendingPurchasesCount} compras proveedor pendientes
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <Link to="/products" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">Catálogo →</Link>
              <Link to="/publisher" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">Publisher →</Link>
              <Link to="/orders" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">Órdenes →</Link>
              <Link to="/control-center" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">Control Center →</Link>
            </div>
          </div>

          {/* BLOCKER PANEL */}
          <div className={`rounded-xl border p-4 shadow-sm ${
            immediateActionCount > 0
              ? 'border-red-200 dark:border-red-800/50 bg-red-50/40 dark:bg-red-900/10'
              : 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10'
          }`}>
            <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${
              immediateActionCount > 0 ? 'text-red-800 dark:text-red-200' : 'text-emerald-800 dark:text-emerald-200'
            }`}>
              {immediateActionCount > 0
                ? <XCircle className="h-4 w-4 shrink-0" />
                : <CheckCircle2 className="h-4 w-4 shrink-0" />
              }
              {immediateActionCount > 0 ? `${immediateActionCount} acción${immediateActionCount !== 1 ? 'es' : ''} requerida${immediateActionCount !== 1 ? 's' : ''}` : 'Sin acciones urgentes'}
            </h3>

            {immediateActionCount > 0 ? (
              <div className="space-y-2">
                {(inventorySummary?.pendingPurchasesCount ?? 0) > 0 && (
                  <Link to="/pending-purchases" className="flex items-center justify-between p-2.5 rounded-lg bg-white/80 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 hover:bg-white dark:hover:bg-red-950/30 transition-colors group">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-red-800 dark:text-red-200">{inventorySummary?.pendingPurchasesCount} compras pendientes</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">Proveedor sin ejecutar</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-red-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                )}
                {topBlockers.map((b) => (
                  <Link to="/control-center" key={b.blockerCode} className="flex items-center justify-between p-2.5 rounded-lg bg-white/80 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 hover:bg-white dark:hover:bg-red-950/30 transition-colors group">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-red-800 dark:text-red-200 font-mono">{b.blockerCode}</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{b.count} {b.count === 1 ? 'item' : 'items'} afectados</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-red-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                ))}
                {failedPublishCount > 0 && (
                  <Link to="/publisher" className="flex items-center justify-between p-2.5 rounded-lg bg-white/80 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 hover:bg-white dark:hover:bg-red-950/30 transition-colors group">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-red-800 dark:text-red-200">{failedPublishCount} publicaciones fallidas</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">Revisar publisher</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-red-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                )}
                {(inventorySummary?.products?.pending ?? 0) > 0 && (
                  <Link to="/products" className="flex items-center justify-between p-2.5 rounded-lg bg-white/80 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 hover:bg-white dark:hover:bg-amber-950/30 transition-colors group">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">{inventorySummary?.products?.pending} productos pendientes</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Pendientes de aprobación</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-amber-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Sin blockers activos detectados. El ciclo opera limpio.
              </p>
            )}

            {businessDiagnostics && Object.values(businessDiagnostics).some((v) => v?.status === 'FAIL') && (
              <div className="mt-3 pt-3 border-t border-red-200/50 dark:border-red-800/30 space-y-1.5">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-1"><AlertCircle className="h-3 w-3" />Alertas sistema</p>
                {Object.entries(businessDiagnostics)
                  .filter(([, v]) => v?.status === 'FAIL')
                  .map(([key, v]) => (
                    <p key={key} className="text-xs text-red-700 dark:text-red-300">
                      <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span> {v?.message ?? 'Revisar config'}
                    </p>
                  ))}
              </div>
            )}

            {!operationsTruth && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                Sin datos canónicos en este refresh.{' '}
                <Link to="/control-center" className="font-medium hover:underline">Validar en Control Center →</Link>
              </p>
            )}
          </div>
        </div>
      )}

      {/* QUICK ACTIONS */}
      <div className="flex flex-wrap gap-1.5">
        {([
          { to: '/products', icon: Package, label: 'Productos', style: 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 border-blue-200/70 dark:border-blue-800/40 text-blue-700 dark:text-blue-300' },
          { to: '/publisher', icon: Radio, label: 'Publisher', style: 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30 border-indigo-200/70 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300' },
          { to: '/orders', icon: ShoppingBag, label: 'Órdenes', style: 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/30 border-purple-200/70 dark:border-purple-800/40 text-purple-700 dark:text-purple-300' },
          { to: '/pending-purchases', icon: Truck, label: 'Compras', style: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 border-amber-200/70 dark:border-amber-800/40 text-amber-700 dark:text-amber-300' },
          { to: '/control-center', icon: Target, label: 'Control Center', style: 'bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 border-red-200/70 dark:border-red-800/40 text-red-700 dark:text-red-300' },
          { to: '/sales', icon: TrendingUp, label: 'Ventas', style: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 border-emerald-200/70 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300' },
          { to: '/autopilot', icon: Brain, label: 'Autopilot', style: 'bg-sky-50 hover:bg-sky-100 dark:bg-sky-900/20 dark:hover:bg-sky-900/30 border-sky-200/70 dark:border-sky-800/40 text-sky-700 dark:text-sky-300' },
          { to: '/finance', icon: DollarSign, label: 'Finanzas', style: 'bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/20 dark:hover:bg-teal-900/30 border-teal-200/70 dark:border-teal-800/40 text-teal-700 dark:text-teal-300' },
        ] as const).map(({ to, icon: Icon, label, style }) => (
          <Link key={to} to={to} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${style}`}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </Link>
        ))}
      </div>

      {/* SECONDARY PANELS */}
      <BalanceSummaryWidget />
      <AutopilotLiveWidget />
      <InventorySummaryCard summary={inventorySummary} />

      {/* BOTTOM GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ACTIVITY FEED */}
        <div className="ir-panel p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-slate-400" />
              Actividad reciente
            </h3>
            <Link to="/reports" className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium">Ver reportes →</Link>
          </div>
          <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800">
            {recentActivity.length === 0 ? (
              <div className="py-6 text-center text-slate-400 dark:text-slate-500">
                <Activity className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
                <p className="text-xs">Sin actividad reciente</p>
              </div>
            ) : (
              recentActivity.slice(0, 7).map((activity) => (
                <div key={activity.id} className="flex items-start gap-2.5 py-2">
                  <div className="mt-0.5 shrink-0">{getActivityIcon(activity.type)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-800 dark:text-slate-200 font-medium truncate">{activity.title}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-px">{activity.time}</p>
                  </div>
                  {activity.amount && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">{activity.amount}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: System status + latest order + admin */}
        <div className="space-y-2.5">
          {/* System status compact */}
          <div className="ir-panel p-3">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">Estado del sistema</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {[
                {
                  label: 'Backend',
                  value: backendHealthy === true ? 'Conectado' : backendHealthy === false ? 'No disponible' : 'Verificando…',
                  dot: backendHealthy === true ? 'bg-emerald-400 animate-pulse' : backendHealthy === false ? 'bg-red-400' : 'bg-slate-400',
                  valueColor: backendHealthy === true ? 'text-emerald-600 dark:text-emerald-400' : backendHealthy === false ? 'text-red-600 dark:text-red-400' : 'text-slate-500',
                },
                {
                  label: 'Motor IA',
                  value: backendHealthy === true ? 'Disponible' : '—',
                  dot: backendHealthy === true ? 'bg-blue-400' : 'bg-slate-400',
                  valueColor: backendHealthy === true ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500',
                },
                {
                  label: 'Autopilot runtime',
                  value: autopilotRuntime?.running ? 'Ejecutándose' : autopilotRuntime?.status ? 'Detenido' : 'Sin prueba',
                  dot: autopilotRuntime?.running ? 'bg-blue-400 animate-pulse' : 'bg-slate-400',
                  valueColor: autopilotRuntime?.running ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400',
                },
                {
                  label: 'Entorno activo',
                  value: isProductionMode ? 'Producción' : 'Sandbox',
                  dot: isProductionMode ? 'bg-emerald-400' : 'bg-amber-400',
                  valueColor: isProductionMode ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
                },
                {
                  label: 'Blockers canónicos',
                  value: blockerTotal > 0 ? `${blockerTotal} activos` : 'Sin bloqueos',
                  dot: blockerTotal > 0 ? 'bg-red-400' : 'bg-emerald-400',
                  valueColor: blockerTotal > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
                },
              ].map(({ label, value, dot, valueColor }) => (
                <div key={label} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${dot}`} />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300">{label}</span>
                  </div>
                  <span className={`text-[11px] font-medium ${valueColor}`}>{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Entorno</span>
              <button
                type="button"
                onClick={() => {
                  setEnvironment(isProductionMode ? 'sandbox' : 'production').catch(() => {
                    toast.error('No se pudo cambiar el entorno');
                  });
                }}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                  isProductionMode
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
                    : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                }`}
              >
                {isProductionMode ? 'Producción' : 'Sandbox'}
              </button>
            </div>
          </div>

          {/* Latest order */}
          <div className="ir-panel p-3">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
              <ShoppingBag className="h-3.5 w-3.5 text-slate-400" />
              Última orden
            </h3>
            {latestOrder ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    latestOrder.status === 'PURCHASED'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : latestOrder.status === 'PAID' || latestOrder.status === 'PURCHASING'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                        : latestOrder.status === 'FAILED'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {latestOrder.status}
                  </span>
                  {latestOrder.paypalOrderId && (
                    <span className="text-xs text-slate-400 dark:text-slate-500 truncate">
                      {String(latestOrder.paypalOrderId).replace(/^ebay:/, 'eBay ').replace(/^mercadolibre:/, 'ML ').replace(/^amazon:/, 'Amazon ')}
                    </span>
                  )}
                </div>
                {latestOrder.status === 'FAILED' && latestOrder.errorMessage && (
                  <p className="text-xs text-red-600 dark:text-red-400">{latestOrder.errorMessage}</p>
                )}
                <Link to={`/orders/${latestOrder.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                  Ver orden <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">Sin órdenes recientes.</p>
            )}
          </div>

          {/* Admin: platform revenue */}
          {user?.role?.toUpperCase() === 'ADMIN' && platformRevenue && (
            <div className="ir-panel p-3">
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">Ingresos plataforma (Admin)</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Comisiones cobradas</p>
                  <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    ${platformRevenue.totalPlatformRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Ventas con comisión</p>
                  <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{platformRevenue.salesCount}</p>
                </div>
              </div>
              {platformRevenue.perUser.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800">
                        <th className="py-1.5 pr-3 font-medium text-slate-500 dark:text-slate-400">Usuario</th>
                        <th className="py-1.5 pr-3 font-medium text-slate-500 dark:text-slate-400">Ventas</th>
                        <th className="py-1.5 pr-3 font-medium text-slate-500 dark:text-slate-400">Comisión</th>
                        <th className="py-1.5 font-medium text-slate-500 dark:text-slate-400">Ganancia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {platformRevenue.perUser.map((row) => (
                        <tr key={row.userId}>
                          <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{row.username || row.email}</td>
                          <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{row.salesCount}</td>
                          <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">${row.platformCommission.toFixed(2)}</td>
                          <td className="py-1.5 text-slate-700 dark:text-slate-300">${row.userProfit.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* DATA FOOTER */}
      {!loading && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400/80 dark:text-slate-500/80 pt-1 pb-1">
          <span>API · datos en vivo</span>
          {lastDataUpdated && (
            <span>· {new Date(lastDataUpdated).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          )}
          <span>· refresh ~15s</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* EXECUTIVE HEADER */}
        <div className="rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 border border-slate-700/80 shadow-lg p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                  isProductionMode
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isProductionMode ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {isProductionMode ? 'PRODUCCIÓN' : 'SANDBOX'}
                </span>
                {immediateActionCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/15 text-red-300 border border-red-500/25">
                    <AlertCircle className="w-3 h-3" />
                    {immediateActionCount} acción{immediateActionCount !== 1 ? 'es' : ''}
                  </span>
                )}
              </div>
              <h1 className="text-lg font-semibold text-white tracking-tight">
                {user?.username ? `Hola, ${user.username}` : 'Operations Dashboard'}
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">Dropshipping inteligente · Sistema operativo en vivo</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Backend health */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium ${
                backendHealthy === true
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                  : backendHealthy === false
                    ? 'bg-red-500/10 border-red-500/25 text-red-300'
                    : 'bg-slate-700/60 border-slate-600/60 text-slate-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  backendHealthy === true ? 'bg-emerald-400 animate-pulse' :
                  backendHealthy === false ? 'bg-red-400' : 'bg-slate-500'
                }`} />
                {backendHealthy === true ? 'Backend OK' : backendHealthy === false ? 'Backend caído' : 'Conectando…'}
              </div>

              {/* Autopilot */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium ${
                autopilotRuntime?.running
                  ? 'bg-blue-500/10 border-blue-500/25 text-blue-300'
                  : 'bg-slate-700/60 border-slate-600/60 text-slate-400'
              }`}>
                <Radio className={`w-3 h-3 ${autopilotRuntime?.running ? 'animate-pulse' : ''}`} />
                {autopilotRuntime?.running ? 'Autopilot activo' : 'Autopilot detenido'}
              </div>

              {/* Environment toggle */}
              <button
                type="button"
                onClick={() => {
                  setEnvironment(isProductionMode ? 'sandbox' : 'production').catch(() => {
                    toast.error('No se pudo cambiar el entorno');
                  });
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-600/60 bg-slate-700/40 text-slate-300 text-[11px] font-medium hover:bg-slate-700/70 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Cambiar entorno
              </button>
            </div>
          </div>

          {/* Blockers strip in header — only if active */}
          {blockerTotal > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700/40 flex flex-wrap items-center gap-2.5">
              <span className="flex items-center gap-1.5 text-red-300 text-[11px] font-medium">
                <XCircle className="w-3 h-3" />
                {blockerTotal} blocker{blockerTotal !== 1 ? 's' : ''} activo{blockerTotal !== 1 ? 's' : ''}
              </span>
              {topBlockers.map((b) => (
                <span key={b.blockerCode} className="px-1.5 py-px rounded-full bg-red-500/15 border border-red-500/25 text-red-300 text-[11px] font-mono">
                  {b.blockerCode} ×{b.count}
                </span>
              ))}
              <Link to="/control-center" className="ml-auto text-[11px] text-red-300 hover:text-red-200 font-medium flex items-center gap-1">
                Ver en Control Center <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>

        {/* TABS */}
        <div className="border-b border-gray-200 dark:border-slate-700/80">
          <nav className="-mb-px flex gap-0.5 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSearchParams(tab.id === 'overview' ? {} : { tab: tab.id });
                  }}
                  className={`flex items-center gap-1.5 py-2 px-3 border-b-2 font-medium text-xs whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-slate-600'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* TAB CONTENT */}
        <div>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'trends' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Tendencias (Google Trends)</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Inicio del ciclo: selecciona una tendencia para buscar oportunidades de negocio con esa palabra.
                </p>
                <div className="mt-3">
                  <CycleStepsBreadcrumb currentStep={1} />
                </div>
              </div>
              {trendsLoading ? (
                <LoadingSpinner text="Cargando tendencias..." />
              ) : trendingKeywords.length === 0 ? (
                <div className="p-12 text-center text-gray-500 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No hay tendencias cargadas</p>
                  <p className="text-sm mt-2">Las tendencias se obtienen del backend (SerpAPI / Google Trends)</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {trendingKeywords.map((kw, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const params = new URLSearchParams({
                          keyword: kw.keyword,
                          autoSearch: 'true',
                        });
                        navigate(`/opportunities?${params.toString()}`);
                        toast.success(`Buscando oportunidades para "${kw.keyword}"...`);
                      }}
                      className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 transition text-left w-full group"
                    >
                      <div className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{kw.keyword}</div>
                      <div className="flex gap-2 mt-2 text-xs flex-wrap">
                        {kw.trend && <span className={`px-2 py-0.5 rounded ${
                          kw.trend === 'rising' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                          kw.trend === 'declining' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300'
                        }`}>{kw.trend}</span>}
                        {kw.priority && <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded">{kw.priority}</span>}
                        {kw.searchVolume != null && <span className="text-gray-500 dark:text-slate-400">Vol: {kw.searchVolume}</span>}
                      </div>
                      <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                        <Search className="w-3 h-3" /> Buscar oportunidades
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
