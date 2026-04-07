import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { api } from '../services/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Info, Package, Truck, Receipt, CreditCard } from 'lucide-react';
import { formatCurrencySimple } from '../utils/currency';

/** Map search result shape to API item shape for the detail view */
function mapSearchOpportunityToItem(opp: any): any {
  const buyPrice = Number(opp.buyPrice ?? 0);
  const suggestedPrice = Number(opp.sellPrice ?? 0);
  const margin = suggestedPrice - buyPrice;
  const profitMargin = buyPrice > 0 ? margin / buyPrice : 0;
  const roiPercentage = buyPrice > 0 ? (margin / buyPrice) * 100 : 0;
  return {
    id: opp.id,
    title: opp.name ?? '',
    sourceMarketplace: opp.marketplace ?? 'ebay',
    costUsd: buyPrice,
    suggestedPriceUsd: suggestedPrice,
    profitMargin,
    roiPercentage,
    productUrl: opp.externalUrl ?? '',
    aliexpressUrl: opp.externalUrl ?? '',
    baseCurrency: 'USD',
    suggestedPriceCurrency: 'USD',
  };
}

const premiumCard = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card';

export default function OpportunityDetail() {
  const { id } = useParams();
  const location = useLocation();
  const fromSearch = location.state?.opportunityFromSearch;
  const initialItem =
    fromSearch && id && String(fromSearch.id) === String(id)
      ? mapSearchOpportunityToItem(fromSearch)
      : null;
  const [item, setItem] = useState<any>(initialItem);
  const [snapshots, setSnapshots] = useState<any[]>(initialItem ? [] : []);
  const [loading, setLoading] = useState(!initialItem);

  useEffect(() => {
    if (!id) return;
    const stateFromSearch = location.state?.opportunityFromSearch;
    if (stateFromSearch && String(stateFromSearch.id) === String(id)) {
      setItem(mapSearchOpportunityToItem(stateFromSearch));
      setSnapshots([]);
      setLoading(false);
      return;
    }
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
  }, [id, location.state]);

  if (loading) return <LoadingSpinner text="Cargando oportunidad..." />;
  if (!item) return (
    <div className="p-6 text-center">
      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <Package className="w-6 h-6 text-slate-400" />
      </div>
      <p className="text-sm text-slate-500">Oportunidad no encontrada</p>
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Oportunidad #{item.id}</h1>
        <p className="text-xs text-slate-500 mt-0.5">Detalle de la oportunidad y análisis de competencia</p>
      </div>

      {/* Main Detail Card */}
      <div className={premiumCard + ' p-5'}>
        <div className="font-medium text-base text-slate-900 dark:text-slate-100">{item.title}</div>
        <div className="text-xs text-slate-500 mt-0.5">Fuente: {item.sourceMarketplace}</div>
        
        {/* Cost Breakdown */}
        {(item.shippingCost || item.importTax || item.totalCost) && (
          <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <div className="font-semibold text-xs mb-2.5 flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <Info className="w-4 h-4 text-slate-400" />
              Desglose de costos
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 text-xs">Costo del producto:</span>
                <span className="font-medium text-sm tabular-nums text-slate-900 dark:text-slate-100">{formatCurrencySimple(item.costUsd, item.baseCurrency || 'USD')}</span>
              </div>
              {item.shippingCost && item.shippingCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500 text-xs flex items-center gap-1">
                    <Truck className="w-3 h-3" />
                    Envío internacional:
                  </span>
                  <span className="font-medium text-sm tabular-nums text-slate-900 dark:text-slate-100">{formatCurrencySimple(item.shippingCost, item.baseCurrency || 'USD')}</span>
                </div>
              )}
              {item.importTax && item.importTax > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500 text-xs flex items-center gap-1">
                    <Receipt className="w-3 h-3" />
                    Impuestos de importación:
                  </span>
                  <span className="font-medium text-sm tabular-nums text-slate-900 dark:text-slate-100">{formatCurrencySimple(item.importTax, item.baseCurrency || 'USD')}</span>
                </div>
              )}
              {item.totalCost && item.totalCost > item.costUsd && (
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-xs text-slate-700 dark:text-slate-300">Costo total:</span>
                  <span className="font-bold text-base tabular-nums text-slate-900 dark:text-slate-100">{formatCurrencySimple(item.totalCost, item.baseCurrency || 'USD')}</span>
                </div>
              )}
              {item.targetCountry && (
                <div className="text-[11px] text-slate-400 mt-2">
                  País destino: {item.targetCountry}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Stat 
            label="Costo base" 
            value={formatCurrencySimple(item.costUsd, item.baseCurrency || 'USD')}
            highlight={false}
          />
          {item.totalCost && item.totalCost > item.costUsd ? (
            <Stat 
              label="Costo total" 
              value={formatCurrencySimple(item.totalCost, item.baseCurrency || 'USD')}
              highlight={true}
              tooltip="Incluye producto + envío + impuestos"
            />
          ) : (
            <Stat 
              label="Costo base" 
              value={formatCurrencySimple(item.costUsd, item.baseCurrency || 'USD')}
              highlight={false}
            />
          )}
          <Stat 
            label="Precio sugerido" 
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

        {/* Estimated Net Profit */}
        {item.totalCost && item.suggestedPriceUsd && (
          <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <div className="font-semibold text-xs mb-1 text-blue-900 dark:text-blue-200">Ganancia neta estimada</div>
            <div className="text-lg font-bold tabular-nums text-blue-700 dark:text-blue-300">
              {formatCurrencySimple(item.suggestedPriceUsd - item.totalCost, item.baseCurrency || 'USD')}
            </div>
            <div className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
              Precio sugerido - Costo total = Ganancia neta
            </div>
          </div>
        )}

        {/* CTA Button */}
        {(item.productUrl || item.aliexpressUrl) && (
          <Link
            to={`/checkout?productUrl=${encodeURIComponent(item.productUrl || item.aliexpressUrl || '')}&title=${encodeURIComponent(item.title || '')}&price=${item.suggestedPriceUsd || item.costUsd || 10}`}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium shadow-sm transition"
          >
            <CreditCard className="w-4 h-4" />
            Comprar con PayPal
          </Link>
        )}
      </div>

      {/* Competition Snapshots */}
      <div className={premiumCard + ' p-5'}>
        <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-3">Instantáneas de competencia</div>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Marketplace</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Región</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Listings</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Promedio</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Mediana</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Competitivo</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {snapshots.map((s, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100">{s.marketplace}</td>
                  <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-400">{s.region}</td>
                  <td className="px-3 py-2.5 text-sm text-right tabular-nums text-slate-900 dark:text-slate-100">{s.listingsFound}</td>
                  <td className="px-3 py-2.5 text-sm text-right tabular-nums text-slate-900 dark:text-slate-100">{s.averagePrice.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-sm text-right tabular-nums text-slate-900 dark:text-slate-100">{s.medianPrice.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-sm text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">{s.competitivePrice.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{new Date(s.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {snapshots.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center" colSpan={7}>
                    <p className="text-xs text-slate-400">Sin instantáneas guardadas</p>
                  </td>
                </tr>
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
    green: 'text-emerald-600 dark:text-emerald-400',
    yellow: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    default: 'text-slate-900 dark:text-slate-100'
  };

  return (
    <div className={`p-3 rounded-lg border ${highlight ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800'}`}>
      <div className="text-[11px] text-slate-500 flex items-center gap-1">
        {label}
        {tooltip && (
          <span title={tooltip}>
            <Info className="w-3 h-3 text-slate-400 cursor-help" />
          </span>
        )}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${colorClasses[color]}`}>{value}</div>
    </div>
  );
}
