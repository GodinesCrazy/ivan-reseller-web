import { useState } from 'react';
import {
  Brain,
  Search,
  TrendingUp,
  Target,
  Zap,
  BarChart3,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Filter,
  Download,
  Star,
  DollarSign,
  ShoppingCart,
  Globe,
  Clock,
  Users,
  Eye
} from 'lucide-react';

interface MarketOpportunity {
  id: string;
  product: string;
  category: string;
  marketplace: string;
  currentPrice: number;
  suggestedPrice: number;
  profitMargin: number;
  competition: 'low' | 'medium' | 'high';
  demand: 'low' | 'medium' | 'high';
  trend: 'rising' | 'stable' | 'declining';
  confidence: number;
  monthlySales: number;
  keywords: string[];
  suppliers: number;
  aiAnalysis: {
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };
}

interface AIInsight {
  type: 'market_trend' | 'pricing' | 'competition' | 'demand';
  title: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  confidence: number;
  actionable: boolean;
}

export default function AIOpportunityFinder() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [opportunities, setOpportunities] = useState<MarketOpportunity[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [selectedFilters, setSelectedFilters] = useState({
    marketplace: 'all',
    competition: 'all',
    profitMargin: 'all',
    trend: 'all'
  });

  const mockOpportunities: MarketOpportunity[] = [
    {
      id: '1',
      product: 'Auriculares Inalámbricos Gaming RGB',
      category: 'Electrónicos > Gaming',
      marketplace: 'eBay',
      currentPrice: 45.99,
      suggestedPrice: 78.99,
      profitMargin: 41.8,
      competition: 'low',
      demand: 'high',
      trend: 'rising',
      confidence: 94,
      monthlySales: 2340,
      keywords: ['gaming headphones', 'rgb lighting', 'wireless', 'bluetooth'],
      suppliers: 23,
      aiAnalysis: {
        strengths: [
          'Nicho gaming en crecimiento exponencial',
          'Pocas ofertas con RGB y buena calidad',
          'Margen de ganancia muy atractivo'
        ],
        weaknesses: [
          'Competencia de marcas establecidas',
          'Necesita marketing específico para gamers'
        ],
        recommendations: [
          'Enfocar en características RGB únicas',
          'Optimizar para palabras clave gaming',
          'Considerar bundle con accesorios'
        ]
      }
    },
    {
      id: '2',
      product: 'Organizador de Escritorio con Carga Inalámbrica',
      category: 'Hogar > Oficina',
      marketplace: 'Amazon',
      currentPrice: 28.50,
      suggestedPrice: 49.99,
      profitMargin: 43.0,
      competition: 'medium',
      demand: 'medium',
      trend: 'stable',
      confidence: 87,
      monthlySales: 890,
      keywords: ['desk organizer', 'wireless charging', 'office accessories'],
      suppliers: 15,
      aiAnalysis: {
        strengths: [
          'Combina utilidad con tecnología',
          'Mercado de home office estable',
          'Producto diferenciado'
        ],
        weaknesses: [
          'Competencia moderada',
          'Requiere educación del cliente'
        ],
        recommendations: [
          'Destacar beneficios de productividad',
          'Mostrar compatibilidad con dispositivos',
          'Ofertar en paquetes de oficina'
        ]
      }
    }
  ];

  const mockInsights: AIInsight[] = [
    {
      type: 'market_trend',
      title: 'Tendencia al alza en gaming accessories',
      description: 'El mercado de accesorios gaming ha crecido 34% en los últimos 3 meses. Oportunidad para entrar en RGB y wireless.',
      impact: 'positive',
      confidence: 91,
      actionable: true
    },
    {
      type: 'pricing',
      title: 'Ajuste de precios recomendado',
      description: 'Los competidores han aumentado precios 12% en promedio. Es momento de ajustar al alza sin perder competitividad.',
      impact: 'positive',
      confidence: 85,
      actionable: true
    },
    {
      type: 'competition',
      title: 'Nueva competencia detectada',
      description: '3 nuevos vendedores han entrado al nicho de auriculares gaming en la última semana con precios agresivos.',
      impact: 'negative',
      confidence: 78,
      actionable: true
    }
  ];

  const analyzeOpportunities = async () => {
    setIsAnalyzing(true);
    
    // Simulate AI analysis
    setTimeout(() => {
      const filteredOpportunities = mockOpportunities.filter(opp => {
        if (searchQuery && !opp.product.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !opp.category.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        
        if (selectedFilters.marketplace !== 'all' && opp.marketplace.toLowerCase() !== selectedFilters.marketplace) {
          return false;
        }
        
        if (selectedFilters.competition !== 'all' && opp.competition !== selectedFilters.competition) {
          return false;
        }
        
        return true;
      });
      
      setOpportunities(filteredOpportunities);
      setInsights(mockInsights);
      setIsAnalyzing(false);
    }, 2000);
  };

  const getCompetitionColor = (level: string) => {
    switch (level) {
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';  
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getDemandColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'rising': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'stable': return <Target className="h-4 w-4 text-blue-600" />;
      case 'declining': return <TrendingUp className="h-4 w-4 text-red-600 rotate-180" />;
      default: return <Target className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl flex items-center justify-center">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Opportunity Finder</h1>
            <p className="text-gray-600">Descubre oportunidades de negocio con inteligencia artificial</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            <Download className="h-4 w-4" />
            <span>Exportar</span>
          </button>
          <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <RefreshCw className="h-4 w-4" />
            <span>Actualizar IA</span>
          </button>
        </div>
      </div>

      {/* Barra de búsqueda y filtros */}
      <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Buscar oportunidades
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: auriculares, gaming, hogar inteligente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Marketplace</label>
            <select 
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={selectedFilters.marketplace}
              onChange={(e) => setSelectedFilters({...selectedFilters, marketplace: e.target.value})}
            >
              <option value="all">Todos</option>
              <option value="ebay">eBay</option>
              <option value="amazon">Amazon</option>
              <option value="mercadolibre">MercadoLibre</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Competencia</label>
            <select 
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={selectedFilters.competition}
              onChange={(e) => setSelectedFilters({...selectedFilters, competition: e.target.value})}
            >
              <option value="all">Todas</option>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </div>
        </div>
        
        <button
          onClick={analyzeOpportunities}
          disabled={isAnalyzing}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Analizando con IA...</span>
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              <span>Analizar Oportunidades</span>
            </>
          )}
        </button>
      </div>

      {/* Insights de IA */}
      {insights.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <AlertCircle className="h-5 w-5 text-blue-600 mr-2" />
            Insights de Mercado
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {insights.map((insight, index) => (
              <div key={index} className={`p-4 rounded-lg border-l-4 ${
                insight.impact === 'positive' ? 'bg-green-50 border-green-500' :
                insight.impact === 'negative' ? 'bg-red-50 border-red-500' :
                'bg-blue-50 border-blue-500'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 mb-1">{insight.title}</h3>
                    <p className="text-sm text-gray-600 mb-2">{insight.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Confianza: {insight.confidence}%</span>
                      {insight.actionable && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          Accionable
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de oportunidades */}
      {opportunities.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Target className="h-5 w-5 text-green-600 mr-2" />
            Oportunidades Detectadas ({opportunities.length})
          </h2>
          
          {opportunities.map((opp) => (
            <div key={opp.id} className="bg-white rounded-xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <h3 className="text-xl font-semibold text-gray-900">{opp.product}</h3>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      {opp.marketplace}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{opp.category}</p>
                  
                  {/* Métricas principales */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">${opp.profitMargin.toFixed(1)}%</p>
                      <p className="text-xs text-gray-600">Margen</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">{opp.confidence}%</p>
                      <p className="text-xs text-gray-600">Confianza IA</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-purple-600">{opp.monthlySales.toLocaleString()}</p>
                      <p className="text-xs text-gray-600">Ventas/mes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-orange-600">{opp.suppliers}</p>
                      <p className="text-xs text-gray-600">Proveedores</p>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="flex items-center space-x-2 mb-2">
                    {getTrendIcon(opp.trend)}
                    <span className="text-sm font-medium capitalize">{opp.trend}</span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className={`px-2 py-1 rounded-full text-xs border ${getCompetitionColor(opp.competition)}`}>
                      Competencia {opp.competition}
                    </div>
                    <div className={`text-xs font-medium ${getDemandColor(opp.demand)}`}>
                      Demanda {opp.demand}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Precios */}
              <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <p className="text-sm text-gray-600">Precio actual</p>
                  <p className="text-lg font-semibold text-gray-900">${opp.currentPrice}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Precio sugerido</p>
                  <p className="text-lg font-semibold text-green-600">${opp.suggestedPrice}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Ganancia potencial</p>
                  <p className="text-lg font-semibold text-blue-600">${(opp.suggestedPrice - opp.currentPrice).toFixed(2)}</p>
                </div>
              </div>
              
              {/* Análisis de IA */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <h4 className="font-medium text-green-700 mb-2 flex items-center">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Fortalezas
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {opp.aiAnalysis.strengths.map((strength, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="w-1 h-1 bg-green-400 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-red-700 mb-2 flex items-center">
                    <XCircle className="h-4 w-4 mr-1" />
                    Debilidades
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {opp.aiAnalysis.weaknesses.map((weakness, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="w-1 h-1 bg-red-400 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                        {weakness}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-blue-700 mb-2 flex items-center">
                    <Star className="h-4 w-4 mr-1" />
                    Recomendaciones
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {opp.aiAnalysis.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="w-1 h-1 bg-blue-400 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              
              {/* Keywords */}
              <div className="mb-4">
                <h4 className="font-medium text-gray-700 mb-2">Keywords clave:</h4>
                <div className="flex flex-wrap gap-2">
                  {opp.keywords.map((keyword, idx) => (
                    <span key={idx} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Acciones */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <div className="flex items-center">
                    <Eye className="h-4 w-4 mr-1" />
                    <span>Análisis detallado</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    <span>Hace 2h</span>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <button className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    Ver detalles
                  </button>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    Importar producto
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Estado vacío */}
      {opportunities.length === 0 && !isAnalyzing && (
        <div className="text-center py-12">
          <Brain className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Descubre oportunidades con IA</h3>
          <p className="text-gray-600 mb-6">
            Utiliza nuestro motor de IA para encontrar los productos más rentables del mercado
          </p>
          <button
            onClick={() => {
              setSearchQuery('gaming');
              analyzeOpportunities();
            }}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Empezar análisis
          </button>
        </div>
      )}
    </div>
  );
}