import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '@services/api';
import {
  Lightbulb,
  TrendingUp,
  DollarSign,
  Target,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  ArrowRight,
  RefreshCw,
  Star,
  BarChart3,
  ShoppingCart,
  Users,
  Globe,
  Settings,
  Play,
  Pause,
  X,
  Search
} from 'lucide-react';

interface AISuggestion {
  id: string;
  type: 'pricing' | 'inventory' | 'marketing' | 'listing' | 'optimization' | 'automation' | 'search';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: {
    revenue: number;
    time: number;
    difficulty: 'easy' | 'medium' | 'hard';
  };
  confidence: number;
  actionable: boolean;
  implemented: boolean;
  estimatedTime: string;
  requirements: string[];
  steps: string[];
  relatedProducts?: string[];
  metrics?: {
    currentValue: number;
    targetValue: number;
    unit: string;
  };
  // ✅ OBJETIVO A: Campos para sugerencias de keywords
  keyword?: string;
  keywordCategory?: string;
  keywordSegment?: string;
  keywordReason?: string;
  keywordSupportingMetric?: {
    type: 'demand' | 'margin' | 'roi' | 'competition' | 'trend';
    value: number;
    unit: string;
    description: string;
  };
  targetMarketplaces?: string[];
  estimatedOpportunities?: number;
}

interface AutomationRule {
  id: string;
  name: string;
  type: 'pricing' | 'inventory' | 'listing';
  status: 'active' | 'paused' | 'draft';
  trigger: string;
  action: string;
  lastRun: string;
  successRate: number;
}

