import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '@services/api';
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
  targetMarketplaces: string[];
  aliexpressUrl?: string;
  image?: string;
  currentPrice: number;
  suggestedPrice: number;
  profitMargin: number;
  competition: 'low' | 'medium' | 'high' | 'unknown';
  demand: 'low' | 'medium' | 'high' | 'unknown';
  trend: 'rising' | 'stable' | 'declining';
  confidence: number;
  estimatedFields: string[];
  estimationNotes: string[];
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

interface SearchProgress {
  stage: 'idle' | 'scraping' | 'analyzing' | 'calculating' | 'complete';
  message: string;
  productsFound: number;
  productsAnalyzed: number;
  opportunitiesFound: number;
  elapsedTime: number;
}

export default function AIOpportunityFinder() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [opportunities, setOpportunities] = useState<MarketOpportunity[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<SearchProgress>({
    stage: 'idle',
    message: 'Listo para buscar oportunidades',
    productsFound: 0,
    productsAnalyzed: 0,
    opportunitiesFound: 0,
    elapsedTime: 0
  });
  const [selectedFilters, setSelectedFilters] = useState({
    marketplace: 'all',
    competition: 'all',
    profitMargin: 'all',
    trend: 'all'
  });

  const analyzeOpportunities = async () => {
    if (!searchQuery.trim()) {
      toast.error('Por favor ingresa un término de búsqueda');
      return;
    }

    setIsAnalyzing(true);
    const startTime = Date.now();
    
    // Inicializar progreso
    setProgress({
      stage: 'scraping',
      message: '🔍 Buscando productos en AliExpress...',
      productsFound: 0,
      productsAnalyzed: 0,
      opportunitiesFound: 0,
      elapsedTime: 0
    });

    // Simular progreso mientras se busca (para feedback visual)
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        let newStage = prev.stage;
        let newMessage = prev.message;
        
        // Simular progreso basado en tiempo transcurrido
        if (elapsed < 5) {
          newStage = 'scraping';
          newMessage = '🔍 Escrapeando productos en AliExpress...';
        } else if (elapsed < 15) {
          newStage = 'analyzing';
          newMessage = `📊 Analizando productos encontrados...`;
        } else if (elapsed < 25) {
          newStage = 'calculating';
          newMessage = '💰 Calculando márgenes y oportunidades...';
        } else {
          // Si lleva más de 25 segundos, mantener en calculating pero mostrar mensaje de espera
          newStage = 'calculating';
          newMessage = '⏳ Procesando datos, por favor espera...';
        }
        
        return {
          ...prev,
          stage: newStage,
          message: newMessage,
          elapsedTime: elapsed
        };
      });
    }, 500);
    
    try {
      // ✅ USAR API REAL - Buscar oportunidades reales
      const response = await api.get('/api/opportunities', {
        params: {
          query: searchQuery,
          maxItems: 10,
          marketplaces: selectedFilters.marketplace === 'all' ? 'ebay,amazon,mercadolibre' : selectedFilters.marketplace,
          region: 'us'
        }
      });
      
      clearInterval(progressInterval);

      const items = response.data?.items || [];
      const debugInfo = response.data?.debug || null;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      
      // Actualizar progreso con datos reales
      setProgress(prev => ({
        stage: 'complete',
        message: items.length > 0 
          ? `✅ ${items.length} ${items.length === 1 ? 'oportunidad encontrada' : 'oportunidades encontradas'} en ${elapsed}s`
          : `⚠️ No se encontraron oportunidades en ${elapsed}s`,
        productsFound: items.length,
        productsAnalyzed: items.length,
        opportunitiesFound: items.length,
        elapsedTime: elapsed
      }));
      
      // Convertir items de la API al formato del componente
      const formattedOpportunities: MarketOpportunity[] = items.map((item: any, index: number) => ({
        id: String(item.productId || index),
        product: item.title || 'Producto sin título',
        category: 'General',
        marketplace: item.targetMarketplaces?.[0] || 'ebay',
        targetMarketplaces: Array.isArray(item.targetMarketplaces) && item.targetMarketplaces.length > 0
          ? item.targetMarketplaces
          : ['ebay', 'amazon', 'mercadolibre'],
        aliexpressUrl: item.aliexpressUrl,
        image: item.image,
        currentPrice: item.costUsd || 0,
        suggestedPrice: item.suggestedPriceUsd || 0,
        profitMargin: (item.profitMargin || 0) * 100,
        competition: item.competitionLevel || 'unknown',
        demand: item.marketDemand || 'unknown',
        trend: 'stable',
        confidence: (item.confidenceScore || 0.5) * 100,
        estimatedFields: item.estimatedFields || [],
        estimationNotes: item.estimationNotes || [],
        monthlySales: 0,
        keywords: [],
        suppliers: 0,
        aiAnalysis: {
          strengths: ['Oportunidad validada por análisis de mercado'],
          weaknesses: [],
          recommendations: ['Revisar detalles antes de publicar']
        }
      }));

      // Aplicar filtros adicionales
      const filteredOpportunities = formattedOpportunities.filter(opp => {
        if (selectedFilters.competition !== 'all' && opp.competition !== selectedFilters.competition) {
          return false;
        }
        return true;
      });
      
      setOpportunities(filteredOpportunities);
      
      // Generar insights basados en resultados reales
      const realInsights: AIInsight[] = [];
      if (filteredOpportunities.length > 0) {
        const avgMargin = filteredOpportunities.reduce((sum, opp) => sum + opp.profitMargin, 0) / filteredOpportunities.length;
        realInsights.push({
          type: 'market_trend',
          title: `${filteredOpportunities.length} oportunidades encontradas`,
          description: `Margen promedio: ${avgMargin.toFixed(1)}%. Analiza cada oportunidad antes de proceder.`,
          impact: avgMargin > 30 ? 'positive' : 'neutral',
          confidence: Math.min(90, filteredOpportunities.length * 10),
          actionable: true
        });
      } else {
        // Mostrar información de debug si está disponible
        let description = 'Intenta con términos de búsqueda diferentes o ajusta los filtros.';
        if (debugInfo) {
          const causes = debugInfo.possibleCauses || [];
          const suggestions = debugInfo.suggestions || [];
          description = `${debugInfo.message || 'No se encontraron productos en AliExpress.'}\n\nPosibles causas:\n${causes.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}\n\nSugerencias:\n${suggestions.map((s: string, i: number) => `• ${s}`).join('\n')}`;
        }
        
        realInsights.push({
          type: 'market_trend',
          title: 'No se encontraron oportunidades',
          description,
          impact: 'neutral',
          confidence: 50,
          actionable: true
        });
        
        // Mostrar toast con información de debug si está disponible
        if (debugInfo) {
          toast.error(
            <div className="space-y-2 text-sm max-w-md">
              <p className="font-semibold text-gray-900">{debugInfo.message || 'No se encontraron productos'}</p>
              <div className="text-gray-700 text-xs space-y-1">
                <p className="font-medium">Posibles causas:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {debugInfo.possibleCauses?.map((cause: string, i: number) => (
                    <li key={i}>{cause}</li>
                  ))}
                </ul>
                <p className="font-medium mt-2">Sugerencias:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {debugInfo.suggestions?.map((suggestion: string, i: number) => (
                    <li key={i}>{suggestion}</li>
                  ))}
                </ul>
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <a
                    href="/api-settings"
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.href = '/api-settings';
                    }}
                  >
                    Ir a API Settings para verificar AliExpress →
                  </a>
                </div>
              </div>
            </div>,
            { duration: 15000 }
          );
        }
      }
      
      setInsights(realInsights);
    } catch (error: any) {
      console.error('Error searching opportunities:', error);
      if (error?.response?.status === 428) {
        const data = error.response?.data || {};
        const manualPath = data.manualUrl || (data.token ? `/manual-login/${data.token}` : null);
        const targetUrl = manualPath
          ? (manualPath.startsWith('http') ? manualPath : `${window.location.origin}${manualPath}`)
          : data.loginUrl;
        toast.custom((t) => (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-gray-900">Se requiere iniciar sesión en AliExpress</p>
            <p className="text-gray-700 text-xs">Abriremos la página de autenticación. Una vez que guardes la sesión, vuelve a intentar.</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (targetUrl) window.open(targetUrl, '_blank', 'noopener,noreferrer');
                  toast.dismiss(t.id);
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
              >
                Abrir login
              </button>
              <button
                onClick={() => toast.dismiss(t.id)}
                className="px-3 py-1 border border-gray-300 rounded text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        ));
      } else {
        toast.error(error.response?.data?.error || 'Error al buscar oportunidades');
      }
      setOpportunities([]);
      setInsights([]);
      setProgress({
        stage: 'idle',
        message: 'Error en la búsqueda. Intenta nuevamente.',
        productsFound: 0,
        productsAnalyzed: 0,
        opportunitiesFound: 0,
        elapsedTime: 0
      });
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'scraping':
        return <Search className="h-5 w-5 animate-pulse text-blue-600" />;
      case 'analyzing':
        return <Brain className="h-5 w-5 animate-pulse text-purple-600" />;
      case 'calculating':
        return <TrendingUp className="h-5 w-5 animate-pulse text-green-600" />;
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      default:
        return <Search className="h-5 w-5 text-gray-400" />;
    }
  };
  
  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'scraping':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'analyzing':
        return 'bg-purple-100 border-purple-300 text-purple-800';
      case 'calculating':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'complete':
        return 'bg-green-50 border-green-200 text-green-700';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
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

  const handleViewDetails = (opp: MarketOpportunity) => {
    if (opp.aliexpressUrl) {
      window.open(opp.aliexpressUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast('No se encontró el enlace original del producto.', { icon: 'ℹ️' });
    }
  };

  const handleImportProduct = async (opp: MarketOpportunity) => {
    if (!opp.aliexpressUrl) {
      toast.error('No se puede importar porque falta el enlace de AliExpress.');
      return;
    }

    try {
      setImportingId(opp.id);

      const payload: Record<string, any> = {
        title: opp.product,
        aliexpressUrl: opp.aliexpressUrl,
        aliexpressPrice: opp.currentPrice,
        suggestedPrice: opp.suggestedPrice,
        currency: 'USD',
      };

      if (opp.image && /^https?:\/\//i.test(opp.image)) {
        payload.imageUrl = opp.image;
      }

      const productResponse = await api.post('/api/products', payload);
      const productId = productResponse.data?.id || productResponse.data?.product?.id;
      if (!productId) {
        throw new Error('No se pudo obtener el ID del producto creado');
      }

      const marketplace = opp.targetMarketplaces?.[0] || opp.marketplace || 'ebay';
      const publishResponse = await api.post('/api/marketplace/publish', {
        productId: Number(productId),
        marketplace,
      });

      if (publishResponse.data?.success) {
        toast.success(`Producto importado y publicado en ${marketplace}`);
      } else {
        throw new Error(publishResponse.data?.error || 'Error al publicar');
      }
    } catch (error: any) {
      console.error('Error importing product from AI finder:', error);
      const msg = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Error al importar el producto';
      toast.error(msg);
    } finally {
      setImportingId(null);
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

      {/* Panel de progreso animado */}
      {isAnalyzing && (
        <div className={`bg-white rounded-xl p-6 shadow-lg border-2 ${getStageColor(progress.stage)} transition-all duration-500`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {getStageIcon(progress.stage)}
              <div>
                <h3 className="font-semibold text-lg">{progress.message}</h3>
                <p className="text-sm opacity-80">
                  {progress.stage === 'scraping' && 'Buscando productos en AliExpress...'}
                  {progress.stage === 'analyzing' && 'Analizando productos encontrados...'}
                  {progress.stage === 'calculating' && 'Calculando márgenes y oportunidades...'}
                  {progress.stage === 'complete' && 'Búsqueda completada exitosamente'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{progress.elapsedTime}s</div>
              <div className="text-xs opacity-70">Tiempo transcurrido</div>
            </div>
          </div>
          
          {/* Barra de progreso animada */}
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  progress.stage === 'scraping' ? 'bg-blue-500' :
                  progress.stage === 'analyzing' ? 'bg-purple-500' :
                  progress.stage === 'calculating' ? 'bg-green-500' :
                  'bg-green-600'
                }`}
                style={{
                  width: progress.stage === 'complete' ? '100%' :
                         progress.stage === 'calculating' ? '90%' :
                         progress.stage === 'analyzing' ? '60%' : '30%',
                  animation: progress.stage !== 'complete' ? 'pulse 2s ease-in-out infinite' : 'none'
                }}
              />
            </div>
          </div>
          
          {/* Estadísticas en tiempo real */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-white/50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{progress.productsFound}</div>
              <div className="text-xs opacity-70">Productos encontrados</div>
            </div>
            <div className="text-center p-3 bg-white/50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{progress.productsAnalyzed}</div>
              <div className="text-xs opacity-70">Productos analizados</div>
            </div>
            <div className="text-center p-3 bg-white/50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{progress.opportunitiesFound}</div>
              <div className="text-xs opacity-70">Oportunidades</div>
            </div>
          </div>
          
          {/* Indicadores de etapa */}
          <div className="flex items-center justify-center space-x-2 mt-4">
            <div className={`w-3 h-3 rounded-full ${progress.stage === 'scraping' ? 'bg-blue-600 animate-pulse' : progress.stage !== 'idle' ? 'bg-blue-400' : 'bg-gray-300'}`} />
            <div className={`w-3 h-3 rounded-full ${progress.stage === 'analyzing' ? 'bg-purple-600 animate-pulse' : ['calculating', 'complete'].includes(progress.stage) ? 'bg-purple-400' : 'bg-gray-300'}`} />
            <div className={`w-3 h-3 rounded-full ${progress.stage === 'calculating' ? 'bg-green-600 animate-pulse' : progress.stage === 'complete' ? 'bg-green-400' : 'bg-gray-300'}`} />
            <div className={`w-3 h-3 rounded-full ${progress.stage === 'complete' ? 'bg-green-600' : 'bg-gray-300'}`} />
          </div>
        </div>
      )}
      
      {/* Resultados con animación */}
      {!isAnalyzing && progress.stage === 'complete' && opportunities.length > 0 && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-semibold text-green-800">
                ✅ {opportunities.length} {opportunities.length === 1 ? 'oportunidad encontrada' : 'oportunidades encontradas'} en {progress.elapsedTime}s
              </span>
            </div>
            <button
              onClick={() => setProgress({ ...progress, stage: 'idle' })}
              className="text-green-600 hover:text-green-700 text-sm"
            >
              Ocultar
            </button>
          </div>
        </div>
      )}

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
            <div
              key={opp.id}
              className="bg-white rounded-xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow"
            >
              <div className="flex flex-col md:flex-row md:items-start md:space-x-4 mb-4">
                <div className="w-full md:w-32 md:flex-shrink-0 mb-4 md:mb-0">
                  {opp.image ? (
                    <img
                      src={opp.image}
                      alt={opp.product}
                      className="w-full h-24 object-cover rounded border border-gray-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/160x120?text=No+Image';
                      }}
                    />
                  ) : (
                    <div className="w-full h-24 bg-gray-100 border border-dashed border-gray-300 rounded flex items-center justify-center text-xs text-gray-500">
                      Sin imagen
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <h3 className="text-xl font-semibold text-gray-900">
                      {opp.product}
                    </h3>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full capitalize">
                      {opp.marketplace}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{opp.category}</p>
                  {opp.estimationNotes.length > 0 && (
                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded mb-3">
                      {opp.estimationNotes.map((note, idx) => (
                        <div key={idx}>* {note}</div>
                      ))}
                    </div>
                  )}

                  {/* Métricas principales */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {opp.profitMargin.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-600 flex items-center justify-center gap-1">
                        Margen
                        {opp.estimatedFields.includes('profitMargin') && (
                          <span className="uppercase text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                            Estimado
                          </span>
                        )}
                      </p>
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
                  <p className="text-lg font-semibold text-green-600 flex items-center justify-center gap-2">
                    ${opp.suggestedPrice}
                    {opp.estimatedFields.includes('suggestedPriceUsd') && (
                      <span className="uppercase text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded-full font-semibold">
                        Estimado
                      </span>
                    )}
                  </p>
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
                  <button
                    onClick={() => handleViewDetails(opp)}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Ver detalles
                  </button>
                  <button
                    onClick={() => handleImportProduct(opp)}
                    disabled={importingId === opp.id}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importingId === opp.id ? 'Importando...' : 'Importar producto'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Estado vacío */}
      {opportunities.length === 0 && !isAnalyzing && progress.stage !== 'complete' && (
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