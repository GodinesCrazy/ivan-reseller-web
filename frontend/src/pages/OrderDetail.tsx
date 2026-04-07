/**
 * Order Detail - Unified order view: buyer, address, product, status, tracking, payment state.
 * Phase 42: Full post-sale visibility.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Package,
  CheckCircle,
  XCircle,
  RefreshCw,
  MapPin,
  Truck,
  Settings,
  ExternalLink,
  ClipboardCopy,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  getOrder,
  retryOrderFulfill,
  forceFulfillByEbayOrderId,
  setOrderSupplierUrl,
  resetOrderPurchasing,
  markManualPurchased,
  retryAutomaticFulfillment,
  getOrderSmartSupplier,
  applyOrderSmartSupplier,
  type Order,
  type SmartSupplierRecommendation,
} from '@/services/orders.api';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatCurrencySimple } from '@/utils/currency';
import { useAuthStatusStore } from '@/stores/authStatusStore';
import toast from 'react-hot-toast';
import { isSimulatedSupplierOrderId } from '@/utils/simulated-order-id';

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
  const [manualSupplierOrderId, setManualSupplierOrderId] = useState('');
  const [manualMarkLoading, setManualMarkLoading] = useState(false);
  const [manualRetryLoading, setManualRetryLoading] = useState(false);
  const [manualActionError, setManualActionError] = useState<string | null>(null);
  const [smartRec, setSmartRec] = useState<SmartSupplierRecommendation | null>(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [smartApplyLoading, setSmartApplyLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statuses = useAuthStatusStore((state) => state.statuses);
  const aliStatusUnknown = statuses?.aliexpress?.status === 'unknown';
  const orderPendingPurchase =
    order?.status === 'PAID' || order?.status === 'PURCHASING' || order?.status === 'MANUAL_ACTION_REQUIRED';
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

  /** Force fulfillment when PAID or FAILED (retry), has eBay ID and product URL. MANUAL_ACTION_REQUIRED uses Phase 47B panel instead. */
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

  /** Phase 48: smart supplier when manual / SKU failure */
  useEffect(() => {
    if (!id || !order) return;
    const eligible =
      order.status === 'MANUAL_ACTION_REQUIRED' ||
      order.status === 'FULFILLMENT_BLOCKED' ||
      order.manualFulfillmentRequired ||
      (order.status === 'FAILED' && /SKU_NOT_EXIST|PRODUCT_NOT_EXIST/i.test(order.errorMessage || ''));
    if (!eligible) {
      setSmartRec(null);
      setSmartError(null);
      setSmartLoading(false);
      return;
    }
    const cached = order.recommendedSupplierMeta as SmartSupplierRecommendation | undefined;
    if (cached?.productUrl && cached?.productId) {
      setSmartRec(cached);
    }
    let cancelled = false;
    (async () => {
      setSmartLoading(true);
      setSmartError(null);
      try {
        const data = await getOrderSmartSupplier(id);
        if (!cancelled && data.recommendation) setSmartRec(data.recommendation);
      } catch (e: any) {
        const msg = e?.response?.data?.error || e?.message || 'No se encontró proveedor validado';
        if (!cancelled) {
          setSmartError(msg);
          if (cached?.productUrl) setSmartRec(cached);
        }
      } finally {
        if (!cancelled) setSmartLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, order?.id, order?.status, order?.manualFulfillmentRequired, order?.errorMessage, order?.recommendedSupplierMeta]);

  useEffect(() => {
    if (!id || !order) return;
    const isTerminal =
      order.status === 'PURCHASED' ||
      order.status === 'FAILED' ||
      order.status === 'MANUAL_ACTION_REQUIRED' ||
      order.status === 'FULFILLMENT_BLOCKED';
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
          className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Volver a Órdenes
        </button>
      </div>
    );
  }

  if (!order) return null;

  const hasVerifiedSupplierPurchaseProof =
    (!!order.aliexpressOrderId?.trim() && !isSimulatedSupplierOrderId(order.aliexpressOrderId)) ||
    !!order.manualPurchaseDate;
  const showPurchasedSuccessBanner = order.status === 'PURCHASED' && hasVerifiedSupplierPurchaseProof;
  const purchasedWithoutVerifiableSupplierId =
    order.status === 'PURCHASED' && !hasVerifiedSupplierPurchaseProof;
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

  const addressText = shippingObj
    ? [
        shippingObj.fullName || order.customerName,
        [shippingObj.addressLine1, shippingObj.addressLine2].filter(Boolean).join(', '),
        [shippingObj.city, shippingObj.state, shippingObj.zipCode].filter(Boolean).join(', '),
        shippingObj.country || '',
        shippingObj.phoneNumber || '',
      ]
        .filter(Boolean)
        .join('\n')
    : order.shippingAddress || '';

  const showManualFulfillmentPanel =
    order.status === 'MANUAL_ACTION_REQUIRED' ||
    order.status === 'FULFILLMENT_BLOCKED' ||
    !!order.manualFulfillmentRequired;

  /** Same eligibility as Phase 48 smart-supplier fetch (incl. FAILED + SKU_NOT_EXIST). */
  const showSmartSupplierSection =
    order.status === 'MANUAL_ACTION_REQUIRED' ||
    order.status === 'FULFILLMENT_BLOCKED' ||
    !!order.manualFulfillmentRequired ||
    (order.status === 'FAILED' && /SKU_NOT_EXIST|PRODUCT_NOT_EXIST/i.test(order.errorMessage || ''));

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(addressText);
    } catch {
      /* ignore */
    }
  };

  const handleMarkManualPurchased = async () => {
    if (!id) return;
    setManualMarkLoading(true);
    setManualActionError(null);
    try {
      await markManualPurchased(id, {
        supplierOrderId: manualSupplierOrderId.trim() || undefined,
      });
      setManualSupplierOrderId('');
      await fetchOrder();
    } catch (e: any) {
      setManualActionError(e?.response?.data?.error || e?.message || 'Error al marcar comprado');
    } finally {
      setManualMarkLoading(false);
    }
  };

  const handleRetryAutomaticFromManual = async () => {
    if (!id) return;
    setManualRetryLoading(true);
    setManualActionError(null);
    try {
      await retryAutomaticFulfillment(id);
      await fetchOrder();
    } catch (e: any) {
      const isTimeout =
        e?.code === 'ECONNABORTED' || (e?.message && String(e.message).toLowerCase().includes('timeout'));
      setManualActionError(
        isTimeout
          ? 'La solicitud tardó demasiado. Actualiza la página para ver el estado.'
          : e?.response?.data?.error || e?.message || 'Error al reintentar compra automática'
      );
    } finally {
      setManualRetryLoading(false);
    }
  };

  const handleSmartRefresh = async () => {
    if (!id) return;
    setSmartLoading(true);
    setSmartError(null);
    try {
      const data = await getOrderSmartSupplier(id, { refresh: true });
      if (data.recommendation) {
        setSmartRec(data.recommendation);
        toast.success('Recomendación actualizada');
      } else {
        setSmartRec(null);
        toast('Sin resultados validados', { icon: 'ℹ️' });
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Error al actualizar';
      setSmartError(msg);
      toast.error(msg);
    } finally {
      setSmartLoading(false);
    }
  };

  const handleSmartApply = async () => {
    if (!id || !smartRec) return;
    setSmartApplyLoading(true);
    try {
      const updated = await applyOrderSmartSupplier(id, smartRec);
      setOrder(updated);
      await fetchOrder();
      toast.success('Proveedor guardado en la orden');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || 'Error al guardar');
    } finally {
      setSmartApplyLoading(false);
    }
  };

  const smartOpenUrl = smartRec ? (smartRec.affiliateUrl || smartRec.productUrl) : '';

  return (
    <div className="max-w-4xl mx-auto space-y-5 p-6">
      <button
        onClick={() => navigate('/orders')}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Volver a Órdenes
      </button>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{order.title}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">ID interno: {order.id}</p>
            {order.marketplaceOrderId && (
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {marketplaceLabel}: <span className="font-mono">{order.marketplaceOrderId}</span>
              </p>
            )}
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {order.status === 'SIMULATED' && (
          <div className="flex items-center gap-2 p-3 text-sm text-violet-900 dark:text-violet-100 bg-violet-50 dark:bg-violet-950/30 rounded-lg border border-violet-200 dark:border-violet-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              Orden simulada: no indica compra real en proveedor ni cobro verificado. No uses esta pantalla como prueba operativa.
            </span>
          </div>
        )}

        {showPurchasedSuccessBanner && (
          <div className="flex items-center gap-2 p-3 text-sm text-green-800 dark:text-green-200 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              Compra en proveedor registrada con prueba verificable
              {order.aliexpressOrderId ? `: ${order.aliexpressOrderId}` : ' (marcado manual)'}.
            </span>
          </div>
        )}

        {purchasedWithoutVerifiableSupplierId && (
          <div className="flex items-start gap-2 p-3 text-sm text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/25 rounded-lg border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Estado &quot;Comprado&quot; sin ID de pedido proveedor verificable</p>
              <p className="text-xs text-amber-800/90 dark:text-amber-200/90">
                {isSimulatedSupplierOrderId(order.aliexpressOrderId)
                  ? 'El ID de AliExpress es de simulación o prueba; no cuenta como compra real.'
                  : 'Falta un ID de pedido AliExpress válido o marca de compra manual con fecha. Revisa la orden, el panel manual o sincroniza con el proveedor.'}
              </p>
            </div>
          </div>
        )}

        {showConnectAliNotice && (
          <div className="p-3 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-medium">Para compras automáticas en AliExpress, conecta tu cuenta.</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Ve a Ajustes → APIs → AliExpress Dropshipping y completa la autorización.</p>
            <Link
              to="/api-settings"
              className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Settings className="w-3.5 h-3.5" />
              Ir a Configuración de APIs
            </Link>
          </div>
        )}

        {needsSupplierUrl && (
          <div className="p-4 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/25 rounded-lg border border-amber-200 dark:border-amber-800 space-y-3">
            <p className="text-sm font-medium">Falta la URL de AliExpress para realizar la compra al proveedor.</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Pega la URL del artículo en AliExpress que encontraste (debe ser el mismo producto). Al guardarla, podrás usar &quot;Forzar compra en AliExpress&quot;.</p>
            <div className="flex flex-wrap items-end gap-2">
              <input
                type="url"
                placeholder="https://es.aliexpress.com/item/1005010738822789.html"
                value={supplierUrlInput}
                onChange={(e) => setSupplierUrlInput(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleSetSupplierUrl}
                disabled={supplierUrlLoading || !supplierUrlInput.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {supplierUrlLoading ? 'Guardando…' : 'Usar esta URL'}
              </button>
            </div>
            {supplierUrlError && <p className="text-xs text-red-700 dark:text-red-300">{supplierUrlError}</p>}
          </div>
        )}

        {order.status === 'PURCHASING' && (
          <div className="p-4 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/25 rounded-lg border border-amber-200 dark:border-amber-800 space-y-2">
            <p className="text-sm font-medium">La compra está en curso.</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">Si lleva más de 2–3 minutos sin avanzar, usa &quot;Cancelar compra en curso&quot; y luego &quot;Forzar compra en AliExpress&quot; para reintentar.</p>
            <button
              type="button"
              onClick={handleResetPurchasing}
              disabled={resetPurchasingLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              <XCircle className={`w-4 h-4 ${resetPurchasingLoading ? 'animate-spin' : ''}`} />
              {resetPurchasingLoading ? 'Cancelando…' : 'Cancelar compra en curso'}
            </button>
            {resetPurchasingError && <p className="text-xs text-red-700 dark:text-red-300">{resetPurchasingError}</p>}
          </div>
        )}

        {canForceFulfill && (
          <div className="p-4 text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/25 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
            <p className="text-sm font-medium">
              {order?.status === 'FAILED'
                ? 'La compra falló. Puedes reintentarla en AliExpress.'
                : 'Orden pagada en eBay — pendiente de compra en AliExpress.'}
            </p>
            <button
              type="button"
              onClick={handleForceFulfill}
              disabled={forceFulfillLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${forceFulfillLoading ? 'animate-spin' : ''}`} />
              {forceFulfillLoading ? 'Ejecutando…' : order?.status === 'FAILED' ? 'Reintentar compra en AliExpress' : 'Forzar compra en AliExpress'}
            </button>
            {forceFulfillError && <p className="text-xs text-red-700 dark:text-red-300">{forceFulfillError}</p>}
          </div>
        )}

        {order.status === 'FAILED' && order.errorMessage && (
          <div className="p-4 text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-950/25 rounded-lg border border-red-200 dark:border-red-800 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span>{order.errorMessage}</span>
            </div>
            {canRetryFulfill && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRetryFulfill}
                  disabled={retryLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${retryLoading ? 'animate-spin' : ''}`} />
                  Reintentar compra
                </button>
                {retryError && (
                  <p className="mt-2 text-xs text-red-700 dark:text-red-300">{retryError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {showSmartSupplierSection && (
          <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold">Proveedor recomendado</p>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
                  Producto validado con stock disponible para compra manual
                </p>
              </div>
              <button
                type="button"
                onClick={handleSmartRefresh}
                disabled={smartLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${smartLoading ? 'animate-spin' : ''}`} />
                Actualizar búsqueda
              </button>
            </div>
            {smartLoading && !smartRec && (
              <div className="flex items-center gap-2 text-sm text-emerald-900 dark:text-emerald-200 py-1">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-700 dark:text-emerald-300 flex-shrink-0" />
                <span>Buscando y validando proveedor…</span>
              </div>
            )}
            {smartError && !smartRec && (
              <p className="text-xs text-red-800 dark:text-red-200">{smartError}</p>
            )}
            {smartRec && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white/80 dark:bg-slate-900/50 p-3 space-y-3">
                <div className="flex gap-3">
                  {smartRec.productMainImageUrl ? (
                    <img
                      src={smartRec.productMainImageUrl}
                      alt=""
                      className="w-20 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-700 flex-shrink-0 bg-white"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-700 flex items-center justify-center text-[10px] text-emerald-700 dark:text-emerald-300">
                      Sin imagen
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">{smartRec.productTitle}</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {formatCurrencySimple(smartRec.salePriceUsd, 'USD')}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Valoración {smartRec.rating.toFixed(1)} · {smartRec.orderCount.toLocaleString()} pedidos
                    </p>
                    {smartRec.shippingSummary ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{smartRec.shippingSummary}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {smartOpenUrl ? (
                    <a
                      href={smartOpenUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir proveedor / AliExpress
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSmartApply}
                    disabled={smartApplyLoading || !smartRec}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50 transition-colors"
                  >
                    {smartApplyLoading ? 'Guardando…' : 'Guardar en la orden'}
                  </button>
                </div>
                {order.recommendedSupplierUrl ? (
                  <p className="text-[11px] text-emerald-800/70 dark:text-emerald-200/70">
                    URL guardada en la orden (puedes reemplazarla guardando de nuevo).
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {showManualFulfillmentPanel && (
          <div className="p-4 text-orange-950 dark:text-orange-100 bg-orange-50 dark:bg-orange-950/25 rounded-xl border border-orange-300 dark:border-orange-700 space-y-3">
            <p className="text-sm font-bold flex items-center gap-2">
              <Package className="w-4 h-4" />
              Acción requerida: pedido pendiente de fulfillment
            </p>
            {(order.failureReason || order.errorMessage) && (
              <p className="text-xs text-orange-900/90 dark:text-orange-200/90 whitespace-pre-wrap">
                {order.failureReason || order.errorMessage}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {(order.productUrl || '').trim() ? (
                <a
                  href={order.productUrl!.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir proveedor (AliExpress)
                </a>
              ) : (
                <span className="text-xs text-orange-800 dark:text-orange-200">Añade URL de proveedor arriba para abrir AliExpress.</span>
              )}
              <button
                type="button"
                onClick={handleCopyAddress}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-orange-300 dark:border-orange-700 text-orange-900 dark:text-orange-100 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
              >
                <ClipboardCopy className="w-4 h-4" />
                Copiar dirección
              </button>
              <button
                type="button"
                onClick={handleRetryAutomaticFromManual}
                disabled={manualRetryLoading || !(order.productUrl || '').trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${manualRetryLoading ? 'animate-spin' : ''}`} />
                Reintentar compra automática
              </button>
            </div>
            <div className="pt-3 border-t border-orange-200 dark:border-orange-800 space-y-2">
              <label className="text-xs font-medium text-orange-900 dark:text-orange-200">ID pedido AliExpress (opcional)</label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="ej. 8123456789012345"
                  value={manualSupplierOrderId}
                  onChange={(e) => setManualSupplierOrderId(e.target.value)}
                  className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleMarkManualPurchased}
                  disabled={manualMarkLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {manualMarkLoading ? 'Guardando…' : 'Marcar como comprado'}
                </button>
              </div>
              <p className="text-xs text-orange-800/80 dark:text-orange-200/80">
                Después de comprar manualmente en AliExpress, marca aquí para continuar el flujo (venta / tracking).
              </p>
            </div>
            {manualActionError && <p className="text-xs text-red-700 dark:text-red-300">{manualActionError}</p>}
          </div>
        )}

        <section className="border-t border-slate-100 dark:border-slate-800 pt-5">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Comprador y pago</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Comprador</dt>
              <dd className="mt-0.5 text-sm text-slate-900 dark:text-slate-100">{order.customerName}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Email</dt>
              <dd className="mt-0.5 text-sm text-slate-900 dark:text-slate-100">{order.customerEmail}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Importe</dt>
              <dd className="mt-0.5 text-sm text-slate-900 dark:text-slate-100">{formatCurrencySimple(order.price, order.currency)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Estado pago / fulfillment</dt>
              <dd className="mt-0.5"><OrderStatusBadge status={order.status} /></dd>
            </div>
          </dl>
        </section>

        {shippingObj && (
          <section className="border-t border-slate-100 dark:border-slate-800 pt-5">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Dirección de envío
            </h2>
            <div className="text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 font-mono leading-relaxed">
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
          <section className="border-t border-slate-100 dark:border-slate-800 pt-5">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" /> Seguimiento
            </h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {order.aliexpressOrderId && (
                <div>
                  <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Pedido AliExpress</dt>
                  <dd className="mt-0.5 text-sm font-mono text-slate-900 dark:text-slate-100">{order.aliexpressOrderId}</dd>
                </div>
              )}
              {order.sale?.trackingNumber && (
                <div>
                  <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Tracking</dt>
                  <dd className="mt-0.5 text-sm font-mono text-slate-900 dark:text-slate-100">{order.sale.trackingNumber}</dd>
                </div>
              )}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