export default function AISuggestionsPanel() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);

  useEffect(() => {
    loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilter]);

  const loadSuggestions = async () => {
    try {
      const response = await api.get('/api/ai-suggestions', {
        params: selectedFilter !== 'all' ? { filter: selectedFilter } : {}
      });
      
      // ✅ Mejorar manejo de respuesta - verificar estructura
      const suggestionsData: AISuggestion[] = Array.isArray(response.data?.suggestions)
        ? response.data.suggestions
        : Array.isArray(response.data)
        ? response.data
        : [];
      
      setSuggestions(suggestionsData);
      setAutomationRules([]); // TODO: Implementar reglas de automatización
      
      // ✅ Si no hay sugerencias, no mostrar error (es normal)
      if (suggestionsData.length === 0 && selectedFilter === 'all') {
        // Silencioso - no hay sugerencias aún
      }
    } catch (error: any) {
      console.error('Error loading suggestions:', error);
      // ✅ No mostrar toast de error si el backend retornó respuesta válida con array vacío
      if (error.response?.status === 200 && Array.isArray(error.response?.data?.suggestions)) {
        // El backend retornó array vacío, no es un error
        setSuggestions([]);
        return;
      }
      // Solo mostrar error si es un error real (no 404, no 200 con array vacío)
      if (error.response?.status !== 404 && error.response?.status !== 200) {
        toast.error('Error al cargar sugerencias');
      } else {
        // Si es 404 o respuesta válida vacía, simplemente no hay sugerencias
        setSuggestions([]);
      }
    }
  };

  const generateNewSuggestions = async () => {
    setIsGenerating(true);
    try {
      const response = await api.post('/api/ai-suggestions/generate', {
        category: selectedFilter !== 'all' ? selectedFilter : undefined
      });
      
      const newSuggestions: AISuggestion[] = Array.isArray(response.data?.suggestions)
        ? response.data.suggestions
        : [];
      
      if (newSuggestions.length > 0) {
        // ✅ Agregar nuevas sugerencias al estado actual
        setSuggestions(prev => {
          // Evitar duplicados por ID
          const existingIds = new Set(prev.map(s => s.id));
          const uniqueNew = newSuggestions.filter(s => !existingIds.has(s.id));
          return [...uniqueNew, ...prev];
        });
        
        toast.success(`✅ Se generaron ${newSuggestions.length} sugerencias inteligentes`);
        
        // ✅ Esperar un momento antes de recargar para asegurar que se guardaron
        setTimeout(async () => {
          await loadSuggestions();
        }, 1000);
      } else {
        toast('No se generaron nuevas sugerencias en este momento', { icon: 'ℹ️' });
      }
    } catch (error: any) {
      console.error('Error generating suggestions:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Error al generar sugerencias';
      toast.error(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  const implementSuggestion = async (suggestionId: string) => {
    try {
      await api.post(`/api/ai-suggestions/${suggestionId}/implement`);
      setSuggestions(prev =>
        prev.map(s =>
          s.id === suggestionId ? { ...s, implemented: true } : s
        )
      );
      toast.success('Sugerencia marcada como implementada');
    } catch (error: any) {
      console.error('Error implementing suggestion:', error);
      toast.error('Error al marcar sugerencia como implementada');
    }
  };

  const toggleAutomationRule = (ruleId: string) => {
    setAutomationRules(prev =>
      prev.map(rule =>
        rule.id === ruleId
          ? { ...rule, status: rule.status === 'active' ? 'paused' : 'active' }
          : rule
      )
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'pricing': return <DollarSign className="h-4 w-4" />;
      case 'inventory': return <ShoppingCart className="h-4 w-4" />;
      case 'marketing': return <Target className="h-4 w-4" />;
      case 'listing': return <Globe className="h-4 w-4" />;
      case 'optimization': return <BarChart3 className="h-4 w-4" />;
      case 'automation': return <Settings className="h-4 w-4" />;
      case 'search': return <Search className="h-4 w-4" />; // ✅ OBJETIVO A: Icono para sugerencias de búsqueda
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'hard': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const filteredSuggestions = selectedFilter === 'all' 
    ? suggestions 
    : suggestions.filter(s => s.type === selectedFilter);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center">
            <Lightbulb className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sugerencias IA</h1>
            <p className="text-gray-600">Optimizaciones inteligentes para tu negocio</p>
          </div>
        </div>
        
        <button
          onClick={generateNewSuggestions}
          disabled={isGenerating}
          className="flex items-center space-x-2 bg-gradient-to-r from-yellow-500 to-orange-600 text-white px-4 py-2 rounded-lg hover:from-yellow-600 hover:to-orange-700 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{isGenerating ? 'Generando...' : 'Nueva sugerencia'}</span>
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {['all', 'search', 'pricing', 'inventory', 'marketing', 'listing', 'optimization', 'automation'].map((filter) => (
          <button
            key={filter}
            onClick={() => setSelectedFilter(filter)}
            className={`px-4 py-2 rounded-full text-sm transition-all ${
              selectedFilter === filter
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span className="capitalize">
              {filter === 'all' ? 'Todas' : filter === 'search' ? 'Búsquedas' : filter}
            </span>
          </button>
        ))}
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Sugerencias activas</p>
              <p className="text-2xl font-bold text-blue-600">{suggestions.filter(s => !s.implemented).length}</p>
            </div>
            <Lightbulb className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Impacto potencial</p>
              <p className="text-2xl font-bold text-green-600">
                {/* ✅ OBJETIVO A: Formatear números correctamente */}
                ${(() => {
                  const total = suggestions.reduce((acc, s) => acc + s.impact.revenue, 0);
                  // Si el número es muy grande o tiene formato extraño, formatearlo correctamente
                  if (total > 1000000) {
                    return (total / 1000000).toFixed(1) + 'M';
                  } else if (total > 1000) {
                    return (total / 1000).toFixed(1) + 'K';
                  }
                  return total.toLocaleString('en-US', { maximumFractionDigits: 0 });
                })()}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-600" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tiempo ahorrado</p>
              <p className="text-2xl font-bold text-purple-600">
                {suggestions.reduce((acc, s) => acc + s.impact.time, 0)}h
              </p>
            </div>
            <Clock className="h-8 w-8 text-purple-600" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Automatizaciones</p>
              <p className="text-2xl font-bold text-orange-600">
                {automationRules.filter(r => r.status === 'active').length}
              </p>
            </div>
            <Settings className="h-8 w-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Lista de sugerencias */}
      <div className="space-y-4">
        {filteredSuggestions.map((suggestion) => (
          <div key={suggestion.id} className={`bg-white rounded-xl p-6 border-2 transition-all ${
            suggestion.implemented ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-blue-300'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4 flex-1">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  suggestion.implemented ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  {suggestion.implemented ? <CheckCircle className="h-5 w-5" /> : getTypeIcon(suggestion.type)}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className={`text-lg font-semibold ${
                      suggestion.implemented ? 'text-green-800' : 'text-gray-900'
                    }`}>
                      {suggestion.title}
                    </h3>
                    <span className={`px-2 py-1 rounded-full text-xs border ${getPriorityColor(suggestion.priority)}`}>
                      {suggestion.priority}
                    </span>
                    {suggestion.implemented && (
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                        Implementada
                      </span>
                    )}
                  </div>
                  
                  <p className="text-gray-600 mb-3">{suggestion.description}</p>
                  
                  {/* Métricas de impacto */}
                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-gray-500">Impacto económico</p>
                      <p className="font-semibold text-green-600">+${suggestion.impact.revenue}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Tiempo ahorrado</p>
                      <p className="font-semibold text-purple-600">{suggestion.impact.time}h</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Dificultad</p>
                      <p className={`font-semibold capitalize ${getDifficultyColor(suggestion.impact.difficulty)}`}>
                        {suggestion.impact.difficulty}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Confianza IA</p>
                      <p className="font-semibold text-blue-600">{suggestion.confidence}%</p>
                    </div>
                  </div>
                  
                  {suggestion.metrics && (
                    <div className="bg-gray-50 p-3 rounded-lg mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Métrica objetivo:</span>
                        <span className="text-sm">
                          <span className="text-gray-500">{suggestion.metrics.currentValue} {suggestion.metrics.unit}</span>
                          <ArrowRight className="h-3 w-3 inline mx-1" />
                          <span className="text-green-600 font-semibold">{suggestion.metrics.targetValue} {suggestion.metrics.unit}</span>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* ✅ OBJETIVO A: Mostrar información de keyword si es sugerencia de búsqueda */}
                  {suggestion.type === 'search' && suggestion.keyword && (
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Search className="h-4 w-4 text-blue-600" />
                            <span className="font-semibold text-blue-900">Keyword sugerida:</span>
                            <span className="text-lg font-bold text-blue-700">"{suggestion.keyword}"</span>
                          </div>
                          {suggestion.keywordReason && (
                            <p className="text-sm text-blue-800 mb-2">{suggestion.keywordReason}</p>
                          )}
                          {suggestion.keywordSupportingMetric && (
                            <div className="text-xs text-blue-700">
                              <strong>{suggestion.keywordSupportingMetric.description}</strong>
                              {' '}({suggestion.keywordSupportingMetric.value} {suggestion.keywordSupportingMetric.unit})
                            </div>
                          )}
                          {suggestion.targetMarketplaces && suggestion.targetMarketplaces.length > 0 && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-xs text-blue-700">Marketplaces:</span>
                              <div className="flex gap-1">
                                {suggestion.targetMarketplaces.map((mp, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                    {mp}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {suggestion.estimatedOpportunities && (
                            <div className="mt-2 text-xs text-blue-700">
                              <strong>Oportunidades estimadas:</strong> {suggestion.estimatedOpportunities}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* ✅ OBJETIVO A: Botón para buscar oportunidades con esta keyword */}
                      <button
                        onClick={() => {
                          // Navegar a /opportunities con la keyword pre-llenada
                          const params = new URLSearchParams();
                          params.set('keyword', suggestion.keyword || '');
                          if (suggestion.targetMarketplaces && suggestion.targetMarketplaces.length > 0) {
                            params.set('marketplaces', suggestion.targetMarketplaces.join(','));
                          }
                          navigate(`/opportunities?${params.toString()}`);
                          toast.success(`Buscando oportunidades para "${suggestion.keyword}"`);
                        }}
                        className="w-full mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                      >
                        <Search className="h-4 w-4" />
                        Buscar oportunidades con esta keyword
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">{suggestion.estimatedTime}</span>
                
                {!suggestion.implemented && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setExpandedSuggestion(
                        expandedSuggestion === suggestion.id ? null : suggestion.id
                      )}
                      className="px-3 py-1 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                    >
                      {expandedSuggestion === suggestion.id ? 'Ocultar' : 'Ver detalles'}
                    </button>
                    {suggestion.type !== 'search' && (
                      <button
                        onClick={() => implementSuggestion(suggestion.id)}
                        className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center space-x-1"
                      >
                        <Zap className="h-3 w-3" />
                        <span>Implementar</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Detalles expandidos */}
            {expandedSuggestion === suggestion.id && (
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Requerimientos:</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      {suggestion.requirements.map((req, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="w-1 h-1 bg-blue-400 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Pasos a seguir:</h4>
                    <ol className="text-sm text-gray-600 space-y-1">
                      {suggestion.steps.map((step, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="bg-blue-100 text-blue-800 rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2 mt-0.5 flex-shrink-0">
                            {idx + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
                
                {suggestion.relatedProducts && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Productos relacionados:</h4>
                    <div className="flex flex-wrap gap-2">
                      {suggestion.relatedProducts.map((product, idx) => (
                        <span key={idx} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                          {product}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Panel de automatización */}
      {automationRules.length > 0 && (
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Settings className="h-5 w-5 text-gray-600 mr-2" />
              Reglas de Automatización
            </h2>
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              + Nueva regla
            </button>
          </div>
          
          <div className="space-y-3">
            {automationRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className={`w-3 h-3 rounded-full ${
                    rule.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
                  }`}></div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900">{rule.name}</h4>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Si:</span> {rule.trigger} → 
                      <span className="font-medium"> Entonces:</span> {rule.action}
                    </p>
                    <div className="flex items-center space-x-4 mt-1">
                      <span className="text-xs text-gray-500">Última ejecución: {rule.lastRun}</span>
                      <span className="text-xs text-gray-500">Éxito: {rule.successRate}%</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => toggleAutomationRule(rule.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      rule.status === 'active'
                        ? 'bg-red-100 text-red-600 hover:bg-red-200'
                        : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}
                  >
                    {rule.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}