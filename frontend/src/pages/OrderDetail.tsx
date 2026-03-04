/**
 * Order Detail - View single order with status polling
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { getOrder, retryOrderFulfill, type Order } from '@/services/orders.api';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatCurrencySimple } from '@/utils/currency';

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canRetryFulfill =
    order?.status === 'FAILED' &&
    order?.errorMessage?.includes('FAILED_INSUFFICIENT_FUNDS') &&
    (order?.fulfillRetryCount ?? 0) < 3;

  const handleRetryFulfill = async () => {
    if (!id || !order || !canRetryFulfill) return;
    setRetryLoading(true);
    setRetryError(null);
    try {
      const result = await retryOrderFulfill(id);
      if (result.success) {
        await fetchOrder();
      } else {
        setRetryError(result.error || 'Retry failed');
      }
    } catch (err: any) {
      setRetryError(err?.response?.data?.error || err?.message || 'Error al reintentar');
    } finally {
      setRetryLoading(false);
    }
  };

  const fetchOrder = async () => {
    if (!id) return;
    try {
      const data = await getOrder(id);
      setOrder(data);
      setError(null);
      return data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load order');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

  useEffect(() => {
    if (!id || !order) return;
    const isTerminal = order.status === 'PURCHASED' || order.status === 'FAILED';
    if (isTerminal) return;
    pollRef.current = setInterval(fetchOrder, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id, order?.status]);

  if (loading && !order) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => navigate('/orders')}
          className="mt-4 text-blue-600 hover:underline"
        >
          ← Back to Orders
        </button>
      </div>
    );
  }

  if (!order) return null;

  const isSuccess = order.status === 'PURCHASED' || order.aliexpressOrderId === 'SIMULATED_ORDER_ID';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/orders')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Orders
      </button>

      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">{order.title}</h1>
            <p className="text-sm text-gray-500 font-mono mt-1">Order {order.id}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {isSuccess && (
          <div className="flex items-center gap-2 p-4 mb-4 text-green-800 bg-green-50 rounded-lg">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span>Order fulfilled successfully. AliExpress order: {order.aliexpressOrderId || 'N/A'}</span>
          </div>
        )}

        {order.status === 'FAILED' && order.errorMessage && (
          <div className="p-4 mb-4 text-red-800 bg-red-50 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 flex-shrink-0" />
              <span>{order.errorMessage}</span>
            </div>
            {canRetryFulfill && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRetryFulfill}
                  disabled={retryLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${retryLoading ? 'animate-spin' : ''}`} />
                  Reintentar compra
                </button>
                {retryError && (
                  <p className="mt-2 text-sm text-red-700">{retryError}</p>
                )}
              </div>
            )}
          </div>
        )}

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Amount</dt>
            <dd className="mt-1">{formatCurrencySimple(order.price, order.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Customer</dt>
            <dd className="mt-1">{order.customerName}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Email</dt>
            <dd className="mt-1">{order.customerEmail}</dd>
          </div>
          {order.aliexpressOrderId && (
            <div>
              <dt className="text-sm font-medium text-gray-500">AliExpress Order</dt>
              <dd className="mt-1 font-mono">{order.aliexpressOrderId}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
