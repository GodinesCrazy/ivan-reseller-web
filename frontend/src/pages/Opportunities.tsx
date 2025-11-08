import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

type Marketplace = 'ebay' | 'amazon' | 'mercadolibre';

interface OpportunityItem {
  productId?: string;
  title: string;
  sourceMarketplace: 'aliexpress';
  aliexpressUrl: string;
  image?: string;
  costUsd: number;
  suggestedPriceUsd: number;
  profitMargin: number; // 0-1
  roiPercentage: number; // 0-100
  competitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  marketDemand: string;
  confidenceScore: number;
  targetMarketplaces: string[];
  feesConsidered?: Record<string, number>;
  generatedAt: string;
}

// Componente de skeleton para tabla
function TableSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          {Array.from({ length: columns }).map((_, j) => (
            <div key={j} className="h-12 bg-gray-200 rounded animate-pulse flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Opportunities() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('organizador cocina');
  const [region, setRegion] = useState('us');
  const [maxItems, setMaxItems] = useState(5);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>(['ebay', 'amazon', 'mercadolibre']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OpportunityItem[]>([]);
  const [publishing, setPublishing] = useState<Record<number, boolean>>({});

  const marketplacesParam = useMemo(() => marketplaces.join(','), [marketplaces]);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/opportunities', {
        params: { query, maxItems, marketplaces: marketplacesParam, region }
      });
      setItems(data?.items || []);
    } catch (e: any) {
      if (e?.response?.status === 428) {
        const data = e.response?.data || {};
        const manualPath = data.manualUrl || (data.token ? `/manual-login/${data.token}` : null);
        const targetUrl = manualPath
          ? (manualPath.startsWith('http') ? manualPath : `${window.location.origin}${manualPath}`)
          : data.loginUrl;
        setError('Se requiere iniciar sesión en AliExpress. Abre la ventana y guarda la sesión.');
        toast.warning('Necesitamos que inicies sesión manualmente en AliExpress. Se abrirá una ventana con instrucciones.');
        if (targetUrl) {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
      } else {
        setError(e?.response?.data?.error || e.message || 'Error fetching opportunities');
        toast.error(e?.response?.data?.error || e.message || 'Error fetching opportunities');
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMarketplace(mp: Marketplace) {
    setMarketplaces(prev => prev.includes(mp) ? prev.filter(m => m !== mp) : [...prev, mp]);
  }

  async function createAndPublishProduct(item: OpportunityItem, targetMarketplace: Marketplace) {
    const itemIndex = items.indexOf(item);
    setPublishing(prev => ({ ...prev, [itemIndex]: true }));

    try {
      // 1. Crear producto desde la oportunidad
      const productResponse = await api.post('/api/products', {
        title: item.title,
        aliexpressUrl: item.aliexpressUrl,
        aliexpressPrice: item.costUsd,
        suggestedPrice: item.suggestedPriceUsd,
        imageUrl: item.image,
        currency: 'USD',
      });

      const productId = productResponse.data?.id || productResponse.data?.product?.id;

      if (!productId) {
        throw new Error('No se pudo obtener el ID del producto creado');
      }

      // 2. Publicar a marketplace
      const publishResponse = await api.post('/api/marketplace/publish', {
        productId: Number(productId),
        marketplace: targetMarketplace,
      });

      if (publishResponse.data?.success) {
        toast.success(`Producto creado y publicado en ${targetMarketplace} exitosamente`);
        // Opcional: redirigir a productos
        setTimeout(() => {
          navigate('/products');
        }, 1500);
      } else {
        throw new Error(publishResponse.data?.error || 'Error al publicar');
      }
    } catch (error: any) {
      console.error('Error creating/publishing product:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Error al crear o publicar producto';
      toast.error(errorMessage);
    } finally {
      setPublishing(prev => ({ ...prev, [itemIndex]: false }));
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Real Opportunities</h1>
      <div className="bg-white border rounded p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search terms (e.g. organizador cocina)"
          className="border rounded px-3 py-2"
        />
        <select value={region} onChange={e => setRegion(e.target.value)} className="border rounded px-3 py-2">
          <option value="us">US</option>
          <option value="uk">UK</option>
          <option value="mx">MX</option>
          <option value="de">DE</option>
          <option value="es">ES</option>
          <option value="br">BR</option>
        </select>
        <input
          type="number"
          min={1}
          max={10}
          value={maxItems}
          onChange={e => setMaxItems(Math.max(1, Math.min(10, Number(e.target.value))))}
          className="border rounded px-3 py-2"
        />
        <button onClick={search} disabled={loading} className="bg-primary-600 text-white rounded px-4 py-2">
          {loading ? 'Searching…' : 'Search'}
        </button>
        <div className="md:col-span-4 flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('ebay')} onChange={() => toggleMarketplace('ebay')} /> eBay</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('amazon')} onChange={() => toggleMarketplace('amazon')} /> Amazon</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('mercadolibre')} onChange={() => toggleMarketplace('mercadolibre')} /> MercadoLibre</label>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="overflow-auto bg-white border rounded">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} columns={9} />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-center p-3">Imagen</th>
                <th className="text-left p-3">Título</th>
                <th className="text-right p-3">Costo (USD)</th>
                <th className="text-right p-3">Precio Sugerido (USD)</th>
                <th className="text-right p-3">Margen %</th>
                <th className="text-right p-3">ROI %</th>
                <th className="text-center p-3">Competencia</th>
                <th className="text-center p-3">Marketplaces</th>
                <th className="text-center p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
              <tr key={idx} className="border-t hover:bg-gray-50">
                <td className="p-3 text-center">
                  {it.image ? (
                    <img 
                      src={it.image} 
                      alt={it.title} 
                      className="w-16 h-16 object-cover rounded border border-gray-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64x64?text=No+Image';
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-400">
                      Sin imagen
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <div className="font-medium line-clamp-2 max-w-xs">{it.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Confianza: {Math.round((it.confidenceScore || 0) * 100)}% | 
                    ID: {it.productId || 'N/A'}
                  </div>
                  {it.feesConsidered && Object.keys(it.feesConsidered).length > 0 && (
                    <div className="text-xs text-blue-600 mt-1 cursor-help" title={Object.entries(it.feesConsidered).map(([k, v]) => `${k}: $${v.toFixed(2)}`).join(', ')}>
                      Fees: ${Object.values(it.feesConsidered).reduce((a, b) => a + b, 0).toFixed(2)}
                    </div>
                  )}
                </td>
                <td className="p-3 text-right font-semibold">${it.costUsd.toFixed(2)}</td>
                <td className="p-3 text-right font-semibold text-green-600">${it.suggestedPriceUsd.toFixed(2)}</td>
                <td className="p-3 text-right">
                  <span className={`font-semibold ${it.profitMargin >= 0.3 ? 'text-green-600' : it.profitMargin >= 0.2 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {Math.round(it.profitMargin * 100)}%
                  </span>
                </td>
                <td className="p-3 text-right">
                  <span className={`font-semibold ${it.roiPercentage >= 50 ? 'text-green-600' : it.roiPercentage >= 30 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {Math.round(it.roiPercentage)}%
                  </span>
                </td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    it.competitionLevel === 'low' ? 'bg-green-100 text-green-800' :
                    it.competitionLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    it.competitionLevel === 'high' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {it.competitionLevel === 'unknown' ? 'N/A' : it.competitionLevel}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <div className="flex flex-wrap gap-1 justify-center">
                    {it.targetMarketplaces?.map((mp, i) => (
                      <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {mp}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-center">
                  <div className="flex flex-col gap-2 items-center">
                    <a 
                      href={it.aliexpressUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-xs font-medium"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Ver
                    </a>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {it.targetMarketplaces?.map((mp) => (
                        <button
                          key={mp}
                          onClick={() => createAndPublishProduct(it, mp as Marketplace)}
                          disabled={publishing[idx]}
                          className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium transition-colors"
                          title={`Crear y publicar en ${mp}`}
                        >
                          {publishing[idx] ? '...' : mp === 'ebay' ? 'eBay' : mp === 'mercadolibre' ? 'ML' : 'AMZ'}
                        </button>
                      ))}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
              {items.length === 0 && (
                <tr><td className="p-6 text-center text-gray-500" colSpan={9}>No se encontraron resultados</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

