import { useState, useEffect } from 'react';
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
import { log } from '@/utils/logger';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isAutomaticMode, setIsAutomaticMode] = useState(true);
  const [isProductionMode, setIsProductionMode] = useState(false);

  // Datos del dashboard principal
  const [dashboardData, setDashboardData] = useState({
    totalSales: 0,
    totalProfit: 0,
    activeProducts: 0,
    totalOpportunities: 0,
    aiSuggestions: 0,
    automationRules: 0
  });
  const [loading, setLoading] = useState(true);

  const [recentActivity, setRecentActivity] = useState<Array<{
    id: string;
    type: string;
    title: string;
    amount: string;
    time: string;
    status: string;
  }>>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // ✅ B6: CARGAR DATOS REALES DE LA API (completado)
      const [statsRes, activityRes, opportunitiesRes, aiSuggestionsRes, automationRes] = await Promise.all([
        api.get('/api/dashboard/stats').catch(err => {
          log.warn('Error loading stats:', err);
          return { data: {} };
        }),
        api.get('/api/dashboard/recent-activity?limit=10').catch(err => {
          log.warn('Error loading activity:', err);
          return { data: { activities: [] } };
        }),
        // ✅ B6: Cargar count de oportunidades desde API
        api.get('/api/opportunities/list', { params: { page: 1, limit: 1 } }).catch(err => {
          log.warn('Error loading opportunities count:', err);
          return { data: { count: 0 } };
        }),
        // ✅ B6: Cargar sugerencias IA desde API
        api.get('/api/ai-suggestions', { params: { limit: 1 } }).catch(err => {
          log.warn('Error loading AI suggestions:', err);
          return { data: { suggestions: [], count: 0 } };
        }),
        // ✅ B6: Cargar configuración de automatización para contar workflows
        api.get('/api/automation/config').catch(err => {
          log.warn('Error loading automation config:', err);
          return { data: { workflows: [] } };
        })
      ]);

      const stats = statsRes.data || {};
      const activities = activityRes.data?.activities || [];
      const opportunitiesCount = opportunitiesRes.data?.count || 0;
      const aiSuggestionsCount = aiSuggestionsRes.data?.count || aiSuggestionsRes.data?.suggestions?.length || 0;
      const automationWorkflows = automationRes.data?.workflows || [];
      const automationRulesCount = automationWorkflows.length || 0;

      // Calcular total de ventas y ganancias desde estadísticas reales
      // El backend devuelve: { products: {...}, sales: {...}, commissions: {...} }
      const totalSales = stats?.sales?.totalRevenue || stats?.sales?.total || 0;
      const totalProfit = stats?.commissions?.totalAmount || stats?.commissions?.total || 0;
      const activeProducts = stats?.products?.published || stats?.products?.active || 0;

      setDashboardData({
        totalSales,
        totalProfit,
        activeProducts,
        totalOpportunities: opportunitiesCount, // ✅ B6: Cargado desde API
        aiSuggestions: aiSuggestionsCount, // ✅ B6: Cargado desde API
        automationRules: automationRulesCount // ✅ B6: Cargado desde API
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
    } catch (error: any) {
      log.error('Error loading dashboard data:', error);
      toast.error('Error al cargar datos del dashboard');
    } finally {
      setLoading(false);
    }
  };

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
      {/* Métricas principales */}
      {loading ? (
        <CardSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Ventas Totales</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">${dashboardData.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Comisiones Totales</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">${dashboardData.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Productos Publicados</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.activeProducts}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <ShoppingBag className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
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

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
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

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
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

        {/* Estado del sistema */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Estado del Sistema</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-900">Sistema Principal</span>
              </div>
              <span className="text-sm text-green-600 font-medium">Óptimo</span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-3">
                <Brain className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">Motor IA</span>
              </div>
              <span className="text-sm text-blue-600 font-medium">Procesando</span>
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
                  onClick={() => setIsProductionMode(!isProductionMode)}
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
              
              <div className="flex items-center space-x-2 text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">Sistema Óptimo</span>
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
                    onClick={() => setActiveTab(tab.id)}
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