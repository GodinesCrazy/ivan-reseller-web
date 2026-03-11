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

interface InventorySummary {
  products: { total: number; pending: number; approved: number; published: number };
  listingsByMarketplace: { ebay: number; mercadolibre: number; amazon: number };
  ordersByStatus: { CREATED: number; PAID: number; PURCHASING: number; PURCHASED: number; FAILED: number };
  pendingPurchasesCount: number;
}

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
  const [internalSummary, setInternalSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(!summaryProp);

  useEffect(() => {
    if (summaryProp != null) {
      setLoading(false);
      return;
    }
    let mounted = true;
    api
      .get<InventorySummary>('/api/dashboard/inventory-summary')
      .then((res) => {
        if (mounted && res.data) setInternalSummary(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [summaryProp]);

  const summary = summaryProp ?? internalSummary;

  if (loading || !summary) return null;

  const totalListings =
    summary.listingsByMarketplace.ebay +
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
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div
            className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={() => navigate('/products')}
          >
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Package className="w-4 h-4" />
              Productos
            </div>
            <div className="mt-1 font-semibold text-lg">{summary.products.total}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {summary.products.pending} pendientes · {summary.products.published} publicados
            </div>
          </div>

          <div
            className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={() => navigate('/publisher')}
          >
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Store className="w-4 h-4" />
              Publicados
            </div>
            <div className="mt-1 font-semibold text-lg">{totalListings}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              eBay: {summary.listingsByMarketplace.ebay} · ML: {summary.listingsByMarketplace.mercadolibre} · Amazon: {summary.listingsByMarketplace.amazon}
            </div>
          </div>

          <div
            className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={() => navigate('/orders')}
          >
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Truck className="w-4 h-4" />
              Órdenes
            </div>
            <div className="mt-1 font-semibold text-lg">{totalOrders}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {summary.ordersByStatus.PAID > 0 && `${ORDER_LABELS.PAID}: ${summary.ordersByStatus.PAID} · `}
              {summary.ordersByStatus.PURCHASING > 0 && `${ORDER_LABELS.PURCHASING}: ${summary.ordersByStatus.PURCHASING} · `}
              {summary.ordersByStatus.PURCHASED > 0 && `${ORDER_LABELS.PURCHASED}: ${summary.ordersByStatus.PURCHASED}`}
            </div>
          </div>

          <div
            className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={() => navigate('/pending-purchases')}
          >
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <ShoppingCart className="w-4 h-4" />
              Por comprar
            </div>
            <div className="mt-1 font-semibold text-lg">{summary.pendingPurchasesCount}</div>
            <div className="text-xs text-gray-500 mt-0.5">Compras pendientes</div>
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
