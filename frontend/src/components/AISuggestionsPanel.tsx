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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);

  useEffect(() => {
    loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilter]);

  const loadSuggestions = async (showRetry = false) => {
    setIsLoading(true);
    setLoadError(null);
    
    try {
      const response = await api.get('/api/ai-suggestions', {
        params: selectedFilter !== 'all' ? { filter: selectedFilter } : {},
        timeout: 10000, // 10 segundos timeout
      });
      
      // ✅ Mejorar manejo de respuesta - verificar estructura
      const suggestionsData: AISuggestion[] = Array.isArray(response.data?.suggestions)
        ? response.data.suggestions
        : Array.isArray(response.data)
        ? response.data
        : [];
      
      setSuggestions(suggestionsData);
      setAutomationRules([]); // TODO: Implementar reglas de automatización
      setLoadError(null);
      
      // ✅ Si no hay sugerencias, no mostrar error (es normal)
      if (suggestionsData.length === 0 && selectedFilter === 'all') {
        // Silencioso - no hay sugerencias aún
      }
    } catch (error: any) {
      console.error('Error loading suggestions:', error);
      
      // ✅ Mejor manejo de errores de red (servidor reiniciándose, no disponible, etc.)
      if (!error.response) {
        // Error de red (servidor no disponible, timeout, etc.)
        if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.message?.includes('timeout')) {
          const errorMsg = 'El servidor no está disponible temporalmente. Verifica tu conexión.';
          setLoadError(errorMsg);
          
          // Si no es un retry manual, intentar automáticamente una vez
          if (!showRetry) {
            console.warn('Servidor no disponible temporalmente, reintentando en 2 segundos...');
            setTimeout(() => {
              loadSuggestions(true);
            }, 2000);
            return;
          }
        } else {
          setLoadError('Error de conexión. Verifica tu conexión a internet.');
        }
      } else if (error.response?.status === 200 && Array.isArray(error.response?.data?.suggestions)) {
        // ✅ El backend retornó respuesta válida con array vacío, no es un error
        setSuggestions([]);
        setLoadError(null);
      } else if (error.response?.status && error.response?.status !== 404 && error.response?.status !== 200) {
        // Error real del servidor
        setLoadError('Error al cargar sugerencias. Intenta nuevamente.');
      } else {
        // Si es 404 o respuesta válida vacía, simplemente no hay sugerencias
        setSuggestions([]);
        setLoadError(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const generateNewSuggestions = async () => {
    setIsGenerating(true);
    try {
      // ✅ CORREGIDO: Generar sugerencias basadas en tendencias reales
      // Primero intentar generar keywords basadas en tendencias
      const keywordResponse = await api.get('/api/ai-suggestions/keywords', {
        params: { max: 5 }
      }).catch(() => ({ data: { suggestions: [] } }));
      
      const keywordSuggestions: AISuggestion[] = Array.isArray(keywordResponse.data?.suggestions)
        ? keywordResponse.data.suggestions
        : [];
      
      // Luego generar sugerencias generales
      const response = await api.post('/api/ai-suggestions/generate', {
        category: selectedFilter !== 'all' ? selectedFilter : undefined
      });
      
      const newSuggestions: AISuggestion[] = Array.isArray(response.data?.suggestions)
        ? response.data.suggestions
        : [];
      
      // Combinar sugerencias de keywords con sugerencias generales
      const allNewSuggestions = [...keywordSuggestions, ...newSuggestions];
      
      if (allNewSuggestions.length > 0) {
        // ✅ Agregar nuevas sugerencias al estado actual
        setSuggestions(prev => {
          // Evitar duplicados por ID o keyword
          const existingIds = new Set(prev.map(s => s.id));
          const existingKeywords = new Set(prev.filter(s => s.keyword).map(s => s.keyword));
          const uniqueNew = allNewSuggestions.filter(s => 
            !existingIds.has(s.id) && 
            (!s.keyword || !existingKeywords.has(s.keyword))
          );
          return [...uniqueNew, ...prev];
        });
        
        toast.success(`✅ Se generaron ${allNewSuggestions.length} sugerencias inteligentes basadas en tendencias`);
        
        // ✅ Esperar un momento antes de recargar para asegurar que se guardaron
        setTimeout(async () => {
          await loadSuggestions();
        }, 1000);
      } else {
        toast('No se generaron nuevas sugerencias en este momento. Intenta más tarde.', { icon: 'ℹ️' });
      }
    } catch (error: any) {
      console.error('Error generating suggestions:', error);
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || 'Error al generar sugerencias';
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

  // ✅ Logging para debugging
  useEffect(() => {
    if (suggestions.length > 0) {
      console.log('AISuggestionsPanel: Sugerencias cargadas', {
        total: suggestions.length,
        filter: selectedFilter,
        filtered: filteredSuggestions.length,
        types: [...new Set(suggestions.map(s => s.type))],
        implemented: suggestions.filter(s => s.implemented).length
      });
    }
  }, [suggestions, selectedFilter, filteredSuggestions.length]);

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

      {/* Error Banner con Botón de Reintento */}
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Error al cargar sugerencias</p>
              <p className="text-xs text-red-600 mt-1">{loadError}</p>
            </div>
          </div>
          <button
            onClick={() => loadSuggestions(true)}
            disabled={isLoading}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Cargando...' : 'Forzar reintento'}</span>
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !loadError && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-center space-x-3">
          <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
          <p className="text-sm text-blue-800">Cargando sugerencias...</p>
        </div>
      )}

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
                {/* ✅ CORREGIDO: Cálculo seguro del impacto potencial sin desbordamiento */}
                {(() => {
                  // Calcular total de forma segura, evitando valores infinitos o NaN
                  let total = 0;
                  let validCount = 0;
                  
                  for (const s of suggestions) {
                    const revenue = s.impact?.revenue || 0;
                    // Validar que el valor sea finito y razonable
                    if (isFinite(revenue) && revenue >= 0 && revenue < 1e15) {
                      total += revenue;
                      validCount++;
                    }
                  }
                  
                  // Si no hay valores válidos, mostrar placeholder
                  if (validCount === 0 || total === 0) {
                    return '—';
                  }
                  
                  // Limitar a un máximo razonable para evitar outliers absurdos
                  const maxReasonable = 1e9; // 1 billón máximo
                  const cappedTotal = Math.min(total, maxReasonable);
                  
                  // Formatear usando Intl.NumberFormat para evitar notación exponencial
                  try {
                    if (cappedTotal >= 1000000) {
                      const millions = cappedTotal / 1000000;
                      return new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 1,
                        notation: 'standard'
                      }).format(millions).replace('USD', 'M');
                    } else if (cappedTotal >= 1000) {
                      const thousands = cappedTotal / 1000;
                      return new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 1,
                        notation: 'standard'
                      }).format(thousands).replace('USD', 'K');
                    } else {
                      return new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                        notation: 'standard'
                      }).format(cappedTotal);
                    }
                  } catch (e) {
                    // Fallback si Intl falla
                    if (cappedTotal >= 1000000) {
                      return `$${(cappedTotal / 1000000).toFixed(1)}M`;
                    } else if (cappedTotal >= 1000) {
                      return `$${(cappedTotal / 1000).toFixed(1)}K`;
                    }
                    return `$${Math.round(cappedTotal).toLocaleString('en-US')}`;
                  }
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
                {(() => {
                  try {
                    const totalTime = suggestions.reduce((acc, s) => {
                      const time = s.impact?.time || 0;
                      return acc + (isFinite(time) && time >= 0 ? time : 0);
                    }, 0);
                    return totalTime > 0 ? `${totalTime}h` : '0h';
                  } catch (e) {
                    console.error('Error calculando tiempo ahorrado:', e);
                    return '0h';
                  }
                })()}
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
        {filteredSuggestions.length === 0 && !isLoading && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <Lightbulb className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">No hay sugerencias {selectedFilter !== 'all' ? `de tipo "${selectedFilter}"` : ''} disponibles</p>
            <p className="text-sm text-gray-500 mt-2">
              {selectedFilter !== 'all' 
                ? 'Intenta cambiar el filtro o generar nuevas sugerencias.'
                : 'Haz clic en "Nueva sugerencia" para generar recomendaciones inteligentes.'}
            </p>
          </div>
        )}
        {filteredSuggestions.map((suggestion) => {
          try {
            return (
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
                      <p className="font-semibold text-green-600">
                        {/* ✅ CORREGIDO: Formatear impacto económico sin desbordamiento */}
                        {(() => {
                          const revenue = suggestion.impact?.revenue || 0;
                          if (!isFinite(revenue) || revenue <= 0) return '—';
                          if (revenue >= 1000000) {
                            return `+$${(revenue / 1000000).toFixed(1)}M`;
                          } else if (revenue >= 1000) {
                            return `+$${(revenue / 1000).toFixed(1)}K`;
                          }
                          return `+$${Math.round(revenue).toLocaleString('en-US')}`;
                        })()}
                      </p>
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
                      <p className="font-semibold text-blue-600">
                        {/* ✅ CORRECCIÓN CRÍTICA: Formatear confianza de forma segura */}
                        {(() => {
                          const conf = suggestion.confidence;
                          if (typeof conf !== 'number' || !isFinite(conf) || isNaN(conf)) return '—';
                          const safeConf = Math.max(0, Math.min(100, Math.round(conf)));
                          return `${safeConf}%`;
                        })()}
                      </p>
                    </div>
                  </div>
                  
                  {suggestion.metrics && (
                    <div className="bg-gray-50 p-3 rounded-lg mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Métrica objetivo:</span>
                        <span className="text-sm">
                          {/* ✅ CORRECCIÓN CRÍTICA: Formatear métricas de forma segura */}
                          <span className="text-gray-500">
                            {(() => {
                              const val = suggestion.metrics?.currentValue;
                              if (typeof val !== 'number' || !isFinite(val) || isNaN(val)) return '—';
                              const safeVal = Math.abs(val) > 1e6 
                                ? `${(val / 1e6).toFixed(1)}M` 
                                : Math.abs(val) > 1e3 
                                ? `${(val / 1e3).toFixed(1)}K`
                                : val.toLocaleString('en-US', { maximumFractionDigits: 2 });
                              return `${safeVal} ${suggestion.metrics?.unit || ''}`;
                            })()}
                          </span>
                          <ArrowRight className="h-3 w-3 inline mx-1" />
                          <span className="text-green-600 font-semibold">
                            {(() => {
                              const val = suggestion.metrics?.targetValue;
                              if (typeof val !== 'number' || !isFinite(val) || isNaN(val)) return '—';
                              const safeVal = Math.abs(val) > 1e6 
                                ? `${(val / 1e6).toFixed(1)}M` 
                                : Math.abs(val) > 1e3 
                                ? `${(val / 1e3).toFixed(1)}K`
                                : val.toLocaleString('en-US', { maximumFractionDigits: 2 });
                              return `${safeVal} ${suggestion.metrics?.unit || ''}`;
                            })()}
                          </span>
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
                            <p className="text-sm text-blue-800 mb-2">
                              {/* ✅ CORRECCIÓN CRÍTICA: Sanitizar texto de razón para prevenir valores mal formateados */}
                              {(() => {
                                let reason = suggestion.keywordReason || '';
                                // Detectar y reemplazar valores en notación científica en el texto
                                reason = reason.replace(/[\d.]+e[+-]\d+/gi, (match) => {
                                  const num = parseFloat(match);
                                  if (!isFinite(num)) return '—';
                                  // Si es un porcentaje extremo, limitarlo
                                  if (Math.abs(num) > 1000) {
                                    return '1000+';
                                  }
                                  // Formatear número de forma legible
                                  return num.toLocaleString('en-US', { 
                                    maximumFractionDigits: 2,
                                    notation: 'standard'
                                  });
                                });
                                return reason;
                              })()}
                            </p>
                          )}
                          {suggestion.keywordSupportingMetric && (
                            <div className="text-xs text-blue-700">
                              <strong>{suggestion.keywordSupportingMetric.description}</strong>
                              {' '}({(() => {
                                // ✅ CORRECCIÓN CRÍTICA: Formatear valor de métrica de forma segura
                                const val = suggestion.keywordSupportingMetric?.value;
                                if (typeof val !== 'number' || !isFinite(val) || isNaN(val)) return '—';
                                
                                // Limitar valores extremos
                                const safeVal = Math.abs(val) > 1e6 ? Math.min(1e6, val) : val;
                                
                                // Formatear según el tipo de unidad
                                const unit = suggestion.keywordSupportingMetric?.unit || '';
                                if (unit === '%') {
                                  // Para porcentajes, redondear a máximo 2 decimales y evitar notación científica
                                  const rounded = Math.round(safeVal * 100) / 100;
                                  return `${rounded}${unit}`;
                                } else if (unit === 'oportunidades' || unit === 'oportunidades estimadas') {
                                  // Para conteos, mostrar como entero
                                  return `${Math.round(safeVal)} ${unit}`;
                                } else {
                                  // Para otros valores, formatear con toLocaleString
                                  return `${safeVal.toLocaleString('en-US', { 
                                    maximumFractionDigits: 2,
                                    notation: 'standard'
                                  })} ${unit}`;
                                }
                              })()})
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
          );
          } catch (error) {
            console.error('Error renderizando sugerencia:', error, suggestion);
            // Retornar una sugerencia de error en lugar de crashear
            return (
              <div key={suggestion.id} className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-800 font-medium">Error mostrando sugerencia</p>
                <p className="text-sm text-red-600 mt-1">ID: {suggestion.id || 'desconocido'}</p>
                <p className="text-xs text-red-500 mt-1">Título: {suggestion.title || 'Sin título'}</p>
              </div>
            );
          }
        })}
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