import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ShoppingCart, 
  ExternalLink, 
  DollarSign,
  Package,
  AlertCircle,
  Clock,
  MapPin,
  User,
  Mail,
  TrendingUp
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrencySimple } from '../utils/currency';
import api from '@/services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { fetchOperationsTruth } from '@/services/operationsTruth.api';
import type { OperationsTruthResponse } from '@/types/operations';
import OperationsTruthSummaryPanel from '@/components/OperationsTruthSummaryPanel';
import PostSaleProofLadderPanel from '@/components/PostSaleProofLadderPanel';

interface PendingSale {
  id: number | string;
  orderId: string;
  productId?: number;
  productTitle: string;
  productUrl: string;
  aliexpressUrl: string;
  marketplace: string;
  salePrice: number;
  aliexpressCost: number;
  buyerName?: string;
  buyerEmail?: string;
  shippingAddress?: string;
  createdAt: string;
  availableCapital: number;
  requiredCapital: number;
  canPurchase: boolean;
  /** Phase 39: true when this row is a FAILED order (manual fulfillment / ship-from fallback) */
  isFailedOrder?: boolean;
  errorMessage?: string;
}

export default function PendingPurchases() {
  const navigate = useNavigate();
  const { environment } = useEnvironment();
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [trackingInput, setTrackingInput] = useState<Record<string, string>>({});
  const [submittingTracking, setSubmittingTracking] = useState<Record<string, boolean>>({});
  const [operationsTruth, setOperationsTruth] = useState<OperationsTruthResponse | null>(null);

  const pendingProductIds = useMemo(() => {
    const ids = pendingSales
      .map((s) => (typeof s.productId === 'number' ? s.productId : Number(s.productId)))
      .filter((n) => Number.isFinite(n) && n > 0);
    return Array.from(new Set(ids)).slice(0, 50);
  }, [pendingSales]);

  useEffect(() => {
    if (pendingProductIds.length === 0) {
      setOperationsTruth(null);
      return;
    }
    let cancelled = false;
    fetchOperationsTruth({ ids: pendingProductIds, environment })
      .then((data) => {
        if (!cancelled) setOperationsTruth(data);
      })
      .catch(() => {
        if (!cancelled) setOperationsTruth(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pendingProductIds, environment]);

  const fetchPendingPurchases = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/sales/pending-purchases', { params: { environment } });
      setPendingSales(response.data?.sales || response.data || []);
    } catch (error: any) {
      console.error('Error fetching pending purchases:', error);
      const status = error?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error al cargar compras pendientes');
      }
    } finally {
      setLoading(false);
    }
  }, [environment]);

  useLiveData({ fetchFn: fetchPendingPurchases, intervalMs: 10000, enabled: true });
  useNotificationRefetch({
    handlers: { SALE_CREATED: fetchPendingPurchases },
    enabled: true,
  });

  const saleRowKey = (sale: PendingSale) => String(sale.id);

  const handlePurchaseNow = async (sale: PendingSale) => {
    const rowKey = saleRowKey(sale);
    try {
      setProcessing((prev) => ({ ...prev, [rowKey]: true }));
      
      if (sale.aliexpressUrl) {
        window.open(sale.aliexpressUrl, '_blank');
      }
      
      toast.success('Abre AliExpress para realizar la compra. Recuerda usar la dirección del comprador.');
    } catch (error: any) {
      console.error('Error processing purchase:', error);
      toast.error('Error al procesar compra');
    } finally {
      setProcessing((prev) => ({ ...prev, [rowKey]: false }));
    }
  };

  const handleSubmitTracking = async (sale: PendingSale) => {
    const orderId = sale.orderId;
    const tracking = (trackingInput[orderId] || '').trim();
    if (!tracking) {
      toast.error('Escribe el número de seguimiento');
      return;
    }
    try {
      setSubmittingTracking(prev => ({ ...prev, [orderId]: true }));
      await api.post(`/api/orders/${orderId}/submit-tracking`, { trackingNumber: tracking });
      toast.success('Tracking enviado. La orden y la venta se actualizaron.');
      setTrackingInput(prev => ({ ...prev, [orderId]: '' }));
      await fetchPendingPurchases();
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'Error al enviar tracking';
      toast.error(msg);
    } finally {
      setSubmittingTracking(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const getStatusBadge = (canPurchase: boolean) => {
    if (canPurchase) {
      return <Badge variant="success">Capital disponible</Badge>;
    }
    return <Badge variant="destructive">Capital insuficiente</Badge>;
  };

  if (loading) {
    return <LoadingSpinner text="Cargando compras pendientes..." />;
  }

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Compras Pendientes</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ventas que requieren compra en proveedor · proof ladder en{' '}
            <Link to="/control-center" className="text-primary-600 dark:text-primary-400 hover:underline">Control Center</Link>
            {' '}·{' '}
            <Link to="/orders?import=ebay" className="text-amber-600 dark:text-amber-400 hover:underline">Importar orden eBay</Link>
          </p>
          {pendingSales.length > 0 && (
            <p className="text-amber-700 dark:text-amber-400 text-xs font-medium mt-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {pendingSales.length} orden{pendingSales.length !== 1 ? 'es' : ''} pendiente{pendingSales.length !== 1 ? 's' : ''} de fulfillment
            </p>
          )}
          <div className="mt-3">
            <CycleStepsBreadcrumb currentStep={5} />
          </div>
        </div>
        <Button onClick={fetchPendingPurchases} variant="outline" size="sm">
          Actualizar
        </Button>
      </div>

      {/* Operations truth panels */}
      {operationsTruth && pendingProductIds.length > 0 && (
        <div className="space-y-4">
          <OperationsTruthSummaryPanel data={operationsTruth} />
          <PostSaleProofLadderPanel
            summary={operationsTruth.summary.proofCounts}
            title="Proof ladder (muestra de productos en esta cola)"
            subtitle="Cada fila sigue siendo acción de compra en proveedor; el ladder resume pruebas registradas en backend."
          />
        </div>
      )}

      {/* Capital summary card */}
      {pendingSales.length > 0 && (
        <Card className="bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Capital de trabajo disponible</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                  {formatCurrencySimple(pendingSales[0]?.availableCapital || 0, 'USD')}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Sales List */}
      {pendingSales.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <div className="text-center py-16">
              <div className="mx-auto h-14 w-14 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <ShoppingCart className="w-7 h-7 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No hay compras pendientes</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Todas las ventas están siendo procesadas automáticamente o ya fueron completadas
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pendingSales.map((sale) => (
            <Card key={sale.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Package className="w-4 h-4 flex-shrink-0 text-slate-400" />
                      {sale.productId ? (
                        <button
                          onClick={() => navigate(`/products/${sale.productId}/preview`)}
                          className="text-left hover:text-primary-600 dark:hover:text-primary-400 hover:underline flex items-center gap-1 truncate"
                        >
                          {sale.productTitle}
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                        </button>
                      ) : (
                        <span className="truncate">{sale.productTitle}</span>
                      )}
                    </CardTitle>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline">{sale.marketplace.toUpperCase()}</Badge>
                      <Badge variant="secondary">Orden: {sale.orderId}</Badge>
                      <Badge variant="warning">Acción requerida</Badge>
                      {sale.isFailedOrder && (
                        <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">Orden fallida — fulfillment manual</Badge>
                      )}
                      {getStatusBadge(sale.canPurchase)}
                    </div>
                    {sale.isFailedOrder && sale.errorMessage && (
                      <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                        ⚠ {sale.errorMessage}
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Precio de venta</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {formatCurrencySimple(sale.salePrice, 'USD')}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Fulfillment action */}
                  <div className="space-y-1.5 md:order-1">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      Fulfillment — siguiente acción
                    </h3>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Compra en proveedor pendiente o requiere envío de tracking. Los detalles de bloqueo y prueba están en la orden y en Control Center.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {sale.orderId && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/orders/${sale.orderId}`)}
                          >
                            Abrir orden
                          </Button>
                        )}
                        {sale.aliexpressUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(sale.aliexpressUrl, '_blank')}
                          >
                            Enlace proveedor
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Buyer info */}
                  <div className="space-y-1.5 md:order-2">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      Información del comprador
                    </h3>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                      {sale.buyerName && (
                        <div className="flex items-start gap-2 text-xs text-slate-900 dark:text-slate-100">
                          <User className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Nombre: </span>
                            <span className="font-medium">{sale.buyerName}</span>
                          </div>
                        </div>
                      )}
                      {sale.buyerEmail && (
                        <div className="flex items-start gap-2 text-xs text-slate-900 dark:text-slate-100">
                          <Mail className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Email: </span>
                            <span className="font-medium">{sale.buyerEmail}</span>
                          </div>
                        </div>
                      )}
                      {sale.shippingAddress && (
                        <div className="flex items-start gap-2 text-xs text-slate-900 dark:text-slate-100">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <span className="text-slate-500 dark:text-slate-400">Dirección: </span>
                            <span className="font-medium break-words">
                              {typeof sale.shippingAddress === 'string' 
                                ? sale.shippingAddress 
                                : JSON.stringify(sale.shippingAddress)}
                            </span>
                          </div>
                        </div>
                      )}
                      {!sale.buyerName && !sale.buyerEmail && !sale.shippingAddress && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">Información del comprador no disponible</p>
                      )}
                    </div>
                  </div>

                  {/* Cost reference */}
                  <div className="space-y-1.5 md:col-span-2 md:order-3">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Referencia de costos y capital (no es ganancia realizada)
                    </h3>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="flex justify-between text-xs text-slate-900 dark:text-slate-100">
                        <span className="text-slate-500 dark:text-slate-400">Costo proveedor (ref.):</span>
                        <span className="font-medium">{formatCurrencySimple(sale.aliexpressCost, 'USD')}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">Capital requerido:</span>
                        <span className={`font-medium ${sale.canPurchase ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatCurrencySimple(sale.requiredCapital, 'USD')}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">Capital disponible:</span>
                        <span className={`font-medium ${sale.canPurchase ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatCurrencySimple(sale.availableCapital, 'USD')}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                        <span>Margen bruto referencial (venta − coste proveedor):</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {formatCurrencySimple(sale.salePrice - sale.aliexpressCost, 'USD')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                        No sustituye proof de compra en proveedor ni fondos liberados. Usa la orden enlazada para el estado real.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Manual tracking submission */}
                {sale.orderId && (
                  <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Enviar tracking manual</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Número de seguimiento"
                        value={trackingInput[sale.orderId] ?? ''}
                        onChange={(e) => setTrackingInput(prev => ({ ...prev, [sale.orderId]: e.target.value }))}
                        className="h-8 px-3 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:focus:ring-offset-slate-900"
                      />
                      <Button
                        onClick={() => handleSubmitTracking(sale)}
                        disabled={submittingTracking[sale.orderId]}
                        size="sm"
                      >
                        {submittingTracking[sale.orderId] ? 'Enviando...' : 'Enviar tracking'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Actions footer */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Venta: {new Date(sale.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sale.orderId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/orders/${sale.orderId}`)}
                      >
                        <Package className="w-3.5 h-3.5 mr-1.5" />
                        Ver orden
                      </Button>
                    )}
                    {sale.aliexpressUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(sale.aliexpressUrl, '_blank')}
                        title="Abrir enlace del proveedor en nueva pestaña"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Enlace proveedor
                      </Button>
                    )}
                    <Button
                      onClick={() => handlePurchaseNow(sale)}
                      disabled={!sale.canPurchase || processing[saleRowKey(sale)]}
                      size="sm"
                      variant={sale.canPurchase ? "default" : "destructive"}
                    >
                      {processing[saleRowKey(sale)] ? (
                        <>
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white mr-1.5"></div>
                          Procesando...
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                          Realizar compra
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Capital insufficient warning */}
                {!sale.canPurchase && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-red-800 dark:text-red-200">Capital insuficiente</p>
                      <p className="text-[11px] text-red-700 dark:text-red-300 mt-0.5">
                        Necesitas {formatCurrencySimple(sale.requiredCapital - sale.availableCapital, 'USD')} adicionales 
                        para realizar esta compra. Actualiza tu capital de trabajo en Configuración.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
