import React, { useState } from 'react';
import { Search, TrendingUp, DollarSign, AlertCircle, ExternalLink, Clock, Target } from 'lucide-react';

interface SearchOpportunity {
  id: string;
  name: string;
  buyPrice: number;
  sellPrice: number;
  margin: number;
  confidence: number;
  aiAnalysis: string;
  marketplace: string;
  imageUrl: string;
  externalUrl: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedAction: 'BUY' | 'MONITOR' | 'RESEARCH';
  category: string;
  trends: {
    demand: number;
    competition: number;
    seasonality: string;
  };
}

interface SearchResults {
  searchQuery: string;
  mode: string;
  isRealData: boolean;
  opportunitiesFound: number;
  totalPotentialMargin: number;
  averageMargin: number;
  opportunities: SearchOpportunity[];
  searchMeta: {
    timestamp: string;
    processingTime: string;
    marketplacesScanned: number;
    totalResultsAvailable: number;
    scrapingMethod: string;
  };
}

const UniversalSearchDashboard: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useRealScraping, setUseRealScraping] = useState(false);

  const suggestedSearches = [
    'iPhone 15 Pro',
    'MacBook Air M3',
    'Nike Air Max',
    'PlayStation 5',
    'Samsung Galaxy',
    'Apple Watch',
    'AirPods Pro',
    'Gaming Chair',
    'Smart TV 4K',
    'Wireless Earbuds'
  ];

  const handleSearch = async (query?: string) => {
    const searchTerm = query || searchQuery;
    if (!searchTerm.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const mode = useRealScraping ? 'real' : 'demo';
      const response = await fetch(`/api/search-opportunities?query=${encodeURIComponent(searchTerm)}&limit=4&mode=${mode}`);
      
      if (!response.ok) {
        throw new Error('Error en la búsqueda');
      }

      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      setError('Error al buscar oportunidades. Intenta nuevamente.');
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-600 bg-green-100';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-100';
      case 'HIGH': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY': return 'text-green-700 bg-green-100 border-green-300';
      case 'MONITOR': return 'text-blue-700 bg-blue-100 border-blue-300';
      case 'RESEARCH': return 'text-orange-700 bg-orange-100 border-orange-300';
      default: return 'text-gray-700 bg-gray-100 border-gray-300';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          🔍 Búsqueda Universal de Oportunidades
        </h1>
        <p className="text-gray-600">
          Encuentra oportunidades de negocio REALES para cualquier producto que busques
        </p>
      </div>

        {/* Search Bar */}
      <div className="mb-8">
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Busca cualquier producto: iPhone, Nike, PlayStation, etc..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useRealScraping}
                onChange={(e) => setUseRealScraping(e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-700">Scraping Real</span>
            </label>
          </div>
          <button
            onClick={() => handleSearch()}
            disabled={isLoading || !searchQuery.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (useRealScraping ? 'Scraping...' : 'Buscando...') : 'Buscar'}
          </button>
        </div>        {/* Suggested Searches */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 mr-2">Búsquedas sugeridas:</span>
          {suggestedSearches.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => {
                setSearchQuery(suggestion);
                handleSearch(suggestion);
              }}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">
            {useRealScraping 
              ? '🌐 Haciendo scraping REAL de AliExpress, eBay y Amazon...' 
              : 'Analizando mercados y encontrando oportunidades...'
            }
          </p>
          {useRealScraping && (
            <div className="mt-2 text-sm text-orange-600">
              ⚠️ El scraping real puede tomar 30-60 segundos
            </div>
          )}
        </div>
      )}

      {/* Search Results */}
      {searchResults && !isLoading && (
        <div className="space-y-6">
          {/* Results Summary */}
          <div className={`p-6 rounded-lg border ${
            searchResults.isRealData 
              ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' 
              : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
          }`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  Resultados de búsqueda: "{searchResults.searchQuery}"
                </h3>
                {searchResults.isRealData && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                    🌐 DATOS REALES
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500">
                Método: {searchResults.searchMeta.scrapingMethod}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className={`text-2xl font-bold ${searchResults.isRealData ? 'text-green-600' : 'text-blue-600'}`}>
                  {searchResults.opportunitiesFound}
                </div>
                <div className="text-sm text-gray-600">Oportunidades {searchResults.isRealData ? 'Reales' : 'Demo'}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{searchResults.averageMargin}%</div>
                <div className="text-sm text-gray-600">Margen Promedio</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{searchResults.searchMeta.marketplacesScanned}</div>
                <div className="text-sm text-gray-600">Marketplaces</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{searchResults.searchMeta.processingTime}</div>
                <div className="text-sm text-gray-600">Tiempo</div>
              </div>
            </div>
          </div>

          {/* Opportunities Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {searchResults.opportunities.map((opportunity) => (
              <div key={opportunity.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <img 
                        src={opportunity.imageUrl} 
                        alt={opportunity.name}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <div>
                        <h3 className="font-semibold text-gray-900 text-lg">{opportunity.name}</h3>
                        <p className="text-sm text-gray-500">{opportunity.marketplace}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(opportunity.riskLevel)}`}>
                        {opportunity.riskLevel} RISK
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getActionColor(opportunity.recommendedAction)}`}>
                        {opportunity.recommendedAction}
                      </span>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <div className="text-sm text-gray-500">Precio Compra</div>
                      <div className="text-lg font-semibold text-red-600">${opportunity.buyPrice}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-gray-500">Precio Venta</div>
                      <div className="text-lg font-semibold text-green-600">${opportunity.sellPrice}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-gray-500">Margen</div>
                      <div className="text-lg font-semibold text-blue-600">{opportunity.margin}%</div>
                    </div>
                  </div>

                  {/* AI Analysis */}
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Target className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-blue-800">{opportunity.aiAnalysis}</p>
                    </div>
                  </div>

                  {/* Trends */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium">Demanda</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full" 
                          style={{ width: `${opportunity.trends.demand}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-gray-500">{opportunity.trends.demand}%</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="w-4 h-4 text-orange-600" />
                        <span className="text-sm font-medium">Competencia</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-orange-600 h-2 rounded-full" 
                          style={{ width: `${opportunity.trends.competition}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-gray-500">{opportunity.trends.competition}%</span>
                    </div>
                  </div>

                  {/* Seasonality */}
                  <div className="mb-4 p-2 bg-yellow-50 rounded text-sm">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4 text-yellow-600" />
                      <span className="font-medium text-yellow-800">Estacionalidad:</span>
                    </div>
                    <p className="text-yellow-700 mt-1">{opportunity.trends.seasonality}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                      Ver Detalles
                    </button>
                    <a
                      href={opportunity.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-1"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Ir al Marketplace
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!searchResults && !isLoading && (
        <div className="text-center py-12">
          <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-900 mb-2">
            Busca cualquier producto
          </h3>
          <p className="text-gray-600 mb-6">
            Ingresa el nombre de cualquier producto para encontrar oportunidades de negocio reales
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 max-w-4xl mx-auto">
            {suggestedSearches.slice(0, 10).map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setSearchQuery(suggestion);
                  handleSearch(suggestion);
                }}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UniversalSearchDashboard;