/**
 * My Orders - Post-sale dropshipping orders
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Package, RefreshCw, ArrowRight, ExternalLink, Upload, X, Download, ClipboardCopy, ShoppingCart } from 'lucide-react';
import api from '@/services/api';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrencySimple } from '@/utils/currency';
import {
  retryOrderFulfill,
  importEbayOrder,
  fetchEbayOrder,
  markManualPurchased,
  retryAutomaticFulfillment,
  type Order,
} from '@/services/orders.api';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import toast from 'react-hot-toast';

export default function Orders() {
  const { environment } = useEnvironment();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [showImportEbay, setShowImportEbay] = useState(false);
  const [showFetchEbay, setShowFetchEbay] = useState(false);
  const [fetchEbayOrderId, setFetchEbayOrderId] = useState('');
  const [fetchingEbay, setFetchingEbay] = useState(false);
  const [syncingMarketplace, setSyncingMarketplace] = useState(false);
  const [manualActionId, setManualActionId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importForm, setImportForm] = useState({
    ebayOrderId: '',
    listingId: '',
    amount: '',
    buyerName: '',
    buyerEmail: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    productId: '',
  });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('import') === 'ebay') setShowImportEbay(true);
  }, [searchParams]);

  function getFirstProductImageUrl(order: Order): string | null {
    try {
      const raw = order.product?.images;
      if (!raw) return null;
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr) && typeof arr[0] === 'string') return arr[0];
    } catch {
      /* ignore */
    }
    return null;
  }

  function formatOrderAddress(order: Order): string {
    try {
      const parsed = JSON.parse(order.shippingAddress || '{}') as Record<string, string>;
      if (parsed && typeof parsed === 'object') {
        return [
          parsed.fullName || order.customerName,
          [parsed.addressLine1, parsed.addressLine2].filter(Boolean).join(', '),
          [parsed.city, parsed.state, parsed.zipCode].filter(Boolean).join(', '),
          parsed.country || '',
        ]
          .filter(Boolean)
          .join('\n');
      }
    } catch {
      /* ignore */
    }
    return order.shippingAddress || '';
  }

  const manualQueueOrders = orders.filter(
    (o) => o.status === 'MANUAL_ACTION_REQUIRED' || o.status === 'FULFILLMENT_BLOCKED' || o.manualFulfillmentRequired
  );

  const handleCopyOrderAddress = async (order: Order) => {
    try {
      await navigator.clipboard.writeText(formatOrderAddress(order));
      toast.success('Dirección copiada');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const handleMarkManualQuick = async (orderId: string) => {
    setManualActionId(orderId);
    try {
      await markManualPurchased(orderId, {});
      toast.success('Marcado como comprado');
      await fetchOrders();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || 'Error');
    } finally {
      setManualActionId(null);
    }
  };

  const handleRetryAutoFromList = async (orderId: string) => {
    setManualActionId(orderId);
    try {
      await retryAutomaticFulfillment(orderId);
      toast.success('Reintento lanzado; actualiza si no ves cambios.');
      await fetchOrders();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || 'Error');
    } finally {
      setManualActionId(null);
    }
  };

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

  /** Phase 44: Client-side safety — never render test/demo/mock orders. */
  const isRealOrder = (o: Order) => {
    const pid = (o.paypalOrderId || '').trim();
    if (!pid) return true;
    const fake = /^(TEST|DEMO|MOCK|SIM_|ORD-TEST|test|demo|mock)/i;
    return !fake.test(pid);
  };

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [ordersRes, syncRes] = await Promise.all([
        api.get<Order[]>('/api/orders', { params: { environment } }),
        api.get<{ lastSyncAt?: string | null }>('/api/orders/sync-status').catch(() => ({ data: {} })),
      ]);
      const raw = ordersRes.data || [];
      setOrders(raw.filter(isRealOrder));
      setLastSyncAt(syncRes?.data?.lastSyncAt ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Error al cargar órdenes');
    } finally {
      setLoading(false);
    }
  }, [environment]);

  const handleImportEbay = async () => {
    const amount = parseFloat(importForm.amount);
    if (!importForm.ebayOrderId.trim()) {
      toast.error('eBay Order ID es obligatorio');
      return;
    }
    if (!isFinite(amount) || amount <= 0) {
      toast.error('Importe debe ser un número positivo');
      return;
    }
    const listingId = importForm.listingId.trim() || undefined;
    const productId = importForm.productId ? parseInt(importForm.productId, 10) : undefined;
    if (!listingId && !productId) {
      toast.error('Indica Listing ID / Item ID de eBay o Product ID interno');
      return;
    }
    setImporting(true);
    try {
      const result = await importEbayOrder({
        ebayOrderId: importForm.ebayOrderId.trim(),
        listingId: listingId || undefined,
        itemId: listingId || undefined,
        amount,
        buyerName: importForm.buyerName.trim() || undefined,
        buyerEmail: importForm.buyerEmail.trim() || undefined,
        shippingAddress: {
          fullName: importForm.buyerName.trim() || undefined,
          addressLine1: importForm.addressLine1.trim() || undefined,
          addressLine2: importForm.addressLine2.trim() || undefined,
          city: importForm.city.trim() || undefined,
          state: importForm.state.trim() || undefined,
          zipCode: importForm.zipCode.trim() || undefined,
          country: importForm.country.trim() || 'US',
        },
        productId: Number.isNaN(productId) ? undefined : productId,
      });
      toast.success(result.created ? 'Orden eBay importada. Aparecerá en Compras pendientes o se cumplirá automáticamente.' : 'La orden ya existía.');
      setShowImportEbay(false);
      setImportForm({ ebayOrderId: '', listingId: '', amount: '', buyerName: '', buyerEmail: '', addressLine1: '', addressLine2: '', city: '', state: '', zipCode: '', country: 'US', productId: '' });
      await fetchOrders();
      if (result.order?.id) navigate(`/orders/${result.order.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Error al importar');
    } finally {
      setImporting(false);
    }
  };

  const handleFetchEbayOrder = async () => {
    const id = fetchEbayOrderId.trim();
    if (!id) {
      toast.error('Indica el ID del pedido eBay');
      return;
    }
    setFetchingEbay(true);
    try {
      const result = await fetchEbayOrder(id);
      if (result.created) {
        toast.success(result.fulfilled ? 'Pedido traído y compra en AliExpress iniciada.' : 'Pedido traído; revisa Compras pendientes si requiere mapeo.');
      } else {
        toast.success('El pedido ya estaba en el sistema.');
      }
      setShowFetchEbay(false);
      setFetchEbayOrderId('');
      await fetchOrders();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Error al traer pedido desde eBay');
    } finally {
      setFetchingEbay(false);
    }
  };

  /** Phase 44: Force sync with eBay, Mercado Libre and Amazon — fetch real orders now. */
  const handleSyncMarketplace = async () => {
    setSyncingMarketplace(true);
    try {
      const res = await api.post<{
        ok: boolean;
        totalFetched?: number;
        totalCreated?: number;
        noEbayCredentials?: boolean;
        noMercadoLibreCredentials?: boolean;
        noAmazonCredentials?: boolean;
        syncErrors?: string[];
        results?: Array<{ marketplace?: string; fetched?: number; created?: number; createdUnmapped?: number; errors?: string[] }>;
      }>('/api/orders/sync-marketplace');
      if (res.data?.ok) {
        const totalCreated = res.data.totalCreated ?? res.data.results?.reduce((s, r) => s + (r.created ?? 0) + (r.createdUnmapped ?? 0), 0) ?? 0;
        const noEbay = res.data.noEbayCredentials;
        const noML = res.data.noMercadoLibreCredentials;
        const noAmazon = res.data.noAmazonCredentials;
        const anyNoCreds = noEbay || noML || noAmazon;

        if (totalCreated > 0) {
          toast.success(`Sincronizado. ${totalCreated} orden(es) nueva(s) traída(s).`);
        } else if (anyNoCreds) {
          const parts: string[] = [];
          if (noEbay) parts.push('eBay');
          if (noML) parts.push('Mercado Libre');
          if (noAmazon) parts.push('Amazon');
          toast.success(`Sincronización completada. Para traer pedidos de ${parts.join(', ')}, conecta las cuentas en Ajustes → APIs.`);
        } else {
          toast.success('Sincronizado. No había órdenes nuevas.');
        }
      }
      await fetchOrders();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Error al sincronizar');
    } finally {
      setSyncingMarketplace(false);
    }
  };

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
  const hasManual = manualQueueOrders.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Órdenes / Envíos</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFetchEbay((v) => !v)}>
              <Download className="w-4 h-4 mr-1" />
              Traer pedido desde eBay
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowImportEbay((v) => !v)}>
              <Upload className="w-4 h-4 mr-1" />
              Importar orden eBay
            </Button>
            <Button variant="outline" size="sm" onClick={handleSyncMarketplace} disabled={syncingMarketplace}>
              <RefreshCw className={`w-4 h-4 mr-1 ${syncingMarketplace ? 'animate-spin' : ''}`} />
              Sincronizar pedidos
            </Button>
            <button
              onClick={fetchOrders}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <RefreshCw className="w-4 h-4" />
              Actualizar
            </button>
          </div>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-0.5">
          Órdenes de compra al proveedor y seguimiento de envíos. Estado real desde backend — sin éxito simulado. Para proof ladder (compra en proveedor, fondos liberados), usa{' '}
          <Link to="/control-center" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            Control Center
          </Link>
          {' '}y el detalle de cada orden.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Solo se muestran órdenes reales (eBay, Mercado Libre, Amazon). Datos actualizados en cada carga.
          {lastSyncAt && (
            <> · Última sincronización: {(() => {
              const mins = Math.round((Date.now() - new Date(lastSyncAt).getTime()) / 60000);
              if (mins < 1) return 'ahora mismo';
              if (mins === 1) return 'hace 1 min';
              return `hace ${mins} min`;
            })()}</>
          )}
        </p>
        {(hasFailed || hasManual) && (
          <p className="text-xs mt-1">
            {hasFailed && (
              <a href="/dashboard" className="text-amber-600 dark:text-amber-400 hover:underline">Ver alertas en Panel</a>
            )}
            {hasFailed && hasManual && ' · '}
            {hasManual && <span className="text-orange-600 dark:text-orange-400 font-medium">Hay pedidos que requieren compra manual en AliExpress.</span>}
          </p>
        )}
        <div className="mt-3">
          <CycleStepsBreadcrumb currentStep={6} />
        </div>
      </div>

      {showFetchEbay && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Traer pedido desde eBay</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowFetchEbay(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Obtiene el pedido desde la API de eBay por ID y lo crea aquí; si está mapeado, se dispara la compra en AliExpress.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px]">
                <Label>ID del pedido eBay</Label>
                <Input
                  placeholder="ej. 17-11370-63716"
                  value={fetchEbayOrderId}
                  onChange={(e) => setFetchEbayOrderId(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Usa el ID exacto del Centro de ventas de eBay (Administrar pedidos).</p>
              </div>
              <Button onClick={handleFetchEbayOrder} disabled={fetchingEbay || !fetchEbayOrderId.trim()}>
                {fetchingEbay ? 'Buscando...' : 'Traer pedido'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showImportEbay && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Importar orden eBay</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowImportEbay(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Si el webhook no creó la orden, impórtala aquí. Luego aparecerá en Compras pendientes o se cumplirá automáticamente.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>eBay Order ID *</Label>
                <Input
                  placeholder="ej. 17-14370-63716"
                  value={importForm.ebayOrderId}
                  onChange={(e) => setImportForm((f) => ({ ...f, ebayOrderId: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Listing ID / Item ID (eBay)</Label>
                <Input
                  placeholder="ID del ítem en eBay"
                  value={importForm.listingId}
                  onChange={(e) => setImportForm((f) => ({ ...f, listingId: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Product ID (interno, si no hay listing)</Label>
                <Input
                  type="number"
                  placeholder="ID del producto en la app"
                  value={importForm.productId}
                  onChange={(e) => setImportForm((f) => ({ ...f, productId: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Importe (USD) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="56.42"
                  value={importForm.amount}
                  onChange={(e) => setImportForm((f) => ({ ...f, amount: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Comprador (nombre)</Label>
                <Input
                  placeholder="Jenuin Santana Navarro"
                  value={importForm.buyerName}
                  onChange={(e) => setImportForm((f) => ({ ...f, buyerName: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Email comprador</Label>
                <Input
                  type="email"
                  placeholder="buyer@example.com"
                  value={importForm.buyerEmail}
                  onChange={(e) => setImportForm((f) => ({ ...f, buyerEmail: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dirección de envío</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  placeholder="Calle y número"
                  value={importForm.addressLine1}
                  onChange={(e) => setImportForm((f) => ({ ...f, addressLine1: e.target.value }))}
                />
                <Input
                  placeholder="Ciudad"
                  value={importForm.city}
                  onChange={(e) => setImportForm((f) => ({ ...f, city: e.target.value }))}
                />
                <Input
                  placeholder="Estado / PR"
                  value={importForm.state}
                  onChange={(e) => setImportForm((f) => ({ ...f, state: e.target.value }))}
                />
                <Input
                  placeholder="Código postal"
                  value={importForm.zipCode}
                  onChange={(e) => setImportForm((f) => ({ ...f, zipCode: e.target.value }))}
                />
                <Input
                  placeholder="País (US)"
                  value={importForm.country}
                  onChange={(e) => setImportForm((f) => ({ ...f, country: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleImportEbay} disabled={importing}>
                {importing ? 'Importando...' : 'Importar orden'}
              </Button>
              <Button variant="outline" onClick={() => setShowImportEbay(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="p-4 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">{error}</div>
      )}

      {manualQueueOrders.length > 0 && (
        <Card className="border-orange-400 dark:border-orange-600 bg-orange-50/80 dark:bg-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-orange-900 dark:text-orange-100">
              Pedidos para cumplir manualmente (AliExpress)
            </CardTitle>
            <p className="text-sm text-orange-800 dark:text-orange-200">
              La API no pudo comprar automáticamente (p. ej. SKU_NOT_EXIST). Completa la compra en AliExpress y marca el estado.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-orange-200 dark:border-orange-800">
                  <th className="py-2 pr-3">Imagen</th>
                  <th className="py-2 pr-3">Marketplace</th>
                  <th className="py-2 pr-3">Comprador / dirección</th>
                  <th className="py-2 pr-3">Importe</th>
                  <th className="py-2 pr-3">Proveedor</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {manualQueueOrders.map((order) => {
                  const img = getFirstProductImageUrl(order);
                  const busy = manualActionId === order.id;
                  return (
                    <tr key={order.id} className="border-b border-orange-100 dark:border-orange-900/50">
                      <td className="py-2 pr-3 w-16">
                        {img ? (
                          <img src={img} alt="" className="w-14 h-14 object-cover rounded border border-orange-200 dark:border-orange-800" />
                        ) : (
                          <div className="w-14 h-14 bg-orange-100 dark:bg-orange-900/40 rounded flex items-center justify-center">
                            <Package className="w-6 h-6 text-orange-600" />
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <span className="font-medium">
                          {order.paypalOrderId?.startsWith('ebay:')
                            ? 'eBay'
                            : order.paypalOrderId?.startsWith('mercadolibre:')
                              ? 'Mercado Libre'
                              : order.paypalOrderId?.startsWith('amazon:')
                                ? 'Amazon'
                                : '—'}
                        </span>
                        <div className="text-xs font-mono text-gray-600 dark:text-gray-400 mt-0.5">
                          {order.paypalOrderId?.startsWith('ebay:')
                            ? order.paypalOrderId.slice(5)
                            : order.id.slice(0, 10) + '…'}
                        </div>
                      </td>
                      <td className="py-2 pr-3 align-top max-w-[220px]">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{order.customerName || '—'}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap mt-1">{formatOrderAddress(order)}</div>
                      </td>
                      <td className="py-2 pr-3 align-top whitespace-nowrap">{formatCurrencySimple(order.price, order.currency)}</td>
                      <td className="py-2 pr-3 align-top">
                        {(order.productUrl || '').trim() ? (
                          <a
                            href={order.productUrl!.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                          >
                            AliExpress <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-amber-700">Sin URL</span>
                        )}
                      </td>
                      <td className="py-2 align-top">
                        <div className="flex flex-col gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="justify-start"
                            disabled={!(order.productUrl || '').trim()}
                            onClick={() => (order.productUrl || '').trim() && window.open(order.productUrl!.trim(), '_blank', 'noopener,noreferrer')}
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1" />
                            Abrir proveedor
                          </Button>
                          <Button variant="outline" size="sm" className="justify-start" onClick={() => handleCopyOrderAddress(order)}>
                            <ClipboardCopy className="w-3.5 h-3.5 mr-1" />
                            Copiar dirección
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            className="justify-start bg-green-600 hover:bg-green-700"
                            disabled={busy}
                            onClick={() => handleMarkManualQuick(order.id)}
                          >
                            <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                            Marcar comprado
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="justify-start"
                            disabled={busy || !(order.productUrl || '').trim()}
                            onClick={() => handleRetryAutoFromList(order.id)}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${busy ? 'animate-spin' : ''}`} />
                            Reintentar auto
                          </Button>
                          <Button variant="ghost" size="sm" className="justify-start h-7" onClick={() => navigate(`/orders/${order.id}`)}>
                            Detalle <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Marketplace</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Título</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Comprador</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Importe</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fecha</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-gray-100">
                    {order.paypalOrderId?.startsWith('ebay:')
                      ? order.paypalOrderId.slice(5)
                      : order.paypalOrderId?.startsWith('mercadolibre:')
                        ? order.paypalOrderId.slice(13).split('-')[0]
                        : order.id.slice(0, 8) + '…'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {order.paypalOrderId?.startsWith('ebay:') ? 'eBay' : order.paypalOrderId?.startsWith('mercadolibre:') ? 'Mercado Libre' : order.paypalOrderId?.startsWith('amazon:') ? 'Amazon' : 'Checkout'}
                  </td>
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
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{order.customerName || '—'}</td>
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
