/**
 * Order Detail - Unified order view: buyer, address, product, status, tracking, payment state.
 * Phase 42: Full post-sale visibility.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, CheckCircle, XCircle, RefreshCw, MapPin, Truck } from 'lucide-react';
import { getOrder, retryOrderFulfill, forceFulfillByEbayOrderId, type Order } from '@/services/orders.api';
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
  const [forceFulfillLoading, setForceFulfillLoading] = useState(false);
  const [forceFulfillError, setForceFulfillError] = useState<string | null>(null);
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

  /** Phase 44: Force fulfillment when order is PAID and has eBay ID. */
  const canForceFulfill = order?.status === 'PAID' && order?.marketplaceOrderId && (order.paypalOrderId || '').startsWith('ebay:');
  const handleForceFulfill = async () => {
    if (!order?.marketplaceOrderId || !canForceFulfill) return;
    setForceFulfillLoading(true);
    setForceFulfillError(null);
    try {
      const result = await forceFulfillByEbayOrderId(order.marketplaceOrderId);
      if (result.success || result.status === 'PURCHASED') {
        await fetchOrder();
      } else {
        setForceFulfillError(result.error || result.message || 'Fulfillment failed');
      }
    } catch (err: any) {
      setForceFulfillError(err?.response?.data?.error || err?.message || 'Error al forzar compra');
    } finally {
      setForceFulfillLoading(false);
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
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={() => navigate('/orders')}
          className="mt-4 text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Back to Orders
        </button>
      </div>
    );
  }

  if (!order) return null;

  const isSuccess = order.status === 'PURCHASED' || order.aliexpressOrderId === 'SIMULATED_ORDER_ID';
  let shippingObj: Record<string, string> | null = null;
  try {
    const parsed = JSON.parse(order.shippingAddress || '{}');
    if (parsed && typeof parsed === 'object') shippingObj = parsed;
  } catch {
    // ignore
  }
  const marketplaceLabel = order.paypalOrderId?.startsWith('ebay:')
    ? 'eBay'
    : order.paypalOrderId?.startsWith('mercadolibre:')
      ? 'Mercado Libre'
      : order.paypalOrderId?.startsWith('amazon:')
        ? 'Amazon'
        : 'Checkout';

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <button
        onClick={() => navigate('/orders')}
        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a Órdenes
      </button>

      <div className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{order.title}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono mt-1">ID interno: {order.id}</p>
            {order.marketplaceOrderId && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                {marketplaceLabel}: <span className="font-mono">{order.marketplaceOrderId}</span>
              </p>
            )}
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {isSuccess && (
          <div className="flex items-center gap-2 p-4 text-green-800 dark:text-green-200 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span>Compra cumplida. AliExpress: {order.aliexpressOrderId || 'N/A'}</span>
          </div>
        )}

        {canForceFulfill && (
          <div className="p-4 mb-4 text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
            <p className="text-sm font-medium">Orden pagada en eBay — pendiente de compra en AliExpress.</p>
            <button
              type="button"
              onClick={handleForceFulfill}
              disabled={forceFulfillLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${forceFulfillLoading ? 'animate-spin' : ''}`} />
              {forceFulfillLoading ? 'Ejecutando...' : 'Forzar compra en AliExpress'}
            </button>
            {forceFulfillError && <p className="text-sm text-red-700 dark:text-red-300">{forceFulfillError}</p>}
          </div>
        )}

        {order.status === 'FAILED' && order.errorMessage && (
          <div className="p-4 text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 space-y-2">
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
                  <p className="mt-2 text-sm text-red-700 dark:text-red-300">{retryError}</p>
                )}
              </div>
            )}
          </div>
        )}

        <section>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Comprador y pago</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Comprador</dt>
              <dd className="mt-0.5 text-gray-900 dark:text-gray-100">{order.customerName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="mt-0.5 text-gray-900 dark:text-gray-100">{order.customerEmail}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Importe</dt>
              <dd className="mt-0.5 text-gray-900 dark:text-gray-100">{formatCurrencySimple(order.price, order.currency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Estado pago / fulfillment</dt>
              <dd className="mt-0.5"><OrderStatusBadge status={order.status} /></dd>
            </div>
          </dl>
        </section>

        {shippingObj && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> Dirección de envío
            </h2>
            <div className="text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 font-mono">
              {shippingObj.fullName || order.customerName}
              <br />
              {[shippingObj.addressLine1, shippingObj.addressLine2].filter(Boolean).join(', ')}
              <br />
              {[shippingObj.city, shippingObj.state, shippingObj.zipCode].filter(Boolean).join(', ')} {shippingObj.country || ''}
              {shippingObj.phoneNumber && <><br />{shippingObj.phoneNumber}</>}
            </div>
          </section>
        )}

        {(order.aliexpressOrderId || order.sale?.trackingNumber) && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
              <Truck className="w-4 h-4" /> Seguimiento
            </h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {order.aliexpressOrderId && (
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Pedido AliExpress</dt>
                  <dd className="mt-0.5 font-mono text-gray-900 dark:text-gray-100">{order.aliexpressOrderId}</dd>
                </div>
              )}
              {order.sale?.trackingNumber && (
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Tracking</dt>
                  <dd className="mt-0.5 font-mono text-gray-900 dark:text-gray-100">{order.sale.trackingNumber}</dd>
                </div>
              )}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
