/**
 * InventorySummaryCard - Resumen unificado de productos, listings por marketplace y órdenes por estado
 * Muestra: total productos, publicados por marketplace (eBay, ML, Amazon), órdenes (por comprar, comprando, comprado, etc.), compras pendientes
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  Store,
  ShoppingCart,
  Truck,
  ChevronRight,
  LayoutGrid,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/services/api';
import MetricLabelWithTooltip from '@/components/MetricLabelWithTooltip';
import { metricTooltips } from '@/config/metricTooltips';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { type InventorySummary, normalizeInventorySummary } from '@/types/dashboard';

const ORDER_LABELS: Record<string, string> = {
  CREATED: 'Creadas',
  PAID: 'Por comprar',
  PURCHASING: 'Comprando',
  PURCHASED: 'Comprado',
  FAILED: 'Fallidas',
};

export interface InventorySummaryCardProps {
  /** Si se pasa, usa estos datos (en vivo desde Dashboard). Si no, hace fetch propio. */
  summary?: InventorySummary | null;
}

export default function InventorySummaryCard({ summary: summaryProp }: InventorySummaryCardProps = {}) {
  const navigate = useNavigate();
  const { environment } = useEnvironment();
  const [internalSummary, setInternalSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(!summaryProp);

  useEffect(() => {
    if (summaryProp != null) {
      setLoading(false);
      return;
    }
    let mounted = true;
    api
      .get<InventorySummary>('/api/dashboard/inventory-summary', { params: { environment } })
      .then((res) => {
        if (mounted && res.data) setInternalSummary(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [summaryProp, environment]);

  const rawSummary = summaryProp ?? internalSummary;
  const summary = normalizeInventorySummary(rawSummary);

  if (loading || !summary) return null;

  const totalListings =
    typeof summary.listingsTotal === 'number'
      ? summary.listingsTotal
      : summary.listingsByMarketplace.ebay +
        summary.listingsByMarketplace.mercadolibre +
        summary.listingsByMarketplace.amazon;
  const totalOrders =
    summary.ordersByStatus.CREATED +
    summary.ordersByStatus.PAID +
    summary.ordersByStatus.PURCHASING +
    summary.ordersByStatus.PURCHASED +
    summary.ordersByStatus.FAILED;

  const hasData =
    summary.products.total > 0 ||
    totalListings > 0 ||
    totalOrders > 0 ||
    summary.pendingPurchasesCount > 0;

  if (!hasData) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <LayoutGrid className="w-5 h-5" />
          Resumen de inventario
        </CardTitle>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Recuentos del inventario API — para verdad canónica (blockers, proof ladder) usa Control Center.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-sm">
          <div
            className="p-4 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900/80 cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all"
            onClick={() => navigate('/products')}
          >
            <div className="flex items-center gap-2 text-gray-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wide">
              <Package className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              <MetricLabelWithTooltip label="Productos" tooltipBody={metricTooltips.pendientes.body} />
            </div>
            <div className="mt-2 text-metric-sm tabular-nums text-gray-900 dark:text-white">{summary.products.total.toLocaleString()}</div>
            <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">
              {summary.products.pending} pendientes · {totalListings} anuncios
            </div>
          </div>

          <div
            className="p-4 rounded-xl border-2 border-primary-200 dark:border-primary-800/60 bg-primary-50/50 dark:bg-primary-900/15 cursor-pointer hover:border-primary-400 dark:hover:border-primary-600 transition-all shadow-sm"
            onClick={() => navigate('/publisher')}
          >
            <div className="flex items-center gap-2 text-gray-700 dark:text-slate-200 text-xs font-semibold uppercase tracking-wide">
              <Store className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              <MetricLabelWithTooltip label="Publicados" tooltipBody={metricTooltips.publicados.body} />
            </div>
            <div className="mt-2 text-metric tabular-nums text-primary-700 dark:text-primary-300">{totalListings}</div>
            <div className="text-xs text-gray-700 dark:text-slate-300 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate('/products?marketplace=ebay'); }}
                className="hover:text-primary-600 hover:underline focus:outline-none"
              >
                eBay: {summary.listingsByMarketplace.ebay}
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate('/products?marketplace=mercadolibre'); }}
                className="hover:text-primary-600 hover:underline focus:outline-none"
              >
                ML: {summary.listingsByMarketplace.mercadolibre}
                {typeof summary.mercadolibreActiveCount === 'number' && summary.mercadolibreActiveCount !== summary.listingsByMarketplace.mercadolibre && (
                  <span className="text-amber-600 dark:text-amber-400" title="Activos en Mercado Libre (verificado via API)">
                    {' '}({summary.mercadolibreActiveCount} activos)
                  </span>
                )}
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate('/products?marketplace=amazon'); }}
                className="hover:text-primary-600 hover:underline focus:outline-none"
              >
                Amazon: {summary.listingsByMarketplace.amazon}
              </button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {summary.listingsSource === 'api' && 'eBay/ML verificados por API'}
              {summary.listingsSource === 'database' && (
                <span className="text-amber-600 dark:text-amber-400" title="El número puede no coincidir con el marketplace si los listados se crearon fuera del sistema o las APIs no están disponibles.">
                  Solo BD · Verificación por API no disponible
                </span>
              )}
              {summary.lastSyncAt && (
                <span className="ml-1">· Sync: {new Date(summary.lastSyncAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
          </div>

          <div
            className="p-4 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900/80 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-all"
            onClick={() => navigate('/orders')}
          >
            <div className="flex items-center gap-2 text-gray-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wide">
              <Truck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Órdenes
            </div>
            <div className="mt-2 text-metric-sm tabular-nums text-gray-900 dark:text-white">{totalOrders}</div>
            <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">
              {summary.ordersByStatus.PAID > 0 && `${ORDER_LABELS.PAID}: ${summary.ordersByStatus.PAID} · `}
              {summary.ordersByStatus.PURCHASING > 0 && `${ORDER_LABELS.PURCHASING}: ${summary.ordersByStatus.PURCHASING} · `}
              {summary.ordersByStatus.PURCHASED > 0 && `${ORDER_LABELS.PURCHASED}: ${summary.ordersByStatus.PURCHASED}`}
            </div>
          </div>

          <div
            className="p-4 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900/80 cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 transition-all"
            onClick={() => navigate('/pending-purchases')}
          >
            <div className="flex items-center gap-2 text-gray-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wide">
              <ShoppingCart className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <MetricLabelWithTooltip label="Por comprar" tooltipBody={metricTooltips.porComprar.body} />
            </div>
            <div className="mt-2 text-metric-sm tabular-nums text-gray-900 dark:text-white">{summary.pendingPurchasesCount}</div>
            <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">Compras pendientes</div>
          </div>
        </div>

        <button
          onClick={() => navigate('/products')}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          Ver detalles
          <ChevronRight className="w-4 h-4" />
        </button>
      </CardContent>
    </Card>
  );
}
