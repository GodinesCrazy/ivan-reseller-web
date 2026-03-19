/**
 * Order Detail - Unified order view: buyer, address, product, status, tracking, payment state.
 * Phase 42: Full post-sale visibility.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Package, CheckCircle, XCircle, RefreshCw, MapPin, Truck, Settings } from 'lucide-react';
import { getOrder, retryOrderFulfill, forceFulfillByEbayOrderId, setOrderSupplierUrl, resetOrderPurchasing, type Order } from '@/services/orders.api';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatCurrencySimple } from '@/utils/currency';
import { useAuthStatusStore } from '@/stores/authStatusStore';

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
  const [supplierUrlInput, setSupplierUrlInput] = useState('');
  const [supplierUrlLoading, setSupplierUrlLoading] = useState(false);
  const [supplierUrlError, setSupplierUrlError] = useState<string | null>(null);
  const [resetPurchasingLoading, setResetPurchasingLoading] = useState(false);
  const [resetPurchasingError, setResetPurchasingError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statuses = useAuthStatusStore((state) => state.statuses);
  const aliStatusUnknown = statuses?.aliexpress?.status === 'unknown';
  const orderPendingPurchase = order?.status === 'PAID' || order?.status === 'PURCHASING';
  const failedWithTimeout =
    order?.status === 'FAILED' &&
    order?.errorMessage &&
    /timeout|tardó demasiado/i.test(order.errorMessage);
  const showConnectAliNotice = aliStatusUnknown && (orderPendingPurchase || failedWithTimeout);

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
      const isTimeout = err?.code === 'ECONNABORTED' || (err?.message && String(err.message).toLowerCase().includes('timeout'));
      setRetryError(
        isTimeout
          ? 'La solicitud tardó demasiado. Actualiza la página para ver si la orden pasó a Completada o Fallida.'
          : err?.response?.data?.error || err?.message || 'Error al reintentar'
      );
    } finally {
      setRetryLoading(false);
      await fetchOrder();
    }
  };

  /** Force fulfillment when order is PAID or FAILED (retry), has eBay ID and (if FAILED) product URL. */
  const canForceFulfill =
    (order?.status === 'PAID' || (order?.status === 'FAILED' && (order?.productUrl || '').trim().length > 0)) &&
    order?.marketplaceOrderId &&
    (order.paypalOrderId || '').startsWith('ebay:');
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
      const isTimeout = err?.code === 'ECONNABORTED' || (err?.message && String(err.message).toLowerCase().includes('timeout'));
      setForceFulfillError(
        isTimeout
          ? 'La solicitud tardó demasiado. Actualiza la página para ver si la orden pasó a Completada o Fallida.'
          : err?.response?.data?.error || err?.message || 'Error al forzar compra'
      );
    } finally {
      setForceFulfillLoading(false);
      await fetchOrder();
    }
  };

  const handleResetPurchasing = async () => {
    if (!id || order?.status !== 'PURCHASING') return;
    setResetPurchasingLoading(true);
    setResetPurchasingError(null);
    try {
      const updated = await resetOrderPurchasing(id);
      setOrder(updated);
      await fetchOrder();
    } catch (err: any) {
      setResetPurchasingError(err?.response?.data?.error || err?.message || 'Error al cancelar');
    } finally {
      setResetPurchasingLoading(false);
    }
  };

  const needsSupplierUrl = (order?.status === 'PAID' || order?.status === 'FAILED') && !(order?.productUrl?.trim());
  const handleSetSupplierUrl = async () => {
    if (!id || !supplierUrlInput.trim()) return;
    setSupplierUrlLoading(true);
    setSupplierUrlError(null);
    try {
      const updated = await setOrderSupplierUrl(id, supplierUrlInput.trim());
      setOrder(updated);
      setSupplierUrlInput('');
      if (updated.status === 'PAID' && updated.productUrl) {
        setForceFulfillError(null);
      }
    } catch (err: any) {
      setSupplierUrlError(err?.response?.data?.error || err?.message || 'Error al guardar URL');
    } finally {
      setSupplierUrlLoading(false);
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

        {showConnectAliNotice && (
          <div className="p-4 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
            <p className="text-sm font-medium">Para compras automáticas en AliExpress, conecta tu cuenta.</p>
            <p className="text-sm mt-1">Ve a Ajustes → APIs → AliExpress Dropshipping y completa la autorización.</p>
            <Link
              to="/api-settings"
              className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Settings className="w-4 h-4" />
              Ir a Configuración de APIs
            </Link>
          </div>
        )}

        {needsSupplierUrl && (
          <div className="p-4 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 space-y-3">
            <p className="text-sm font-medium">Falta la URL de AliExpress para realizar la compra al proveedor.</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">Pega la URL del artículo en AliExpress que encontraste (debe ser el mismo producto). Al guardarla, podrás usar &quot;Forzar compra en AliExpress&quot;.</p>
            <div className="flex flex-wrap items-end gap-2">
              <input
                type="url"
                placeholder="https://es.aliexpress.com/item/1005010738822789.html"
                value={supplierUrlInput}
                onChange={(e) => setSupplierUrlInput(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={handleSetSupplierUrl}
                disabled={supplierUrlLoading || !supplierUrlInput.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {supplierUrlLoading ? 'Guardando...' : 'Usar esta URL'}
              </button>
            </div>
            {supplierUrlError && <p className="text-sm text-red-700 dark:text-red-300">{supplierUrlError}</p>}
          </div>
        )}

        {order.status === 'PURCHASING' && (
          <div className="p-4 mb-4 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 space-y-2">
            <p className="text-sm font-medium">La compra está en curso.</p>
            <p className="text-sm">Si lleva más de 2–3 minutos sin avanzar, usa &quot;Cancelar compra en curso&quot; y luego &quot;Forzar compra en AliExpress&quot; para reintentar.</p>
            <button
              type="button"
              onClick={handleResetPurchasing}
              disabled={resetPurchasingLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              <XCircle className={`w-4 h-4 ${resetPurchasingLoading ? 'animate-spin' : ''}`} />
              {resetPurchasingLoading ? 'Cancelando...' : 'Cancelar compra en curso'}
            </button>
            {resetPurchasingError && <p className="text-sm text-red-700 dark:text-red-300">{resetPurchasingError}</p>}
          </div>
        )}

        {canForceFulfill && (
          <div className="p-4 mb-4 text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
            <p className="text-sm font-medium">
              {order?.status === 'FAILED'
                ? 'La compra falló. Puedes reintentarla en AliExpress.'
                : 'Orden pagada en eBay — pendiente de compra en AliExpress.'}
            </p>
            <button
              type="button"
              onClick={handleForceFulfill}
              disabled={forceFulfillLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${forceFulfillLoading ? 'animate-spin' : ''}`} />
              {forceFulfillLoading ? 'Ejecutando...' : order?.status === 'FAILED' ? 'Reintentar compra en AliExpress' : 'Forzar compra en AliExpress'}
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
