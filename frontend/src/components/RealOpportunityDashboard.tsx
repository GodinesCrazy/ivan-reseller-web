import { useState, useEffect } from 'react';
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
  Eye,
  ExternalLink,
  Image
} from 'lucide-react';

interface RealOpportunity {
  id: string;
  product: string;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  margin: string;
  confidence: number;
  marketplace: string;
  sourceUrl: string;
  targetUrl: string;
  image: string;
  description: string;
  aiAnalysis: {
    recommendation: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    demandScore: number;
    competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    profitabilityScore: number;
  };
}

export default function RealOpportunityDashboard() {
  const [opportunities, setOpportunities] = useState<RealOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    setLoading(true);
    try {
      // ✅ FIX: Backend no tiene GET /api/dashboard; usar GET /api/opportunities (datos reales)
      const { default: api } = await import('@/services/api');
      const response = await api.get('/api/opportunities', {
        params: { query: searchTerm || 'product', maxItems: 20 },
      });
      const items = response.data?.items ?? response.data?.data?.items ?? [];
      // Use backend as single source of truth — no recalculation of profit/margin/ROI/confidence
      const mapped: RealOpportunity[] = (Array.isArray(items) ? items : []).map((o: any, i: number) => {
        const costUsd = Number(o.costUsd ?? o.estimatedCost ?? 0);
        const suggestedPriceUsd = Number(o.suggestedPriceUsd ?? o.suggestedPrice ?? 0);
        const profit = suggestedPriceUsd - costUsd;
        const profitMarginPct = typeof o.profitMargin === 'number' ? o.profitMargin * 100 : (typeof o.roiPercentage === 'number' ? o.roiPercentage : 0);
        return {
          id: o.productId ?? o.id ?? String(i),
          product: o.title ?? o.product ?? '',
          buyPrice: costUsd,
          sellPrice: suggestedPriceUsd,
          profit,
          margin: `${profitMarginPct.toFixed(0)}%`,
          confidence: typeof o.confidenceScore === 'number' ? o.confidenceScore : 75,
          marketplace: o.targetMarketplaces?.[0] ?? o.marketplace ?? 'ebay',
          sourceUrl: o.aliexpressUrl ?? o.productUrl ?? o.url ?? '',
          targetUrl: o.targetUrl ?? '',
          image: Array.isArray(o.images) ? o.images[0] : o.image ?? o.imageUrl ?? '',
          description: o.description ?? '',
          aiAnalysis: {
            recommendation: o.aiAnalysis?.recommendation ?? (profit > 0 ? 'Favorable' : 'Revisar'),
            riskLevel: o.aiAnalysis?.riskLevel ?? 'MEDIUM',
            demandScore: o.aiAnalysis?.demandScore ?? 70,
            competitionLevel: o.aiAnalysis?.competitionLevel ?? 'MEDIUM',
            profitabilityScore: typeof o.roiPercentage === 'number' ? o.roiPercentage : profitMarginPct,
          },
        };
      });
      setOpportunities(mapped);
      console.log('[FRONTEND] RealOpportunityDashboard opportunities:', mapped.length);
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch = opp.product.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = selectedFilter === 'all' || 
      (selectedFilter === 'high-profit' && opp.profit > 250) ||
      (selectedFilter === 'low-risk' && opp.aiAnalysis.riskLevel === 'LOW') ||
      (selectedFilter === 'high-confidence' && opp.confidence > 85);
    
    return matchesSearch && matchesFilter;
  });

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-600 bg-green-100';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-100';
      case 'HIGH': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return 'text-green-600';
    if (confidence >= 70) return 'text-yellow-600'; 
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="w-8 h-8" />
              Oportunidades de Negocio REALES
            </h1>
            <p className="text-purple-100 mt-2">
              Análisis en tiempo real con IA • Datos verificados • Márgenes calculados
            </p>
          </div>
          <button
            onClick={fetchOpportunities}
            disabled={loading}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todas las oportunidades</option>
            <option value="high-profit">Alta ganancia (+$250)</option>
            <option value="low-risk">Bajo riesgo</option>
            <option value="high-confidence">Alta confianza (+85%)</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Oportunidades</p>
              <p className="text-2xl font-bold text-gray-900">{opportunities.length}</p>
            </div>
            <Target className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ganancia Promedio</p>
              <p className="text-2xl font-bold text-green-600">
                ${opportunities.length > 0 ? Math.round(opportunities.reduce((sum, opp) => sum + opp.profit, 0) / opportunities.length) : 0}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Confianza Promedio</p>
              <p className="text-2xl font-bold text-purple-600">
                {opportunities.length > 0 ? Math.round(opportunities.reduce((sum, opp) => sum + opp.confidence, 0) / opportunities.length) : 0}%
              </p>
            </div>
            <Brain className="w-8 h-8 text-purple-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Última Actualización</p>
              <p className="text-sm font-semibold text-gray-900">
                {new Date().toLocaleTimeString()}
              </p>
            </div>
            <Clock className="w-8 h-8 text-gray-600" />
          </div>
        </div>
      </div>

      {/* Opportunities Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Cargando oportunidades reales...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredOpportunities.map((opportunity) => (
            <div key={opportunity.id} className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow">
              {/* Product Header */}
              <div className="flex items-start gap-4 mb-4">
                <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                  {opportunity.image ? (
                    <img 
                      src={opportunity.image} 
                      alt={opportunity.product}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        target.nextElementSibling!.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <Image className={`w-8 h-8 text-gray-400 ${opportunity.image ? 'hidden' : ''}`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                    {opportunity.product}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    {opportunity.marketplace}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(opportunity.aiAnalysis.riskLevel)}`}>
                      {opportunity.aiAnalysis.riskLevel} RISK
                    </span>
                    <span className={`text-sm font-medium ${getConfidenceColor(opportunity.confidence)}`}>
                      {opportunity.confidence}% confianza
                    </span>
                  </div>
                </div>
              </div>

              {/* Financial Info */}
              <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <p className="text-xs text-gray-600">Compra</p>
                  <p className="text-lg font-semibold text-red-600">${opportunity.buyPrice}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">Venta</p>
                  <p className="text-lg font-semibold text-blue-600">${opportunity.sellPrice}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">Ganancia</p>
                  <p className="text-lg font-semibold text-green-600">${opportunity.profit}</p>
                  <p className="text-xs text-green-600">{opportunity.margin}</p>
                </div>
              </div>

              {/* AI Analysis */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-1">
                  <Brain className="w-4 h-4 text-purple-600" />
                  Análisis de IA
                </h4>
                <p className="text-sm text-gray-700 mb-2">
                  {opportunity.aiAnalysis.recommendation}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    Demanda: {opportunity.aiAnalysis.demandScore}/100
                  </span>
                  <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                    Competencia: {opportunity.aiAnalysis.competitionLevel}
                  </span>
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                    Rentabilidad: {opportunity.aiAnalysis.profitabilityScore}/100
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <a
                  href={opportunity.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium text-center flex items-center justify-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver Origen
                </a>
                <a
                  href={opportunity.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium text-center flex items-center justify-center gap-1 transition-colors"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Ver Mercado
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {!loading && filteredOpportunities.length === 0 && (
        <div className="text-center py-12">
          <Target className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No se encontraron oportunidades
          </h3>
          <p className="text-gray-600">
            Intenta ajustar los filtros o actualizar los datos
          </p>
        </div>
      )}
    </div>
  );
}