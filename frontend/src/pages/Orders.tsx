/**
 * My Orders - Post-sale dropshipping orders
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, RefreshCw, ArrowRight, ExternalLink } from 'lucide-react';
import api from '@/services/api';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatCurrencySimple } from '@/utils/currency';
import { retryOrderFulfill, type Order } from '@/services/orders.api';

export default function Orders() {
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

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<Order[]>('/api/orders');
      setOrders(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Error al cargar órdenes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Órdenes / Envíos</h1>
          <button
            onClick={fetchOrders}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>
        </div>
        <p className="text-gray-600 mt-0.5">Órdenes de compra al proveedor y seguimiento de envíos. Tras una venta, compra en AliExpress desde <span className="font-medium">Compras pendientes</span> y el estado se actualiza aquí.</p>
        <div className="mt-3">
          <CycleStepsBreadcrumb currentStep={6} />
        </div>
      </div>

      {error && (
        <div className="p-4 text-red-700 bg-red-50 rounded-lg">{error}</div>
      )}

      {orders.length === 0 ? (
        <div className="p-12 text-center text-gray-500 bg-gray-50 rounded-lg">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p>Sin órdenes todavía</p>
          <p className="text-sm mt-2">Las órdenes aparecen aquí tras el checkout de una venta</p>
        </div>
      ) : (
        <div className="overflow-hidden bg-white border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orden</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Importe</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono">{order.id.slice(0, 8)}...</td>
                  <td className="px-6 py-4 text-sm">
                    {order.productId ? (
                      <button
                        onClick={() => navigate(`/products/${order.productId}/preview`)}
                        className="text-blue-600 hover:underline flex items-center gap-1"
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
                  <td className="px-6 py-4 text-sm">{formatCurrencySimple(order.price, order.currency)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                      >
                        Ver <ArrowRight className="w-4 h-4" />
                      </button>
                      {canRetryFulfill(order) && (
                        <button
                          type="button"
                          onClick={() => handleRetryFulfill(order.id)}
                          disabled={retryingId === order.id}
                          className="flex items-center gap-1 text-sm text-amber-700 hover:text-amber-900 disabled:opacity-50"
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
