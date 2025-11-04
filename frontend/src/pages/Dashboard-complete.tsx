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
import UniversalSearchDashboard from '@components/UniversalSearchDashboard';

import AIOpportunityFinder from '../components/AIOpportunityFinder';
import AISuggestionsPanel from '../components/AISuggestionsPanel';

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

  const [recentActivity, setRecentActivity] = useState([
    {
      id: '1',
      type: 'sale',
      title: 'Venta completada - Auriculares Gaming RGB',
      amount: '+$52.99',
      time: 'Hace 5min',
      status: 'success'
    },
    {
      id: '2',
      type: 'opportunity',
      title: 'Nueva oportunidad detectada - Cargadores USB-C',
      amount: '+$23.40 potencial',
      time: 'Hace 12min',
      status: 'info'
    },
    {
      id: '3',
      type: 'automation',
      title: 'Precio ajustado automáticamente - Mouse Gaming',
      amount: '15% aumento',
      time: 'Hace 1h',
      status: 'warning'
    },
    {
      id: '4',
      type: 'inventory',
      title: 'Stock bajo - Fundas iPhone 15',
      amount: '3 unidades',
      time: 'Hace 2h',
      status: 'alert'
    }
  ]);

  useEffect(() => {
    // Simular carga de datos
    setDashboardData({
      totalSales: 15420.50,
      totalProfit: 4280.30,
      activeProducts: 127,
      totalOpportunities: 23,
      aiSuggestions: 8,
      automationRules: 5
    });
  }, []);

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
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActivityBg = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-50 border-green-200';
      case 'info': return 'bg-blue-50 border-blue-200';
      case 'warning': return 'bg-yellow-50 border-yellow-200';
      case 'alert': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ventas Totales</p>
              <p className="text-2xl font-bold text-gray-900">${dashboardData.totalSales.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="flex items-center mt-2 text-sm">
            <ArrowUp className="h-4 w-4 text-green-600 mr-1" />
            <span className="text-green-600">+12.5%</span>
            <span className="text-gray-500 ml-1">vs mes anterior</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ganancia Neta</p>
              <p className="text-2xl font-bold text-gray-900">${dashboardData.totalProfit.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div className="flex items-center mt-2 text-sm">
            <ArrowUp className="h-4 w-4 text-green-600 mr-1" />
            <span className="text-green-600">+8.3%</span>
            <span className="text-gray-500 ml-1">margen mejorado</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Productos Activos</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.activeProducts}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <ShoppingBag className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <div className="flex items-center mt-2 text-sm">
            <ArrowUp className="h-4 w-4 text-green-600 mr-1" />
            <span className="text-green-600">+15</span>
            <span className="text-gray-500 ml-1">nuevos esta semana</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Oportunidades IA</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.totalOpportunities}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Brain className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="flex items-center mt-2 text-sm">
            <Zap className="h-4 w-4 text-blue-600 mr-1" />
            <span className="text-blue-600">94%</span>
            <span className="text-gray-500 ml-1">confianza promedio</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Sugerencias IA</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.aiSuggestions}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center">
              <Lightbulb className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="flex items-center mt-2 text-sm">
            <Target className="h-4 w-4 text-orange-600 mr-1" />
            <span className="text-orange-600">5</span>
            <span className="text-gray-500 ml-1">alta prioridad</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Automatización</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.automationRules}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-600 rounded-xl flex items-center justify-center">
              <Settings className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="flex items-center mt-2 text-sm">
            <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
            <span className="text-green-600">4</span>
            <span className="text-gray-500 ml-1">reglas activas</span>
          </div>
        </div>
      </div>

      {/* Actividad reciente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Actividad Reciente</h3>
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              Ver todo
            </button>
          </div>
          
          <div className="space-y-3">
            {recentActivity.map((activity) => (
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
                  <span className="text-sm font-medium text-gray-900">{activity.amount}</span>
                </div>
              </div>
            ))}
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