import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Search, 
  TrendingUp, 
  Brain, 
  Settings, 
  BarChart3, 
  Zap, 
  Target, 
  AlertCircle,
  ChevronRight,
  Lightbulb,
  Briefcase,
  DollarSign,
  ShoppingBag,
  Users,
  Activity,
  Play,
  Pause,
  ToggleLeft,
  ToggleRight,
  TestTube,
  Globe,
  CheckCircle,
  TrendingDown,
  Eye,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@services/api';
import UniversalSearchDashboard from '@components/UniversalSearchDashboard';
import LoadingSpinner, { CardSkeleton } from '@/components/ui/LoadingSpinner';

import AIOpportunityFinder from '../components/AIOpportunityFinder';
import AISuggestionsPanel from '../components/AISuggestionsPanel';
import WorkflowSummaryWidget from '@/components/WorkflowSummaryWidget';
import InventorySummaryCard from '@/components/InventorySummaryCard';
import SalesReadinessPanel from '@/components/SalesReadinessPanel';
import AutopilotLiveWidget from '@/components/AutopilotLiveWidget';
import BalanceSummaryWidget from '@/components/BalanceSummaryWidget';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';
import { log } from '@/utils/logger';
import { getTrendingKeywords, type TrendKeyword } from '@/services/trends.api';
import { useAuthStore } from '@stores/authStore';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam && ['overview', 'trends', 'search', 'opportunities', 'suggestions', 'automation'].includes(tabParam) ? tabParam : 'overview');
  const [isAutomaticMode, setIsAutomaticMode] = useState(true);
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
    activeProducts: 0,
    totalOpportunities: 0,
    aiSuggestions: 0,
    automationRules: 0
  });
  const [loading, setLoading] = useState(true);
  const [dataLoadError, setDataLoadError] = useState(false);

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

  const [inventorySummary, setInventorySummary] = useState<{
    products: { total: number; pending: number; approved: number; published: number };
    listingsByMarketplace: { ebay: number; mercadolibre: number; amazon: number };
    listingsTotal?: number;
    listingsSource?: 'api' | 'database';
    ordersByStatus: { CREATED: number; PAID: number; PURCHASING: number; PURCHASED: number; FAILED: number };
    pendingPurchasesCount: number;
  } | null>(null);

  const [autoListingDecisions, setAutoListingDecisions] = useState<Array<{
    id: number;
    productId: number;
    productTitle: string | null;
    productStatus: string | null;
    marketplace: string;
    priorityScore: number;
    decisionReason: string;
    executed: boolean;
    createdAt: string;
  }>>([]);

  const [listingOptimizationActions, setListingOptimizationActions] = useState<Array<{
    id: number;
    listingId: number;
    productId: number | null;
    productTitle: string | null;
    marketplace: string | null;
    actionType: string;
    reason: string;
    executed: boolean;
    createdAt: string;
  }>>([]);

  const [demandSignals, setDemandSignals] = useState<Array<{
    id: number;
    keyword: string;
    trendScore: number;
    source: string;
    confidence: number;
    detectedAt: string;
  }>>([]);

  const [strategyDecisions, setStrategyDecisions] = useState<Array<{
    id: number;
    productId: number;
    productTitle: string | null;
    productStatus: string | null;
    decisionType: string;
    score: number;
    reason: string;
    executed: boolean;
    createdAt: string;
  }>>([]);

  const [scalingActions, setScalingActions] = useState<Array<{
    id: number;
    productId: number;
    productTitle: string | null;
    marketplace: string;
    actionType: string;
    score: number;
    executed: boolean;
    createdAt: string;
  }>>([]);

  const [conversionOptimizationActions, setConversionOptimizationActions] = useState<Array<{
    id: number;
    listingId: number;
    productId: number | null;
    productTitle: string | null;
    marketplace: string | null;
    actionType: string;
    reason: string;
    score: number;
    executed: boolean;
    createdAt: string;
  }>>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDashboardData();
    }, 100);
    return () => clearTimeout(timer);
  }, [environment]);

  // Sincronizar tab desde URL (p. ej. /dashboard?tab=trends)
  useEffect(() => {
    if (tabParam && ['overview', 'trends', 'search', 'opportunities', 'suggestions', 'automation'].includes(tabParam)) {
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
        // ✅ B6: Cargar count de oportunidades desde API
        api.get('/api/opportunities/list', { params: { page: 1, limit: 1 } }).catch(err => {
          hasErrors = true;
          if (err.response) {
            log.warn('⚠️  Error loading opportunities count (HTTP):', err.response.status);
          } else {
            log.warn('⚠️  Error loading opportunities count (red/CORS):', err.message);
          }
          return { data: { count: 0 } };
        }),
        // ✅ B6: Cargar sugerencias IA desde API
        api.get('/api/ai-suggestions', { params: { limit: 1 } }).catch(err => {
          hasErrors = true;
          if (err.response) {
            log.warn('⚠️  Error loading AI suggestions (HTTP):', err.response.status);
          } else {
            log.warn('⚠️  Error loading AI suggestions (red/CORS):', err.message);
          }
          return { data: { suggestions: [], count: 0 } };
        }),
        // ✅ B6: Cargar configuración de automatización para contar workflows
        api.get('/api/automation/config').catch(err => {
          hasErrors = true;
          if (err.response) {
            log.warn('⚠️  Error loading automation config (HTTP):', err.response.status);
          } else {
            log.warn('⚠️  Error loading automation config (red/CORS):', err.message);
          }
          return { data: { workflows: [] } };
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
        // Phase 5: Auto Listing Strategy decisions
        api.get('/api/analytics/auto-listing-decisions', { params: { limit: 20 } }).catch(() => ({ data: null })),
        // Phase 6: Listing Optimization actions
        api.get('/api/analytics/listing-optimization-actions', { params: { limit: 20 } }).catch(() => ({ data: null })),
        // Phase 7: Demand Radar
        api.get('/api/analytics/demand-signals', { params: { limit: 15, minTrendScore: 20 } }).catch(() => ({ data: null })),
        // Phase 8: Strategy Brain
        api.get('/api/analytics/strategy-decisions', { params: { limit: 20 } }).catch(() => ({ data: null })),
        // Phase 9: Autonomous Scaling
        api.get('/api/analytics/scaling-actions', { params: { limit: 20 } }).catch(() => ({ data: null })),
        // Phase 11: Conversion Rate Optimization
        api.get('/api/analytics/conversion-optimization-actions', { params: { limit: 20 } }).catch(() => ({ data: null })),
      ]);
      const [statsRes, activityRes, opportunitiesRes, aiSuggestionsRes, automationRes, inventoryRes, businessDiagRes, healthRes, platformRevRes] = allResponses;
      const autoListingRes = allResponses[9] as any;
      const listingOptRes = allResponses[10] as any;
      const demandRadarRes = allResponses[11] as any;
      const strategyRes = allResponses[12] as any;
      const scalingRes = allResponses[13] as any;
      const conversionOptimizationRes = allResponses[14] as any;

      // ✅ FIX-002: Si hay errores y no hay datos reales, mostrar mensaje informativo
      const hasRealData = statsRes.data && Object.keys(statsRes.data).length > 0;
      setDataLoadError(hasErrors && !hasRealData);

      const stats = statsRes.data || {};
      const activities = activityRes.data?.activities || [];
      const opportunitiesCount = opportunitiesRes.data?.count || 0;
      const aiSuggestionsCount = aiSuggestionsRes.data?.count || aiSuggestionsRes.data?.suggestions?.length || 0;
      const automationWorkflows = automationRes.data?.workflows || [];
      const automationRulesCount = automationWorkflows.length || 0;

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
        activeProducts,
        totalOpportunities: opportunitiesCount,
        aiSuggestions: aiSuggestionsCount,
        automationRules: automationRulesCount
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
          ordersByStatus: inv.ordersByStatus ?? { CREATED: 0, PAID: 0, PURCHASING: 0, PURCHASED: 0, FAILED: 0 },
          pendingPurchasesCount: inv.pendingPurchasesCount ?? 0,
        });
      } else {
        setInventorySummary(null);
      }

      // Estado del sistema (business diagnostics) - en vivo
      if (businessDiagRes?.data && typeof businessDiagRes.data === 'object' && !(businessDiagRes.data as any).error) {
        setBusinessDiagnostics(businessDiagRes.data as Record<string, { status: string; message?: string; count?: number }>);
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
      }

      if (autoListingRes?.data?.decisions) setAutoListingDecisions(autoListingRes.data.decisions);
      if (listingOptRes?.data?.actions) setListingOptimizationActions(listingOptRes.data.actions);
      if (demandRadarRes?.data?.signals) setDemandSignals(demandRadarRes.data.signals);
      if (strategyRes?.data?.decisions) setStrategyDecisions(strategyRes.data.decisions);
      if (scalingRes?.data?.actions) setScalingActions(scalingRes.data.actions);
      if (conversionOptimizationRes?.data?.actions) setConversionOptimizationActions(conversionOptimizationRes.data.actions);
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
    { id: 'search', label: 'Búsqueda Universal', icon: Search },
    { id: 'opportunities', label: 'Oportunidades IA', icon: Brain },
    { id: 'suggestions', label: 'Sugerencias IA', icon: Lightbulb },
    { id: 'automation', label: 'Automatización', icon: Settings }
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

  const renderOverview = () => (
    <div className="space-y-6">
      <SalesReadinessPanel />
      {/* Métricas principales */}
      {loading ? (
        <CardSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
          {/* Profit-first: main metric (Phase 34 — Conversion UX) */}
          <div className="bg-emerald-50 dark:bg-gray-800 p-6 rounded-xl shadow-lg border-2 border-emerald-300 dark:border-emerald-700/60 transition-colors md:col-span-1" title="Utilidad real después de costos, comisiones, PayPal y comisión de plataforma.">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Ganancia neta</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">${dashboardData.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <Link to="/finance" className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline mt-1 inline-block">Ver finanzas →</Link>
              </div>
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors" title="Suma de los precios de venta de todas las ventas confirmadas.">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Ingresos totales</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">${dashboardData.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-xl flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Comisión plataforma pagada</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">${(dashboardData.platformCommissionPaid ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/40 rounded-xl flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors" title="Número de ventas registradas.">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Nº de ventas</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.salesCount}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors" title="Productos publicados en el marketplace.">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Productos publicados</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.activeProducts}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/40 rounded-xl flex items-center justify-center">
                <ShoppingBag className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Oportunidades IA</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.totalOpportunities}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Brain className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Sugerencias IA</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.aiSuggestions}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center">
              <Lightbulb className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Automatización</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.automationRules}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-600 rounded-xl flex items-center justify-center">
              <Settings className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Data freshness (Phase 34 — Trust) */}
      {!loading && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Datos actualizados en cada carga. Recarga cada ~15 s en esta pestaña.
        </p>
      )}

      {/* Alerts panel (Phase 34 — centralizar problemas) */}
      {businessDiagnostics && Object.values(businessDiagnostics).some((v) => v?.status === 'FAIL') && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Alertas del sistema
          </h3>
          <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">
            {Object.entries(businessDiagnostics)
              .filter(([, v]) => v?.status === 'FAIL')
              .map(([key, v]) => (
                <li key={key}>
                  <strong className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</strong> {v?.message ?? 'Revisar configuración'}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Balance resumido - capital disponible, comprometido, puede publicar */}
      <BalanceSummaryWidget />

      {/* Acciones requeridas: compras pendientes y productos pendientes */}
      {inventorySummary && (inventorySummary.pendingPurchasesCount > 0 || (inventorySummary.products?.pending ?? 0) > 0) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Acciones requeridas
          </h3>
          <ul className="space-y-2 text-sm text-amber-800 dark:text-amber-200">
            {inventorySummary.pendingPurchasesCount > 0 && (
              <li className="flex items-center justify-between gap-4 flex-wrap">
                <span>Tienes {inventorySummary.pendingPurchasesCount} ventas pendientes de compra.</span>
                <button
                  type="button"
                  onClick={() => navigate('/pending-purchases')}
                  className="font-medium text-amber-700 dark:text-amber-300 hover:underline underline-offset-2"
                >
                  Ir a Compras pendientes
                </button>
              </li>
            )}
            {(inventorySummary.products?.pending ?? 0) > 0 && (
              <li className="flex items-center justify-between gap-4 flex-wrap">
                <span>Y {inventorySummary.products.pending} productos pendientes de aprobación.</span>
                <button
                  type="button"
                  onClick={() => navigate('/products')}
                  className="font-medium text-amber-700 dark:text-amber-300 hover:underline underline-offset-2"
                >
                  Ir a Productos
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Qué hacer ahora (Phase 34 — Action-oriented UI) */}
      {(scalingActions.filter((a) => !a.executed).length > 0 || conversionOptimizationActions.filter((a) => !a.executed).length > 0 || strategyDecisions.filter((d) => !d.executed).length > 0) && (
        <div className="rounded-xl border border-primary-200 dark:border-primary-700/60 bg-primary-50/50 dark:bg-primary-900/10 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary-600 dark:text-primary-400" />
            Qué hacer ahora
          </h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {scalingActions.filter((a) => !a.executed).length > 0 && (
              <span className="text-gray-700 dark:text-gray-300">
                <strong className="text-emerald-700 dark:text-emerald-400">Escalar:</strong> {scalingActions.filter((a) => !a.executed).length} producto(s) listos para replicar en más marketplaces.
              </span>
            )}
            {conversionOptimizationActions.filter((a) => !a.executed).length > 0 && (
              <span className="text-gray-700 dark:text-gray-300">
                <strong className="text-amber-700 dark:text-amber-400">Optimizar:</strong> {conversionOptimizationActions.filter((a) => !a.executed).length} listado(s) con acciones de conversión pendientes.
              </span>
            )}
            {strategyDecisions.filter((d) => !d.executed).length > 0 && (
              <span className="text-gray-700 dark:text-gray-300">
                <strong className="text-blue-700 dark:text-blue-400">Estrategia:</strong> {strategyDecisions.filter((d) => !d.executed).length} decisión(es) pendiente(s).
              </span>
            )}
          </div>
        </div>
      )}

      {/* Decision blocks (Phase 34 — Scale Now / Optimize Now / Remove Now) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-700/60 bg-emerald-50/50 dark:bg-emerald-900/10 p-4">
          <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Escalar ahora
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Productos ganadores listos para más marketplaces.</p>
          {scalingActions.filter((a) => !a.executed).length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-500">Ninguno pendiente.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {scalingActions.filter((a) => !a.executed).slice(0, 3).map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => navigate(`/products${a.productId ? `?highlight=${a.productId}` : ''}`)} className="text-left text-emerald-700 dark:text-emerald-300 hover:underline truncate block max-w-full">
                    {a.productTitle ?? `Producto #${a.productId}`}
                  </button>
                </li>
              ))}
              {scalingActions.filter((a) => !a.executed).length > 3 && (
                <li className="text-gray-500 dark:text-gray-400">+{scalingActions.filter((a) => !a.executed).length - 3} más</li>
              )}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-900/10 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">
            <Target className="h-4 w-4" />
            Optimizar ahora
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Listados con mejora de conversión pendiente.</p>
          {conversionOptimizationActions.filter((a) => !a.executed).length === 0 && listingOptimizationActions.filter((a) => !a.executed).length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-500">Ninguno pendiente.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {[...conversionOptimizationActions.filter((a) => !a.executed), ...listingOptimizationActions.filter((a) => !a.executed)].slice(0, 3).map((a, i) => (
                <li key={(a as any).id ?? i}>
                  <button type="button" onClick={() => navigate(`/products${(a as any).productId ? `?highlight=${(a as any).productId}` : ''}`)} className="text-left text-amber-700 dark:text-amber-300 hover:underline truncate block max-w-full">
                    {(a as any).productTitle ?? `Listado #${(a as any).listingId ?? (a as any).productId}`}
                  </button>
                </li>
              ))}
              {[...conversionOptimizationActions.filter((a) => !a.executed), ...listingOptimizationActions.filter((a) => !a.executed)].length > 3 && (
                <li className="text-gray-500 dark:text-gray-400">+{[...conversionOptimizationActions.filter((a) => !a.executed), ...listingOptimizationActions.filter((a) => !a.executed)].length - 3} más</li>
              )}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-red-200 dark:border-red-700/60 bg-red-50/50 dark:bg-red-900/10 p-4">
          <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Revisar / pausar
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Decisiones de pausa por bajo rendimiento.</p>
          {strategyDecisions.filter((d) => !d.executed && (d.decisionType === 'pause_listing' || d.decisionType === 'pause')).length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-500">Ninguno pendiente.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {strategyDecisions.filter((d) => !d.executed && (d.decisionType === 'pause_listing' || d.decisionType === 'pause')).slice(0, 3).map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => navigate(`/products${d.productId ? `?highlight=${d.productId}` : ''}`)} className="text-left text-red-700 dark:text-red-300 hover:underline truncate block max-w-full">
                    {d.productTitle ?? `Producto #${d.productId}`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Autopilot en vivo - estado, fase y progreso del ciclo */}
      <AutopilotLiveWidget />

      <InventorySummaryCard summary={inventorySummary} />

      {/* Admin: ingresos plataforma y comisiones por usuario */}
      {user?.role?.toUpperCase() === 'ADMIN' && platformRevenue && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Ingresos plataforma (Admin)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total comisiones cobradas</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">${platformRevenue.totalPlatformRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ventas con comisión</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{platformRevenue.salesCount}</p>
            </div>
          </div>
          {platformRevenue.perUser.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left text-gray-700 dark:text-gray-300">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="py-2 pr-4">Usuario</th>
                    <th className="py-2 pr-4">Ventas</th>
                    <th className="py-2 pr-4">Comisión plataforma</th>
                    <th className="py-2 pr-4">Ganancia usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {platformRevenue.perUser.map((row) => (
                    <tr key={row.userId} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2 pr-4">{row.username || row.email}</td>
                      <td className="py-2 pr-4">{row.salesCount}</td>
                      <td className="py-2 pr-4">${row.platformCommission.toFixed(2)}</td>
                      <td className="py-2 pr-4">${row.userProfit.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Workflow Summary Widget */}
      <div className="mt-6">
        <WorkflowSummaryWidget />
      </div>

      {/* Phase 9: Autonomous Scaling — scaled products, scale score, marketplace expansion */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Autonomous Scaling
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Productos escalados a más marketplaces (ganadores replicados en eBay, Amazon, etc.).
        </p>
        {scalingActions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-500 py-4">No hay acciones de escalado recientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Producto</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Marketplace</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Acción</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Score</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Estado</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {scalingActions.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px] block" title={a.productTitle ?? ''}>
                        {a.productTitle ?? '—'}
                      </span>
                    </td>
                    <td className="py-2 capitalize text-gray-700 dark:text-gray-300">{a.marketplace}</td>
                    <td className="py-2 text-gray-700 dark:text-gray-300">{a.actionType.replace(/_/g, ' ')}</td>
                    <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{a.score.toFixed(0)}</td>
                    <td className="py-2">
                      {a.executed ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-4 w-4" />
                          Ejecutado
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Pendiente</span>
                      )}
                    </td>
                    <td className="py-2 text-gray-500 dark:text-gray-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Phase 11: Conversion Rate Optimization — recent CRO actions, conversion improvements */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-emerald-500" />
          Conversion Optimization
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Mejoras automáticas de conversión: títulos, precios, descripciones e imágenes (cada 12 h).
        </p>
        {conversionOptimizationActions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-500 py-4">No hay acciones de CRO recientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Producto</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Marketplace</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Acción</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Razón</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Score</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Estado</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {conversionOptimizationActions.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px] block" title={a.productTitle ?? ''}>
                        {a.productTitle ?? '—'}
                      </span>
                    </td>
                    <td className="py-2 capitalize text-gray-700 dark:text-gray-300">{a.marketplace ?? '—'}</td>
                    <td className="py-2 text-gray-700 dark:text-gray-300">{a.actionType.replace(/_/g, ' ')}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">{a.reason.replace(/_/g, ' ')}</td>
                    <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{a.score.toFixed(0)}</td>
                    <td className="py-2">
                      {a.executed ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-4 w-4" />
                          Ejecutado
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Pendiente</span>
                      )}
                    </td>
                    <td className="py-2 text-gray-500 dark:text-gray-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Phase 8: Strategy Brain — top strategic products, scores, recommended actions */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Brain className="h-5 w-5 text-violet-500" />
          Strategy Brain
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Decisiones estratégicas del sistema (escala, expansión, precio, pausa). Se ejecuta diariamente.
        </p>
        {strategyDecisions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-500 py-4">No hay decisiones recientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Producto</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Acción</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Score</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Razón</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Estado</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {strategyDecisions.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px] block" title={d.productTitle ?? ''}>
                        {d.productTitle ?? '—'}
                      </span>
                    </td>
                    <td className="py-2 text-gray-700 dark:text-gray-300">{d.decisionType.replace(/_/g, ' ')}</td>
                    <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{d.score.toFixed(0)}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">{d.reason.replace(/_/g, ' ')}</td>
                    <td className="py-2">
                      {d.executed ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-4 w-4" />
                          Ejecutado
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Pendiente</span>
                      )}
                    </td>
                    <td className="py-2 text-gray-500 dark:text-gray-500">{new Date(d.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Phase 7: Demand Radar — top trending keywords, trend growth, sources */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald-500" />
          Demand Radar
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Keywords en tendencia (score, fuente). Actualizado diariamente por el Global Demand Radar.
        </p>
        {demandSignals.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-500 py-4">No hay señales recientes.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {demandSignals.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 text-sm"
                title={`Score: ${s.trendScore} · ${s.source}`}
              >
                <span className="font-medium">{s.keyword}</span>
                <span className="opacity-80">{s.trendScore.toFixed(0)}</span>
                <span className="text-xs opacity-70">{s.source.replace(/_/g, ' ')}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Phase 6: Listing Optimization — optimization actions, performance improvements, recent adjustments */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-500" />
          Listing Optimization
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Acciones del motor de optimización dinámica (precio, título SEO, expansión de marketplace).
        </p>
        {listingOptimizationActions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-500 py-4">No hay acciones recientes. El motor se ejecuta cada 12 h.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Producto</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Marketplace</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Acción</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Razón</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Estado</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {listingOptimizationActions.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px] block" title={a.productTitle ?? ''}>
                        {a.productTitle ?? '—'}
                      </span>
                    </td>
                    <td className="py-2 capitalize text-gray-700 dark:text-gray-300">{a.marketplace ?? '—'}</td>
                    <td className="py-2 text-gray-700 dark:text-gray-300">{a.actionType.replace(/_/g, ' ')}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">{a.reason.replace(/_/g, ' ')}</td>
                    <td className="py-2">
                      {a.executed ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-4 w-4" />
                          Ejecutado
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Pendiente</span>
                      )}
                    </td>
                    <td className="py-2 text-gray-500 dark:text-gray-500">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Phase 5: Auto Listing Strategy — recommended products, priority, marketplace, execution status */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Auto Listing Strategy
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Productos recomendados por el motor de estrategia (prioridad, marketplace, estado de publicación).
        </p>
        {autoListingDecisions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-500 py-4">No hay decisiones recientes. El motor se ejecuta diariamente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Producto</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Marketplace</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Prioridad</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Razón</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Estado</th>
                  <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {autoListingDecisions.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px] block" title={d.productTitle ?? ''}>
                        {d.productTitle ?? '—'}
                      </span>
                    </td>
                    <td className="py-2 capitalize text-gray-700 dark:text-gray-300">{d.marketplace}</td>
                    <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{d.priorityScore.toFixed(0)}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">{d.decisionReason.replace(/_/g, ' ')}</td>
                    <td className="py-2">
                      {d.executed ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-4 w-4" />
                          Encolado
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Pendiente</span>
                      )}
                    </td>
                    <td className="py-2 text-gray-500 dark:text-gray-500">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Business Diagnostics - Estado del sistema */}
      {businessDiagnostics && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Estado del sistema
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {Object.entries(businessDiagnostics).filter(([k]) => k !== 'error').map(([key, val]) => (
              <div
                key={key}
                className={`p-3 rounded-lg border ${
                  val.status === 'OK'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}
                title={val.message}
              >
                <div className="flex items-center gap-2">
                  {val.status === 'OK' ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                  )}
                  <span className="text-sm font-medium capitalize truncate">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                </div>
                {val.count !== undefined && (
                  <p className="text-xs mt-1 text-gray-600 dark:text-gray-400">{val.count}</p>
                )}
                {val.message && val.status === 'OK' && (
                  <p className="text-xs mt-1 text-gray-500 truncate" title={val.message}>{val.message}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actividad reciente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Actividad Reciente</h3>
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              Ver todo
            </button>
          </div>
          
          <div className="space-y-3">
            {recentActivity.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Activity className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No hay actividad reciente</p>
              </div>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className={`p-3 rounded-lg border ${getActivityBg(activity.status)}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="mt-0.5">
                        {getActivityIcon(activity.type)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                        <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                      </div>
                    </div>
                    {activity.amount && (
                      <span className="text-sm font-medium text-gray-900">{activity.amount}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Estado del sistema - Real backend status */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Estado del Sistema</h3>
          
          <div className="space-y-4">
            <div className={`flex items-center justify-between p-3 rounded-lg border ${
              backendHealthy === true ? 'bg-green-50 border-green-200' :
              backendHealthy === false ? 'bg-red-50 border-red-200' :
              'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${
                  backendHealthy === true ? 'bg-green-400 animate-pulse' :
                  backendHealthy === false ? 'bg-red-500' : 'bg-gray-400'
                }`}></div>
                <span className="text-sm font-medium text-gray-900">Backend</span>
              </div>
              <span className={`text-sm font-medium ${
                backendHealthy === true ? 'text-green-600' :
                backendHealthy === false ? 'text-red-600' : 'text-gray-500'
              }`}>
                {backendHealthy === true ? 'Conectado' : backendHealthy === false ? 'No disponible' : 'Verificando...'}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-3">
                <Brain className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">Motor IA</span>
              </div>
              <span className="text-sm text-blue-600 font-medium">
                {backendHealthy === true ? 'Disponible' : backendHealthy === false ? 'Revisar backend' : '—'}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center space-x-3">
                <Settings className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-gray-900">Automatización</span>
              </div>
              <span className="text-sm text-purple-600 font-medium">
                {isAutomaticMode ? 'Activo' : 'Manual'}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-center space-x-3">
                <Globe className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium text-gray-900">Entorno</span>
              </div>
              <span className="text-sm text-orange-600 font-medium">
                {isProductionMode ? 'Producción' : 'Sandbox'}
              </span>
            </div>
          </div>
          
          {/* Controles rápidos */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Controles Rápidos</span>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Modo Automático</span>
                </div>
                <button
                  onClick={() => setIsAutomaticMode(!isAutomaticMode)}
                  className="relative"
                >
                  {isAutomaticMode ? (
                    <ToggleRight className="h-6 w-6 text-blue-600" />
                  ) : (
                    <ToggleLeft className="h-6 w-6 text-gray-400" />
                  )}
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Entorno</span>
                </div>
                <button
                  onClick={() => {
                    setEnvironment(isProductionMode ? 'sandbox' : 'production').catch(() => {
                      toast.error('No se pudo cambiar el entorno');
                    });
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    isProductionMode 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-orange-100 text-orange-800'
                  }`}
                >
                  {isProductionMode ? 'Producción' : 'Sandbox'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard Inteligente</h1>
              <p className="text-gray-600 mt-1">
                Sistema de reventa con IA avanzada - 
                <span className={`ml-1 font-medium ${
                  isProductionMode ? 'text-green-600' : 'text-orange-600'
                }`}>
                  {isProductionMode ? 'Producción' : 'Sandbox'}
                </span>
              </p>
            </div>
            
            {/* Indicadores de estado */}
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
                isAutomaticMode ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {isAutomaticMode ? (
                  <Brain className="h-4 w-4" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                <span className="text-sm font-medium">
                  {isAutomaticMode ? 'IA Activa' : 'Manual'}
                </span>
              </div>
              
              <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
                backendHealthy === true ? 'text-green-600 bg-green-50' :
                backendHealthy === false ? 'text-red-600 bg-red-50' : 'text-gray-600 bg-gray-50'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  backendHealthy === true ? 'bg-green-400 animate-pulse' :
                  backendHealthy === false ? 'bg-red-500' : 'bg-gray-400'
                }`}></div>
                <span className="text-sm font-medium">
                  {backendHealthy === true ? 'Backend conectado' : backendHealthy === false ? 'Backend no disponible' : 'Verificando...'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Navegación por tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setSearchParams(tab.id === 'overview' ? {} : { tab: tab.id });
                    }}
                    className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-all ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Contenido del tab activo */}
        <div className="tab-content">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'trends' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Tendencias (Google Trends)</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Inicio del ciclo: selecciona una tendencia para buscar oportunidades de negocio con esa palabra.
                </p>
                <div className="mt-3">
                  <CycleStepsBreadcrumb currentStep={1} />
                </div>
              </div>
              {trendsLoading ? (
                <LoadingSpinner text="Cargando tendencias..." />
              ) : trendingKeywords.length === 0 ? (
                <div className="p-12 text-center text-gray-500 bg-gray-50 rounded-xl border border-gray-200">
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
                      className="p-4 bg-white border rounded-lg shadow-sm hover:shadow-md hover:border-primary-500 transition text-left w-full group"
                    >
                      <div className="font-medium text-gray-900 group-hover:text-primary-600">{kw.keyword}</div>
                      <div className="flex gap-2 mt-2 text-xs flex-wrap">
                        {kw.trend && <span className={`px-2 py-0.5 rounded ${
                          kw.trend === 'rising' ? 'bg-green-100 text-green-800' :
                          kw.trend === 'declining' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
                        }`}>{kw.trend}</span>}
                        {kw.priority && <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">{kw.priority}</span>}
                        {kw.searchVolume != null && <span className="text-gray-500">Vol: {kw.searchVolume}</span>}
                      </div>
                      <div className="mt-2 text-xs text-primary-600 opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                        <Search className="w-3 h-3" /> Buscar oportunidades
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeTab === 'search' && <UniversalSearchDashboard />}
          {activeTab === 'opportunities' && <AIOpportunityFinder />}
          {activeTab === 'suggestions' && <AISuggestionsPanel />}
          {activeTab === 'automation' && (
            <div className="text-center py-12">
              <Settings className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Panel de Automatización</h3>
              <p className="text-gray-600">
                Configuración avanzada de reglas y automatizaciones del sistema
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}