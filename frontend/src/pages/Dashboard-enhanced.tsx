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
  Globe
} from 'lucide-react';

import AIOpportunityFinder from '../components/AIOpportunityFinder';
import AISuggestionsPanel from '../components/AISuggestionsPanel';

interface OpportunityCard {
  id: string;
  title: string;
  category: string;
  profit: number;
  competition: 'low' | 'medium' | 'high';
  aiConfidence: number;
  trend: 'up' | 'down' | 'stable';
  marketplace: string;
  priceRange: string;
  estimatedSales: number;
}

interface AISuggestion {
  id: string;
  type: 'pricing' | 'optimization' | 'listing' | 'inventory';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  action: string;
}

export default function Dashboard() {
  const [isAutomaticMode, setIsAutomaticMode] = useState(true);
  const [isProductionMode, setIsProductionMode] = useState(false);
  const [opportunities, setOpportunities] = useState<OpportunityCard[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadOpportunities();
    loadAISuggestions();
  }, []);

  const loadOpportunities = async () => {
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setOpportunities([
        {
          id: '1',
          title: 'Auriculares Bluetooth Premium',
          category: 'Electrónicos',
          profit: 45.50,
          competition: 'low',
          aiConfidence: 87,
          trend: 'up',
          marketplace: 'eBay',
          priceRange: '$25-$45',
          estimatedSales: 150
        },
        {
          id: '2',
          title: 'Fundas iPhone 15 Pro Max',
          category: 'Accesorios',
          profit: 12.30,
          competition: 'medium',
          aiConfidence: 92,
          trend: 'up',
          marketplace: 'Amazon',
          priceRange: '$8-$15',
          estimatedSales: 300
        },
        {
          id: '3',
          title: 'Smartwatch Deportivo',
          category: 'Electrónicos',
          profit: 78.90,
          competition: 'high',
          aiConfidence: 73,
          trend: 'stable',
          marketplace: 'MercadoLibre',
          priceRange: '$80-$120',
          estimatedSales: 80
        }
      ]);
      setLoading(false);
    }, 1000);
  };

  const loadAISuggestions = async () => {
    setAiSuggestions([
      {
        id: '1',
        type: 'pricing',
        title: 'Optimizar precios en temporada navideña',
        description: 'La IA detectó que puedes aumentar precios 15% en productos navideños sin afectar ventas',
        impact: 'high',
        action: 'Aplicar ajuste automático'
      },
      {
        id: '2',
        type: 'listing',
        title: 'Mejorar títulos de productos electrónicos',
        description: 'Agregar palabras clave "wireless", "fast charging" puede aumentar visibilidad 23%',
        impact: 'medium',
        action: 'Optimizar títulos'
      },
      {
        id: '3',
        type: 'inventory',
        title: 'Stock bajo en productos trending',
        description: 'Productos con alta demanda están agotándose. Recomiendo reabastecer inventario',
        impact: 'high',
        action: 'Gestionar inventario'
      }
    ]);
  };

  const searchOpportunities = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    // Simulate AI-powered search
    setTimeout(() => {
      const mockResults = [
        {
          id: 'search-1',
          title: `${searchQuery} - Versión Premium`,
          category: 'Búsqueda IA',
          profit: Math.random() * 50 + 20,
          competition: 'medium' as const,
          aiConfidence: Math.floor(Math.random() * 30) + 70,
          trend: 'up' as const,
          marketplace: 'eBay',
          priceRange: '$15-$35',
          estimatedSales: Math.floor(Math.random() * 200) + 50
        }
      ];
      setOpportunities([...mockResults, ...opportunities]);
      setLoading(false);
    }, 1500);
  };

  const getCompetitionColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'high': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header Superior */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <Briefcase className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Ivan Reseller</h1>
                  <p className="text-xs text-gray-500">AI-Powered Dropshipping Platform</p>
                </div>
              </div>
            </div>
            
            {/* Controles de Modo */}
            <div className="flex items-center space-x-6">
              {/* Modo Automático/Manual */}
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Manual</span>
                <button
                  onClick={() => setIsAutomaticMode(!isAutomaticMode)}
                  className="relative"
                >
                  {isAutomaticMode ? (
                    <ToggleRight className="h-8 w-8 text-blue-600" />
                  ) : (
                    <ToggleLeft className="h-8 w-8 text-gray-400" />
                  )}
                </button>
                <span className="text-sm text-gray-600">Auto</span>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  isAutomaticMode ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {isAutomaticMode ? 'IA Activa' : 'Manual'}
                </div>
              </div>

              {/* Sandbox/Producción */}
              <div className="flex items-center space-x-2">
                <TestTube className="h-4 w-4 text-gray-500" />
                <button
                  onClick={() => setIsProductionMode(!isProductionMode)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    isProductionMode 
                      ? 'bg-green-100 text-green-800 border border-green-300' 
                      : 'bg-orange-100 text-orange-800 border border-orange-300'
                  }`}
                >
                  {isProductionMode ? (
                    <div className="flex items-center space-x-1">
                      <Globe className="h-3 w-3" />
                      <span>Producción</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1">
                      <TestTube className="h-3 w-3" />
                      <span>Sandbox</span>
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Métricas Principales */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ingresos Hoy</p>
                <p className="text-2xl font-bold text-gray-900">$2,847</p>
                <p className="text-xs text-green-600 font-medium">+12.3% vs ayer</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ventas</p>
                <p className="text-2xl font-bold text-gray-900">156</p>
                <p className="text-xs text-blue-600 font-medium">+8 nuevas</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                <ShoppingBag className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Productos Activos</p>
                <p className="text-2xl font-bold text-gray-900">1,234</p>
                <p className="text-xs text-purple-600 font-medium">89% optimizados</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                <Target className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Usuarios Activos</p>
                <p className="text-2xl font-bold text-gray-900">47</p>
                <p className="text-xs text-indigo-600 font-medium">3 conectados</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-xl flex items-center justify-center">
                <Users className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Búsqueda de Oportunidades */}
        <div className="mb-8">
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                <Brain className="h-6 w-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900">Búsqueda de Oportunidades IA</h2>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Activity className="h-4 w-4" />
                <span>IA {isAutomaticMode ? 'Activa' : 'Inactiva'}</span>
              </div>
            </div>
            
            <div className="flex space-x-4 mb-6">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Busca productos trending, nichos rentables, oportunidades de mercado..."
                  className="w-full px-4 py-3 bg-white/80 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchOpportunities()}
                />
              </div>
              <button
                onClick={searchOpportunities}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center space-x-2 shadow-lg"
              >
                {loading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span>Buscar con IA</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Oportunidades de Negocio */}
          <div className="lg:col-span-2">
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Oportunidades Detectadas</h2>
                <div className="flex items-center space-x-2 text-sm text-green-600">
                  <TrendingUp className="h-4 w-4" />
                  <span>{opportunities.length} oportunidades</span>
                </div>
              </div>

              <div className="space-y-4">
                {opportunities.map((opportunity) => (
                  <div key={opportunity.id} className="bg-white/80 rounded-xl p-4 border border-gray-200 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="font-semibold text-gray-900">{opportunity.title}</h3>
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                            {opportunity.marketplace}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600">Ganancia estimada</p>
                            <p className="font-bold text-green-600">${opportunity.profit.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Competencia</p>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCompetitionColor(opportunity.competition)}`}>
                              {opportunity.competition}
                            </span>
                          </div>
                          <div>
                            <p className="text-gray-600">Confianza IA</p>
                            <p className="font-bold text-purple-600">{opportunity.aiConfidence}%</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Ventas est./mes</p>
                            <p className="font-bold text-blue-600">{opportunity.estimatedSales}</p>
                          </div>
                        </div>
                      </div>
                      
                      <button className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2">
                        <span>Analizar</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sugerencias de IA */}
          <div>
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  <h2 className="text-lg font-bold text-gray-900">Sugerencias IA</h2>
                </div>
                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                  {aiSuggestions.length} activas
                </span>
              </div>

              <div className="space-y-4">
                {aiSuggestions.map((suggestion) => (
                  <div key={suggestion.id} className={`border rounded-xl p-4 ${getImpactColor(suggestion.impact)}`}>
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        {suggestion.type === 'pricing' && <DollarSign className="h-5 w-5" />}
                        {suggestion.type === 'optimization' && <Zap className="h-5 w-5" />}
                        {suggestion.type === 'listing' && <BarChart3 className="h-5 w-5" />}
                        {suggestion.type === 'inventory' && <AlertCircle className="h-5 w-5" />}
                      </div>
                      
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm mb-1">{suggestion.title}</h3>
                        <p className="text-xs text-gray-600 mb-2">{suggestion.description}</p>
                        
                        <button className="text-xs bg-white/80 hover:bg-white px-3 py-1 rounded-lg transition-colors">
                          {suggestion.action}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Estado del Sistema */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Estado del Sistema</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-green-600 font-medium">Óptimo</span>
                  </div>
                </div>
                
                <div className="mt-2 text-xs text-gray-500">
                  <p>• IA procesando oportunidades 24/7</p>
                  <p>• {isAutomaticMode ? 'Modo automático activo' : 'Modo manual activo'}</p>
                  <p>• Entorno: {isProductionMode ? 'Producción' : 'Sandbox'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}