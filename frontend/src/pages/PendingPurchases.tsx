import { useState, useEffect } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrencySimple } from '../utils/currency';
import api from '@/services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface PendingSale {
  id: number;
  orderId: string;
  productId: number;
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
}

export default function PendingPurchases() {
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetchPendingPurchases();
  }, []);

  const fetchPendingPurchases = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/sales/pending-purchases');
      setPendingSales(response.data?.sales || response.data || []);
    } catch (error: any) {
      console.error('Error fetching pending purchases:', error);
      toast.error('Error al cargar compras pendientes');
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-3xl font-bold text-gray-900">Compras Pendientes</h1>
          <p className="text-gray-600 mt-1">Ventas que requieren compra manual en AliExpress</p>
        </div>
        <Button onClick={fetchPendingPurchases} variant="outline">
          Actualizar
        </Button>
      </div>

      {/* Capital Info Card */}
      {pendingSales.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Capital de Trabajo Disponible</p>
                <p className="text-2xl font-bold text-blue-900">
                  {formatCurrencySimple(pendingSales[0]?.availableCapital || 0, 'USD')}
                </p>
              </div>
              <DollarSign className="w-12 h-12 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Sales List */}
      {pendingSales.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">No hay compras pendientes</p>
              <p className="text-gray-500 text-sm mt-2">Todas las ventas están siendo procesadas automáticamente o ya fueron completadas</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pendingSales.map((sale) => (
            <Card key={sale.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="w-5 h-5" />
                      {sale.productTitle}
                    </CardTitle>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline">{sale.marketplace.toUpperCase()}</Badge>
                      <Badge variant="secondary">Orden: {sale.orderId}</Badge>
                      {getStatusBadge(sale.canPurchase)}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Precio de Venta</p>
                    <p className="text-xl font-bold text-green-600">
                      {formatCurrencySimple(sale.salePrice, 'USD')}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Información Financiera */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Información Financiera
                    </h3>
                    <div className="bg-gray-50 p-3 rounded space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Costo AliExpress:</span>
                        <span className="font-medium">{formatCurrencySimple(sale.aliexpressCost, 'USD')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Capital Requerido:</span>
                        <span className={`font-medium ${sale.canPurchase ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrencySimple(sale.requiredCapital, 'USD')}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Capital Disponible:</span>
                        <span className={`font-medium ${sale.canPurchase ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrencySimple(sale.availableCapital, 'USD')}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold pt-2 border-t">
                        <span className="text-gray-700">Ganancia Estimada:</span>
                        <span className="text-green-600">
                          {formatCurrencySimple(sale.salePrice - sale.aliexpressCost, 'USD')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Información del Comprador */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Información del Comprador
                    </h3>
                    <div className="bg-gray-50 p-3 rounded space-y-2">
                      {sale.buyerName && (
                        <div className="flex items-start gap-2 text-sm">
                          <User className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <span className="text-gray-600">Nombre: </span>
                            <span className="font-medium">{sale.buyerName}</span>
                          </div>
                        </div>
                      )}
                      {sale.buyerEmail && (
                        <div className="flex items-start gap-2 text-sm">
                          <Mail className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <span className="text-gray-600">Email: </span>
                            <span className="font-medium">{sale.buyerEmail}</span>
                          </div>
                        </div>
                      )}
                      {sale.shippingAddress && (
                        <div className="flex items-start gap-2 text-sm">
                          <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div className="flex-1">
                            <span className="text-gray-600">Dirección: </span>
                            <span className="font-medium break-words">
                              {typeof sale.shippingAddress === 'string' 
                                ? sale.shippingAddress 
                                : JSON.stringify(sale.shippingAddress)}
                            </span>
                          </div>
                        </div>
                      )}
                      {!sale.buyerName && !sale.buyerEmail && !sale.shippingAddress && (
                        <p className="text-sm text-gray-500 italic">Información del comprador no disponible</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4" />
                    <span>Venta realizada: {new Date(sale.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-2">
                    {sale.aliexpressUrl && (
                      <Button
                        variant="outline"
                        onClick={() => window.open(sale.aliexpressUrl, '_blank')}
                        className="flex items-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Ver en AliExpress
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
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800">Capital Insuficiente</p>
                      <p className="text-sm text-red-700 mt-1">
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

