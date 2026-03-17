/**
 * My Orders - Post-sale dropshipping orders
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, RefreshCw, ArrowRight, ExternalLink } from 'lucide-react';
import api from '@/services/api';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatCurrencySimple } from '@/utils/currency';
import { retryOrderFulfill, type Order } from '@/services/orders.api';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import { useEnvironment } from '@/contexts/EnvironmentContext';

export default function Orders() {
  const { environment } = useEnvironment();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const canRetryFulfill = (order: Order) =>
    order.status === 'FAILED' &&
    order.errorMessage?.includes('FAILED_INSUFFICIENT_FUNDS') &&
    (order.fulfillRetryCount ?? 0) < 3;

  const handleRetryFulfill = async (orderId: string) => {
    setRetryingId(orderId);
    setError(null);
    try {
      await retryOrderFulfill(orderId);
      await fetchOrders();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Error al reintentar');
    } finally {
      setRetryingId(null);
    }
  };

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<Order[]>('/api/orders', { params: { environment } });
      setOrders(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Error al cargar órdenes');
    } finally {
      setLoading(false);
    }
  }, [environment]);

  useLiveData({ fetchFn: fetchOrders, intervalMs: 15000, enabled: true });
  useNotificationRefetch({
    handlers: { SALE_CREATED: fetchOrders },
    enabled: true,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <LoadingSpinner />
      </div>
    );
  }

  const hasFailed = orders.some((o) => o.status === 'FAILED');

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Órdenes / Envíos</h1>
          <button
            onClick={fetchOrders}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-0.5">Órdenes de compra al proveedor y seguimiento de envíos. Tras una venta, compra en AliExpress desde <span className="font-medium">Compras pendientes</span> y el estado se actualiza aquí.</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Datos actualizados en cada carga.</p>
        {hasFailed && (
          <p className="text-xs mt-1">
            <a href="/dashboard" className="text-amber-600 dark:text-amber-400 hover:underline">Ver alertas en Panel</a>
          </p>
        )}
        <div className="mt-3">
          <CycleStepsBreadcrumb currentStep={6} />
        </div>
      </div>

      {error && (
        <div className="p-4 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">{error}</div>
      )}

      {orders.length === 0 ? (
        <div className="p-12 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
          <p>Sin órdenes todavía</p>
          <p className="text-sm mt-2">Las órdenes aparecen aquí tras el checkout de una venta</p>
        </div>
      ) : (
        <div className="overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Orden</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Título</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Importe</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fecha</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-gray-100">{order.id.slice(0, 8)}...</td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                    {order.productId ? (
                      <button
                        onClick={() => navigate(`/products/${order.productId}/preview`)}
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        {order.title}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      order.title
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{formatCurrencySimple(order.price, order.currency)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                      >
                        Ver <ArrowRight className="w-4 h-4" />
                      </button>
                      {canRetryFulfill(order) && (
                        <button
                          type="button"
                          onClick={() => handleRetryFulfill(order.id)}
                          disabled={retryingId === order.id}
                          className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-4 h-4 ${retryingId === order.id ? 'animate-spin' : ''}`} />
                          Reintentar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
