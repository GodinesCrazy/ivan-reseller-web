/**
 * My Orders - Post-sale dropshipping orders
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Package, RefreshCw, ArrowRight, ExternalLink, Upload, X, Download, ClipboardCopy, ShoppingCart, Receipt } from 'lucide-react';
import api from '@/services/api';
import PageHeader from '@/components/ui/PageHeader';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrencySimple } from '@/utils/currency';
import { fetchOperationsTruthForProductIds } from '@/services/operationsTruth.api';
import type { OperationsTruthItem } from '@/types/operations';
import { lifecycleToneClasses, resolveOperationalLifecycleStage } from '@/utils/operational-lifecycle';
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
  const [truthByProduct, setTruthByProduct] = useState<Map<number, OperationsTruthItem>>(new Map());
  const [truthLoading, setTruthLoading] = useState(false);
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
        api
          .get<{ lastSyncAt?: string | null }>('/api/orders/sync-status')
          .catch(() => ({ data: {} as { lastSyncAt?: string | null } })),
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

  useEffect(() => {
    const productIds = Array.from(
      new Set(
        orders
          .map((order) => Number(order.productId))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    );
    if (productIds.length === 0) {
      setTruthByProduct(new Map());
      setTruthLoading(false);
      return;
    }
    let cancelled = false;
    setTruthLoading(true);
    fetchOperationsTruthForProductIds({ ids: productIds, environment })
      .then((data) => {
        if (cancelled) return;
        const next = new Map<number, OperationsTruthItem>();
        for (const item of data.items ?? []) {
          const pid = Number(item.productId);
          if (Number.isFinite(pid) && pid > 0) next.set(pid, item);
        }
        setTruthByProduct(next);
      })
      .catch(() => {
        if (!cancelled) setTruthByProduct(new Map());
      })
      .finally(() => {
        if (!cancelled) setTruthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orders, environment]);

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
  const tracedOrders = orders.filter((order) => {
    const pid = Number(order.productId);
    return Number.isFinite(pid) && truthByProduct.has(pid);
  }).length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Receipt}
        title="Ordenes / Envios"
        below={<CycleStepsBreadcrumb currentStep={6} />}
        subtitle={[
          'Compras al proveedor y seguimiento de envios',
          orders.length > 0 ? `trazabilidad: ${tracedOrders}/${orders.length}${truthLoading ? ' ...' : ''}` : null,
          lastSyncAt ? (() => {
            const mins = Math.round((Date.now() - new Date(lastSyncAt).getTime()) / 60000);
            return mins < 1 ? 'sincronizado ahora' : `sincronizado hace ${mins} min`;
          })() : null,
        ].filter(Boolean).join(' · ')}
        badge={
          hasManual ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              Accion manual requerida
            </span>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowFetchEbay((v) => !v)}>
              <Download className="w-3.5 h-3.5 mr-1" />
              Traer pedido eBay
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowImportEbay((v) => !v)}>
              <Upload className="w-3.5 h-3.5 mr-1" />
              Importar orden
            </Button>
            <Button variant="outline" size="sm" onClick={handleSyncMarketplace} disabled={syncingMarketplace}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncingMarketplace ? 'animate-spin' : ''}`} />
              Sincronizar
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchOrders}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />

      {/* Order status KPI strip */}
      {orders.length > 0 && (() => {
        const byStatus = orders.reduce<Record<string, number>>((acc, o) => {
          acc[o.status] = (acc[o.status] ?? 0) + 1;
          return acc;
        }, {});
        const paid = (byStatus['PAID'] ?? 0) + (byStatus['PURCHASING'] ?? 0);
        const purchased = byStatus['PURCHASED'] ?? 0;
        const failed = byStatus['FAILED'] ?? 0;
        const manual = manualQueueOrders.length;
        const strips = [
          { label: 'Pagadas / comprando', count: paid, tone: paid > 0 ? 'amber' : 'slate' },
          { label: 'Compradas', count: purchased, tone: purchased > 0 ? 'emerald' : 'slate' },
          { label: 'Fallidas', count: failed, tone: failed > 0 ? 'red' : 'slate' },
          { label: 'Acción manual', count: manual, tone: manual > 0 ? 'red' : 'slate' },
        ] as const;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {strips.map(({ label, count, tone }) => (
              <div key={label} className={`ir-panel p-3 ${
                tone === 'emerald' ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10' :
                tone === 'amber' ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-900/10' :
                tone === 'red' ? 'border-red-200 dark:border-red-800/50 bg-red-50/40 dark:bg-red-900/10' :
                ''
              }`}>
                <p className={`text-xl font-bold tabular-nums ${
                  tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' :
                  tone === 'amber' ? 'text-amber-700 dark:text-amber-300' :
                  tone === 'red' ? 'text-red-700 dark:text-red-300' :
                  'text-slate-900 dark:text-white'
                }`}>{count}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── CICLO DE DROPSHIPPING — CONTEXTO ─────────────────────────────────
           Muestra de forma explícita la etapa actual del ciclo: el cliente ya
           compró en el marketplace. Siguiente acción: comprar al proveedor. */}
      {orders.length > 0 && (() => {
        const pending = orders.filter((o) => o.status === 'PAID').length;
        const buying = orders.filter((o) => o.status === 'PURCHASING').length;
        const purchased = orders.filter((o) => o.status === 'PURCHASED').length;
        const failed = orders.filter((o) => o.status === 'FAILED' || o.status === 'FULFILLMENT_BLOCKED' || o.status === 'MANUAL_ACTION_REQUIRED').length;
        const stages = [
          { label: 'Listing activo',     step: 5, count: null as number | null,  tone: 'done',    nav: '/listings' },
          { label: 'Orden recibida',     step: 6, count: pending,                tone: pending > 0 ? 'active' : 'done', nav: null },
          { label: 'Compra proveedor',   step: 7, count: buying,                 tone: buying > 0 ? 'active' : 'idle',  nav: '/pending-purchases' },
          { label: 'Fulfillment',        step: 7, count: purchased,              tone: purchased > 0 ? 'done' : 'idle', nav: null },
          { label: 'Cierre / Envío',     step: 8, count: null as number | null,  tone: 'idle',    nav: '/sales' },
        ] as const;
        return (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2.5">
              Posición en el ciclo de dropshipping
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {stages.map((s, i) => (
                <span key={s.label} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-slate-300 dark:text-slate-600 select-none">→</span>}
                  {s.nav ? (
                    <button
                      type="button"
                      onClick={() => navigate(s.nav!)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors border ${
                        s.tone === 'active'
                          ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                          : s.tone === 'done'
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {s.label}
                      {s.count != null && s.count > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold">{s.count}</span>
                      )}
                    </button>
                  ) : (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium border ${
                      s.tone === 'active'
                        ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                        : s.tone === 'done'
                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}>
                      {s.label}
                      {s.count != null && s.count > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold">{s.count}</span>
                      )}
                    </span>
                  )}
                </span>
              ))}
              {failed > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                  ⚠ {failed} requiere acción manual
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {showFetchEbay && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Traer pedido desde eBay</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowFetchEbay(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Obtiene el pedido desde la API de eBay por ID y lo crea aquí; si está mapeado, se dispara la compra en AliExpress.</p>
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
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Usa el ID exacto del Centro de ventas de eBay (Administrar pedidos).</p>
              </div>
              <Button onClick={handleFetchEbayOrder} disabled={fetchingEbay || !fetchEbayOrderId.trim()}>
                {fetchingEbay ? 'Buscando...' : 'Traer pedido'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showImportEbay && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Importar orden eBay</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowImportEbay(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Si el webhook no creó la orden, impórtala aquí. Luego aparecerá en Compras pendientes o se cumplirá automáticamente.</p>
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
        <Card className="border-amber-400 dark:border-amber-600 bg-amber-50/80 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-amber-900 dark:text-amber-100 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Compras pendientes — acción manual requerida ({manualQueueOrders.length})
            </CardTitle>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Estas órdenes no pudieron completarse automáticamente. Causas posibles: fondos insuficientes, producto sin stock en AliExpress (SKU_NOT_EXIST), o error de API. Completa la compra manualmente en AliExpress y pulsa <strong>Marcar comprado</strong> o usa <strong>Reintentar auto</strong> si ya recargaste saldo.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-amber-200 dark:border-amber-800">
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Imagen</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Marketplace</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Comprador / dirección</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Importe</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Motivo / Proveedor</th>
                  <th className="py-2 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {manualQueueOrders.map((order) => {
                  const img = getFirstProductImageUrl(order);
                  const busy = manualActionId === order.id;
                  return (
                    <tr key={order.id} className="border-b border-amber-100 dark:border-amber-900/50">
                      <td className="py-2 pr-3 w-16">
                        {img ? (
                          <img src={img} alt="" className="w-14 h-14 object-cover rounded border border-amber-200 dark:border-amber-800" />
                        ) : (
                          <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/40 rounded flex items-center justify-center">
                            <Package className="w-6 h-6 text-amber-600" />
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {order.paypalOrderId?.startsWith('ebay:')
                            ? 'eBay'
                            : order.paypalOrderId?.startsWith('mercadolibre:')
                              ? 'Mercado Libre'
                              : order.paypalOrderId?.startsWith('amazon:')
                                ? 'Amazon'
                                : '—'}
                        </span>
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          {order.paypalOrderId?.startsWith('ebay:')
                            ? order.paypalOrderId.slice(5)
                            : order.id.slice(0, 10) + '…'}
                        </div>
                      </td>
                      <td className="py-2 pr-3 align-top max-w-[220px]">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{order.customerName || '—'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap mt-1">{formatOrderAddress(order)}</div>
                      </td>
                      <td className="py-2 pr-3 align-top whitespace-nowrap text-slate-700 dark:text-slate-300">{formatCurrencySimple(order.price, order.currency)}</td>
                      <td className="py-2 pr-3 align-top max-w-[200px]">
                        {/* Motivo del fallo */}
                        {(order.errorMessage || order.failureReason) && (() => {
                          const msg = order.errorMessage || order.failureReason || '';
                          const isInsufficientFunds = msg.includes('FAILED_INSUFFICIENT_FUNDS');
                          const isSkuError = msg.includes('SKU_NOT_EXIST') || msg.includes('PRODUCT_NOT_EXIST');
                          const label = isInsufficientFunds
                            ? '💰 Fondos insuficientes'
                            : isSkuError
                            ? '⚠ SKU no disponible'
                            : '⚠ Error de compra';
                          const badgeCls = isInsufficientFunds
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
                          return (
                            <span title={msg} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold mb-1.5 ${badgeCls}`}>
                              {label}
                            </span>
                          );
                        })()}
                        {/* Enlace proveedor */}
                        {(order.productUrl || '').trim() ? (
                          <a
                            href={order.productUrl!.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1 text-xs mt-0.5"
                          >
                            Abrir AliExpress <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-amber-700 dark:text-amber-400">Sin URL proveedor</span>
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
                            className="justify-start bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
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
        <div className="p-12 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
          <Package className="w-12 h-12 mx-auto mb-4 text-slate-400 dark:text-slate-500" />
          <p>Sin órdenes todavía</p>
          <p className="text-sm mt-2">Las órdenes aparecen aquí tras el checkout de una venta</p>
        </div>
      ) : (
        <div className="overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Orden / MP</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Producto</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Comprador</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Fulfillment</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ciclo</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Importe</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Fecha</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((order) => {
                const productId = Number(order.productId);
                const truth = Number.isFinite(productId) && productId > 0 ? truthByProduct.get(productId) ?? null : null;
                const lifecycle = resolveOperationalLifecycleStage({ operationsTruth: truth });
                const listingRef = truth?.listingId || order.marketplaceOrderId || '—';
                const fulfillmentState =
                  order.status === 'PURCHASED'
                    ? 'fulfilled'
                    : order.status === 'PURCHASING'
                      ? 'in_progress'
                      : order.status === 'MANUAL_ACTION_REQUIRED' || order.status === 'FULFILLMENT_BLOCKED'
                        ? 'manual_required'
                        : order.status === 'FAILED'
                          ? 'failed'
                          : order.status === 'PAID'
                            ? 'pending'
                            : 'n/a';
                const mpLabel = order.paypalOrderId?.startsWith('ebay:')
                  ? 'eBay'
                  : order.paypalOrderId?.startsWith('mercadolibre:')
                    ? 'ML'
                    : order.paypalOrderId?.startsWith('amazon:')
                      ? 'Amazon'
                      : 'Direct';
                const orderId = order.paypalOrderId?.startsWith('ebay:')
                  ? order.paypalOrderId.slice(5)
                  : order.paypalOrderId?.startsWith('mercadolibre:')
                    ? order.paypalOrderId.slice(13).split('-')[0]
                    : order.id.slice(0, 8) + '…';

                const fulfillPillMap: Record<string, { label: string; cls: string }> = {
                  fulfilled:       { label: '✓ Fulfillado',     cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
                  in_progress:     { label: '⏳ Comprando…',    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
                  manual_required: { label: '⚠ Acción Manual', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 font-semibold' },
                  failed:          { label: '✕ Fallido',        cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 font-semibold' },
                  pending:         { label: '→ Pend. Compra',   cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300' },
                  'n/a':           { label: '—',                cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
                };
                const fpill = fulfillPillMap[fulfillmentState] ?? fulfillPillMap['n/a'];
                const needsAction = fulfillmentState === 'manual_required' || fulfillmentState === 'failed';

                return (
                <tr key={order.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${needsAction ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
                  {/* Orden / MP */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        mpLabel === 'eBay' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                        mpLabel === 'ML'   ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>{mpLabel}</span>
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate max-w-[110px]">{orderId}</span>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </td>
                  {/* Producto */}
                  <td className="px-4 py-3 align-top max-w-[180px]">
                    {order.productId ? (
                      <button
                        onClick={() => navigate(`/products/${order.productId}/preview`)}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline text-left leading-snug line-clamp-2"
                      >
                        {order.title}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{order.title}</span>
                    )}
                  </td>
                  {/* Comprador */}
                  <td className="px-4 py-3 align-top text-xs text-slate-600 dark:text-slate-400">
                    {order.customerName || '—'}
                  </td>
                  {/* Fulfillment pill */}
                  <td className="px-4 py-3 align-top">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] ${fpill.cls}`}>
                      {fpill.label}
                    </span>
                    {needsAction && (
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">Requiere intervención</p>
                    )}
                  </td>
                  {/* Ciclo de vida */}
                  <td className="px-4 py-3 align-top text-xs">
                    <div className={`inline-flex rounded-full px-2 py-0.5 font-medium text-[11px] ${lifecycleToneClasses(lifecycle.tone)}`}>
                      {lifecycle.label}
                    </div>
                  </td>
                  {/* Importe */}
                  <td className="px-4 py-3 align-top text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrencySimple(order.price, order.currency)}
                  </td>
                  {/* Fecha */}
                  <td className="px-4 py-3 align-top text-xs text-slate-500 dark:text-slate-400">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  {/* Acciones */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        Ver <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                      {canRetryFulfill(order) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-amber-700 dark:text-amber-400"
                          onClick={() => handleRetryFulfill(order.id)}
                          disabled={retryingId === order.id}
                        >
                          <RefreshCw className={`w-3 h-3 mr-1 ${retryingId === order.id ? 'animate-spin' : ''}`} />
                          Reintentar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
