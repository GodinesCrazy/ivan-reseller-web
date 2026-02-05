import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Info, Package, Truck, Receipt, CreditCard } from 'lucide-react';
import { formatCurrencySimple } from '../utils/currency';

export default function OpportunityDetail() {
  const { id } = useParams();
  const [item, setItem] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/api/opportunities/${id}`);
        setItem(data.item);
        setSnapshots(data.snapshots || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <LoadingSpinner text="Cargando oportunidad..." />;
  if (!item) return <div className="p-6 text-center text-gray-500">Oportunidad no encontrada</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Opportunity #{item.id}</h1>
      <div className="bg-white border rounded p-4">
        <div className="font-medium text-lg">{item.title}</div>
        <div className="text-sm text-gray-600">Source: {item.sourceMarketplace}</div>
        
        {/* ✅ MEJORADO: Desglose de costos */}
        {(item.shippingCost || item.importTax || item.totalCost) && (
          <div className="mt-4 p-3 bg-gray-50 rounded border">
            <div className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-500" />
              Desglose de Costos
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Costo del producto:</span>
                <span className="font-medium">{formatCurrencySimple(item.costUsd, item.baseCurrency || 'USD')}</span>
              </div>
              {item.shippingCost && item.shippingCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 flex items-center gap-1">
                    <Truck className="w-3 h-3" />
                    Envío internacional:
                  </span>
                  <span className="font-medium">{formatCurrencySimple(item.shippingCost, item.baseCurrency || 'USD')}</span>
                </div>
              )}
              {item.importTax && item.importTax > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 flex items-center gap-1">
                    <Receipt className="w-3 h-3" />
                    Impuestos de importación:
                  </span>
                  <span className="font-medium">{formatCurrencySimple(item.importTax, item.baseCurrency || 'USD')}</span>
                </div>
              )}
              {item.totalCost && item.totalCost > item.costUsd && (
                <div className="flex justify-between pt-2 border-t border-gray-300">
                  <span className="font-semibold">Costo total:</span>
                  <span className="font-bold text-lg">{formatCurrencySimple(item.totalCost, item.baseCurrency || 'USD')}</span>
                </div>
              )}
              {item.targetCountry && (
                <div className="text-xs text-gray-500 mt-2">
                  País destino: {item.targetCountry}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <Stat 
            label="Costo Base" 
            value={formatCurrencySimple(item.costUsd, item.baseCurrency || 'USD')}
            highlight={false}
          />
          {item.totalCost && item.totalCost > item.costUsd ? (
            <Stat 
              label="Costo Total" 
              value={formatCurrencySimple(item.totalCost, item.baseCurrency || 'USD')}
              highlight={true}
              tooltip="Incluye producto + envío + impuestos"
            />
          ) : (
            <Stat 
              label="Costo Base" 
              value={formatCurrencySimple(item.costUsd, item.baseCurrency || 'USD')}
              highlight={false}
            />
          )}
          <Stat 
            label="Precio Sugerido" 
            value={formatCurrencySimple(item.suggestedPriceUsd, item.suggestedPriceCurrency || item.baseCurrency || 'USD')}
            highlight={false}
          />
          <Stat 
            label="Margen %" 
            value={`${Math.round(item.profitMargin*100)}%`}
            highlight={item.profitMargin >= 0.3}
            color={item.profitMargin >= 0.3 ? 'green' : item.profitMargin >= 0.1 ? 'yellow' : 'red'}
            tooltip={item.totalCost ? "Calculado con costo total (producto + envío + impuestos)" : "Calculado con costo base"}
          />
          <Stat 
            label="ROI %" 
            value={`${Math.round(item.roiPercentage)}%`}
            highlight={item.roiPercentage >= 50}
            color={item.roiPercentage >= 50 ? 'green' : item.roiPercentage >= 30 ? 'yellow' : 'red'}
            tooltip={item.totalCost ? "Calculado con costo total (producto + envío + impuestos)" : "Calculado con costo base"}
          />
        </div>

        {/* ✅ MEJORADO: Cálculo de ganancia real */}
        {item.totalCost && item.suggestedPriceUsd && (
          <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
            <div className="font-semibold text-sm mb-2 text-blue-900">Ganancia Estimada</div>
            <div className="text-lg font-bold text-blue-700">
              {formatCurrencySimple(item.suggestedPriceUsd - item.totalCost, item.baseCurrency || 'USD')}
            </div>
            <div className="text-xs text-blue-600 mt-1">
              Precio sugerido - Costo total = Ganancia neta
            </div>
          </div>
        )}

        {(item.productUrl || item.aliexpressUrl) && (
          <Link
            to={`/checkout?productUrl=${encodeURIComponent(item.productUrl || item.aliexpressUrl || '')}&title=${encodeURIComponent(item.title || '')}&price=${item.suggestedPriceUsd || item.costUsd || 10}`}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <CreditCard className="w-4 h-4" />
            Buy with PayPal
          </Link>
        )}
      </div>
      <div className="bg-white border rounded p-4">
        <div className="font-medium mb-2">Competition Snapshots</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Marketplace</th>
                <th className="text-left p-2">Region</th>
                <th className="text-right p-2">Listings</th>
                <th className="text-right p-2">Avg</th>
                <th className="text-right p-2">Median</th>
                <th className="text-right p-2">Competitive</th>
                <th className="text-left p-2">When</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2">{s.marketplace}</td>
                  <td className="p-2">{s.region}</td>
                  <td className="p-2 text-right">{s.listingsFound}</td>
                  <td className="p-2 text-right">{s.averagePrice.toFixed(2)}</td>
                  <td className="p-2 text-right">{s.medianPrice.toFixed(2)}</td>
                  <td className="p-2 text-right">{s.competitivePrice.toFixed(2)}</td>
                  <td className="p-2">{new Date(s.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {snapshots.length === 0 && (
                <tr><td className="p-4 text-center text-gray-500" colSpan={7}>No snapshots saved</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ 
  label, 
  value, 
  highlight = false, 
  color = 'default',
  tooltip 
}: { 
  label: string; 
  value: string;
  highlight?: boolean;
  color?: 'green' | 'yellow' | 'red' | 'default';
  tooltip?: string;
}) {
  const colorClasses = {
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
    default: 'text-gray-900'
  };

  return (
    <div className={`p-3 border rounded ${highlight ? 'bg-blue-50 border-blue-200' : ''}`}>
      <div className="text-xs text-gray-500 flex items-center gap-1">
        {label}
        {tooltip && (
          <Info className="w-3 h-3 text-gray-400 cursor-help" title={tooltip} />
        )}
      </div>
      <div className={`text-lg font-semibold ${colorClasses[color]}`}>{value}</div>
    </div>
  );
}

