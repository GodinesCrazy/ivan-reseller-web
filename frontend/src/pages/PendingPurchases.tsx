import { useState, useEffect, useCallback } from 'react';
import { 
  ShoppingCart, 
  ExternalLink, 
  DollarSign,
  Package,
  AlertCircle,
  CheckCircle,
  Clock,
  MapPin,
  User,
  Mail,
  TrendingUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  const [processing, setProcessing] = useState<Record<number, boolean>>({});
  const [trackingInput, setTrackingInput] = useState<Record<string, string>>({});
  const [submittingTracking, setSubmittingTracking] = useState<Record<string, boolean>>({});

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

  const handlePurchaseNow = async (sale: PendingSale) => {
    try {
      setProcessing(prev => ({ ...prev, [sale.id]: true }));
      
      // Abrir AliExpress en nueva pestaña
      if (sale.aliexpressUrl) {
        window.open(sale.aliexpressUrl, '_blank');
      }
      
      // Marcar como procesando (opcional: actualizar estado en backend)
      toast.success('Abre AliExpress para realizar la compra. Recuerda usar la dirección del comprador.');
    } catch (error: any) {
      console.error('Error processing purchase:', error);
      toast.error('Error al procesar compra');
    } finally {
      setProcessing(prev => ({ ...prev, [sale.id]: false }));
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
      return <Badge variant="default" className="bg-green-100 text-green-800">Capital Disponible</Badge>;
    }
    return <Badge variant="destructive">Capital Insuficiente</Badge>;
  };

  if (loading) {
    return <LoadingSpinner text="Cargando compras pendientes..." />;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Orders to Fulfill</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Compras pendientes: ventas que requieren compra en AliExpress (o acción manual si el envío/etiqueta falló). Usa el enlace del proveedor y la dirección del comprador. Tras comprar, el seguimiento continúa en Órdenes.
          </p>
          {pendingSales.length > 0 && (
            <p className="text-amber-700 dark:text-amber-400 text-sm font-medium mt-1 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              Action required: {pendingSales.length} order{pendingSales.length !== 1 ? 's' : ''} pending fulfillment
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Datos actualizados en cada carga.</p>
          <p className="text-xs mt-1">
            <a href="/orders?import=ebay" className="text-amber-600 dark:text-amber-400 hover:underline">Importar orden eBay</a>
            {' '}si la venta no llegó por webhook.
          </p>
          <div className="mt-3">
            <CycleStepsBreadcrumb currentStep={5} />
          </div>
        </div>
        <Button onClick={fetchPendingPurchases} variant="outline">
          Actualizar
        </Button>
      </div>

      {/* Capital Info Card */}
      {pendingSales.length > 0 && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Capital de Trabajo Disponible</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {formatCurrencySimple(pendingSales[0]?.availableCapital || 0, 'USD')}
                </p>
              </div>
              <DollarSign className="w-12 h-12 text-blue-600 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Sales List */}
      {pendingSales.length === 0 ? (
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <ShoppingCart className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 text-lg">No hay compras pendientes</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Todas las ventas están siendo procesadas automáticamente o ya fueron completadas</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pendingSales.map((sale) => (
            <Card key={sale.id} className="hover:shadow-lg transition-shadow dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <Package className="w-5 h-5 flex-shrink-0" />
                      {sale.productId ? (
                        <button
                          onClick={() => navigate(`/products/${sale.productId}/preview`)}
                          className="text-left hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          {sale.productTitle}
                          <ExternalLink className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        </button>
                      ) : (
                        sale.productTitle
                      )}
                    </CardTitle>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{sale.marketplace.toUpperCase()}</Badge>
                      <Badge variant="secondary">Orden: {sale.orderId}</Badge>
                      <Badge variant="destructive" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Required action</Badge>
                      {sale.isFailedOrder && (
                        <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">Order failed — fulfill manually</Badge>
                      )}
                      {getStatusBadge(sale.canPurchase)}
                    </div>
                    {sale.isFailedOrder && sale.errorMessage && (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                        ⚠ {sale.errorMessage}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Precio de Venta</p>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400">
                      {formatCurrencySimple(sale.salePrice, 'USD')}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Información Financiera */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Información Financiera
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded space-y-1">
                      <div className="flex justify-between text-sm text-gray-900 dark:text-gray-100">
                        <span className="text-gray-600 dark:text-gray-400">Costo AliExpress:</span>
                        <span className="font-medium">{formatCurrencySimple(sale.aliexpressCost, 'USD')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Capital Requerido:</span>
                        <span className={`font-medium ${sale.canPurchase ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatCurrencySimple(sale.requiredCapital, 'USD')}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Capital Disponible:</span>
                        <span className={`font-medium ${sale.canPurchase ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatCurrencySimple(sale.availableCapital, 'USD')}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-200 dark:border-gray-600">
                        <span className="text-gray-700 dark:text-gray-300">Ganancia Estimada:</span>
                        <span className="text-green-600 dark:text-green-400">
                          {formatCurrencySimple(sale.salePrice - sale.aliexpressCost, 'USD')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Información del Comprador */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Información del Comprador
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded space-y-2">
                      {sale.buyerName && (
                        <div className="flex items-start gap-2 text-sm text-gray-900 dark:text-gray-100">
                          <User className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5" />
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Nombre: </span>
                            <span className="font-medium">{sale.buyerName}</span>
                          </div>
                        </div>
                      )}
                      {sale.buyerEmail && (
                        <div className="flex items-start gap-2 text-sm text-gray-900 dark:text-gray-100">
                          <Mail className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5" />
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Email: </span>
                            <span className="font-medium">{sale.buyerEmail}</span>
                          </div>
                        </div>
                      )}
                      {sale.shippingAddress && (
                        <div className="flex items-start gap-2 text-sm text-gray-900 dark:text-gray-100">
                          <MapPin className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5" />
                          <div className="flex-1">
                            <span className="text-gray-600 dark:text-gray-400">Dirección: </span>
                            <span className="font-medium break-words">
                              {typeof sale.shippingAddress === 'string' 
                                ? sale.shippingAddress 
                                : JSON.stringify(sale.shippingAddress)}
                            </span>
                          </div>
                        </div>
                      )}
                      {!sale.buyerName && !sale.buyerEmail && !sale.shippingAddress && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">Información del comprador no disponible</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Phase 41: Manual tracking — compré manualmente, enviar tracking */}
                {sale.orderId && (
                  <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Compré manualmente — enviar tracking</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Número de seguimiento"
                        value={trackingInput[sale.orderId] ?? ''}
                        onChange={(e) => setTrackingInput(prev => ({ ...prev, [sale.orderId]: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[180px]"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSubmitTracking(sale)}
                        disabled={submittingTracking[sale.orderId]}
                      >
                        {submittingTracking[sale.orderId] ? 'Enviando...' : 'Enviar tracking'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Clock className="w-4 h-4" />
                    <span>Venta realizada: {new Date(sale.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sale.orderId && (
                      <Button
                        variant="outline"
                        onClick={() => navigate(`/orders/${sale.orderId}`)}
                        className="flex items-center gap-2"
                      >
                        <Package className="w-4 h-4" />
                        Ver orden
                      </Button>
                    )}
                    {sale.aliexpressUrl && (
                      <Button
                        variant="outline"
                        onClick={() => window.open(sale.aliexpressUrl, '_blank')}
                        className="flex items-center gap-2"
                        title="Supplier link (clickable) — open in new tab"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Supplier link: AliExpress
                      </Button>
                    )}
                    <Button
                      onClick={() => handlePurchaseNow(sale)}
                      disabled={!sale.canPurchase || processing[sale.id]}
                      className="flex items-center gap-2"
                      variant={sale.canPurchase ? "default" : "destructive"}
                    >
                      {processing[sale.id] ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Procesando...
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-4 h-4" />
                          Realizar Compra Ahora
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Warning if capital insufficient */}
                {!sale.canPurchase && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">Capital Insuficiente</p>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">
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

