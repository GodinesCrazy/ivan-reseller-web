import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Package,
  Filter,
  Search,
  Eye,
  ExternalLink,
  Download,
  Calendar,
  MapPin
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import KpiCard from '@/components/ui/KpiCard';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrencySimple } from '../utils/currency';
import WorkflowStatusIndicator from '@/components/WorkflowStatusIndicator';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import { useEnvironment } from '@/contexts/EnvironmentContext';

interface Sale {
  id: string;
  orderId: string;
  productId?: number;
  productTitle: string;
  productImage?: string; // Phase 40: product image URL
  marketplace: string;
  source?: string; // Phase 40: eBay / ML / Amazon
  buyerName: string;
  buyerEmail?: string;
  shippingAddress?: string;
  salePrice: number;
  cost: number;
  profit: number;
  commission: number;
  marketplaceFee?: number;
  grossProfit?: number;
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  trackingNumber?: string;
  createdAt: string;
  /** eBay Order ID when sale is from eBay (paypalOrderId ebay:xxx) */
  ebayOrderId?: string;
  /** Mercado Libre order ID when sale is from ML (paypalOrderId mercadolibre:xxx) */
  mercadolibreOrderId?: string;
  /** Amazon order ID when sale is from Amazon (paypalOrderId amazon:xxx) */
  amazonOrderId?: string;
  /** completed | pending_purchase | needs_mapping | failed | unknown */
  fulfillmentAutomationStatus?: string;
  fulfillmentErrorReason?: string;
  needsProductMapping?: boolean;
  syncNote?: string;
}

interface SalesStats {
  totalRevenue: number;
  totalProfit: number;
  totalSales: number;
  avgOrderValue: number;
  revenueChange: number;
  profitChange: number;
  completedSales?: number;
  completedRevenue?: number;
  completedProfit?: number;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const MARKETPLACES = [
  { id: 'ebay', label: 'eBay' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'mercadolibre', label: 'Mercado Libre' },
  { id: 'checkout', label: 'Checkout' },
] as const;

function AutomationBadge({ sale }: { sale: Sale }) {
  const status = sale.fulfillmentAutomationStatus || (sale.needsProductMapping ? 'needs_mapping' : undefined);
  if (!status || status === 'unknown') return <span className="text-xs text-slate-400">—</span>;
  if (status === 'completed') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Automatización: Completada (AliExpress)</Badge>;
  if (status === 'pending_purchase') return <Badge variant="outline" className="text-amber-600 dark:text-amber-400">Pendiente compra</Badge>;
  if (status === 'needs_mapping') return <Badge variant="outline" className="text-blue-600 dark:text-blue-400">Requiere mapeo producto</Badge>;
  if (status === 'failed') return <Badge variant="destructive" title={sale.fulfillmentErrorReason || sale.syncNote}>Fallida{sale.fulfillmentErrorReason ? `: ${sale.fulfillmentErrorReason.slice(0, 40)}…` : ''}</Badge>;
  return <span className="text-xs text-slate-500">{status}</span>;
}

export default function Sales() {
  const navigate = useNavigate();
  const { environment } = useEnvironment();
  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState<SalesStats>({
    totalRevenue: 0,
    totalProfit: 0,
    totalSales: 0,
    avgOrderValue: 0,
    revenueChange: 0,
    profitChange: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState('30');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const fetchSalesData = useCallback(async () => {
    try {
      setLoading(true);
      const [salesResponse, statsResponse, syncResponse] = await Promise.all([
        api.get('/api/sales', { params: { environment } }),
        api.get('/api/sales/stats', { params: { days: dateRange, environment } }),
        api.get('/api/sales/sync-status').catch(() => ({ data: {} })),
      ]);
      setSales(salesResponse.data?.sales || salesResponse.data || []);
      setStats(statsResponse.data || {});
      setLastSyncAt(syncResponse?.data?.lastSyncAt ?? null);
    } catch (error: any) {
      console.error('Error fetching sales:', error);
      const status = error?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error al cargar ventas');
      }
    } finally {
      setLoading(false);
    }
  }, [dateRange, environment]);

  useEffect(() => {
    fetchSalesData();
  }, [fetchSalesData]);

  useLiveData({ fetchFn: fetchSalesData, intervalMs: 15000, enabled: true });
  useNotificationRefetch({
    handlers: { SALE_CREATED: fetchSalesData },
    enabled: true,
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      PENDING: 'warning',
      PROCESSING: 'default',
      SHIPPED: 'default',
      DELIVERED: 'success',
      CANCELLED: 'destructive'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  // Mismo período que las stats (dateRange días) para alinear gráficas con tarjetas
  const daysNum = parseInt(String(dateRange), 10) || 30;
  const periodStart = Date.now() - daysNum * 24 * 60 * 60 * 1000;
  const salesInPeriod = sales.filter((s) => new Date(s.createdAt).getTime() >= periodStart);

  const periodLabel = daysNum === 7 ? 'últimos 7 días' : daysNum === 90 ? 'últimos 90 días' : daysNum === 365 ? 'último año' : 'últimos 30 días';

  // Filtrado
  const filteredSales = sales.filter(sale => {
    const matchesSearch = sale.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sale.productTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sale.buyerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || sale.status === statusFilter;
    const matchesMarketplace = marketplaceFilter === 'ALL' || sale.marketplace?.toLowerCase() === marketplaceFilter.toLowerCase();
    return matchesSearch && matchesStatus && matchesMarketplace;
  });

  // Paginación
  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const paginatedSales = filteredSales.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Datos para gráficas (mismo período que las stats)
  const revenueData = salesInPeriod.reduce((acc: any[], sale) => {
    const date = new Date(sale.createdAt).toLocaleDateString('es', { month: 'short', day: 'numeric' });
    const existing = acc.find(item => item.date === date);
    if (existing) {
      existing.revenue += sale.salePrice;
      existing.profit += sale.profit;
    } else {
      acc.push({ date, revenue: sale.salePrice, profit: sale.profit });
    }
    return acc;
  }, []).slice(-7);

  const norm = (m: string) => (m || 'checkout').toLowerCase().replace(/\s+/g, '') || 'checkout';
  const totalsByMarketplace = salesInPeriod.reduce((acc: Record<string, number>, sale) => {
    const raw = norm(sale.marketplace || '');
    const key = ['ebay', 'amazon', 'mercadolibre', 'checkout'].includes(raw) ? raw : 'checkout';
    acc[key] = (acc[key] || 0) + sale.salePrice;
    return acc;
  }, {});
  const marketplaceData = MARKETPLACES.map((m) => ({
    name: m.label,
    value: totalsByMarketplace[m.id] ?? 0,
  })).sort((a, b) => b.value - a.value);

  const statusData = Object.entries(
    salesInPeriod.reduce((acc: Record<string, number>, sale) => {
      acc[sale.status] = (acc[sale.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const exportToCSV = () => {
    const csv = [
      ['Order ID', 'Product', 'Marketplace', 'Buyer', 'Price', 'Cost', 'Profit', 'Status', 'Date'].join(','),
      ...filteredSales.map(sale => [
        sale.orderId,
        `"${sale.productTitle}"`,
        sale.marketplace,
        sale.buyerName,
        sale.salePrice,
        sale.cost,
        sale.profit,
        sale.status,
        new Date(sale.createdAt).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${Date.now()}.csv`;
    a.click();
    toast.success('Exportado a CSV');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DollarSign}
        title="Ventas"
        subtitle={
          lastSyncAt
            ? `Ventas registradas · sincronizado hace ${Math.round((Date.now() - new Date(lastSyncAt).getTime()) / 60000)} min`
            : 'Ventas registradas · ganancia realizada confirmada en Control Center'
        }
        actions={
          <Button onClick={exportToCSV} className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard
          icon={DollarSign}
          label={`Ingresos (${periodLabel})`}
          value={formatCurrencySimple(stats.totalRevenue, 'USD')}
          subtitle={`${stats.revenueChange >= 0 ? '+' : ''}${stats.revenueChange.toFixed(1)}% vs período anterior`}
          tone={stats.totalRevenue > 0 ? 'success' : 'default'}
        />
        <KpiCard
          icon={TrendingUp}
          label={`Margen neto (${periodLabel})`}
          value={formatCurrencySimple(stats.totalProfit, 'USD')}
          subtitle={`${stats.profitChange >= 0 ? '+' : ''}${stats.profitChange.toFixed(1)}% · estimado hasta proof fondos`}
          tone={stats.totalProfit > 0 ? 'success' : 'warning'}
        />
        <KpiCard
          icon={ShoppingCart}
          label={`Ventas (${periodLabel})`}
          value={stats.totalSales}
          subtitle={
            typeof stats.completedSales === 'number' && stats.completedSales !== stats.totalSales
              ? `${stats.completedSales} completadas`
              : 'pedidos en el período'
          }
          tone="default"
        />
        <KpiCard
          icon={Package}
          label={`Valor promedio (${periodLabel})`}
          value={formatCurrencySimple(stats.avgOrderValue, 'USD')}
          subtitle="por transacción"
          tone="info"
        />
      </div>

      {/* Tabs with Charts and Table */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="border-b border-slate-200 dark:border-slate-800 bg-transparent p-0 rounded-none gap-4">
          <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 pb-2.5 text-sm font-medium text-slate-500 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100">Resumen</TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 pb-2.5 text-sm font-medium text-slate-500 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100">Analíticas</TabsTrigger>
          <TabsTrigger value="list" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 pb-2.5 text-sm font-medium text-slate-500 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100">Lista de ventas</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="ir-panel">
              <div className="p-5 pb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Evolución ingresos y beneficio</h3>
              </div>
              <div className="p-5 pt-2">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.875rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                    <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} name="Ingresos" />
                    <Line type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={2} name="Beneficio (agregado)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="ir-panel">
              <div className="p-5 pb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ventas por marketplace</h3>
              </div>
              <div className="p-5 pt-2">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={marketplaceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.875rem' }} />
                    <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="ir-panel">
              <div className="p-5 pb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ventas por estado</h3>
              </div>
              <div className="p-5 pt-2">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.875rem' }} />
                    <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="ir-panel">
              <div className="p-5 pb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Métricas con proof</h3>
              </div>
              <div className="p-5 pt-2 space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Ratio de margen neto registrado</span>
                    <span className="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {stats.totalRevenue > 0 ? ((stats.totalProfit / stats.totalRevenue) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all" 
                      style={{ width: stats.totalRevenue > 0 ? `${(stats.totalProfit / stats.totalRevenue) * 100}%` : '0%' }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Progreso de fulfillment</span>
                    <span className="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {salesInPeriod.length > 0
                        ? `${Math.round((salesInPeriod.filter((s) => s.status === 'SHIPPED' || s.status === 'DELIVERED').length / salesInPeriod.length) * 100)}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all"
                      style={{
                        width: salesInPeriod.length > 0
                          ? `${(salesInPeriod.filter((s) => s.status === 'SHIPPED' || s.status === 'DELIVERED').length / salesInPeriod.length) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Sales List Tab */}
        <TabsContent value="list" className="space-y-4">
          {/* Filters */}
          <div className="ir-panel">
            <div className="p-5 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                Filtros
              </h3>
            </div>
            <div className="px-5 pb-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar órdenes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="ALL">Todos los estados</option>
                  <option value="PENDING">Pendiente</option>
                  <option value="PROCESSING">Procesando</option>
                  <option value="SHIPPED">Enviado</option>
                  <option value="DELIVERED">Entregado</option>
                  <option value="CANCELLED">Cancelado</option>
                </select>
                <select
                  value={marketplaceFilter}
                  onChange={(e) => setMarketplaceFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="ALL">Todos los marketplaces</option>
                  <option value="ebay">eBay</option>
                  <option value="amazon">Amazon</option>
                  <option value="mercadolibre">MercadoLibre</option>
                  <option value="checkout">Checkout</option>
                </select>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="7">Últimos 7 días</option>
                  <option value="30">Últimos 30 días</option>
                  <option value="90">Últimos 90 días</option>
                  <option value="365">Último año</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sales Table */}
          <div className="ir-panel">
            <div className="p-5 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lista de ventas ({filteredSales.length})</h3>
            </div>
            <div className="px-5 pb-5">
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-600 mx-auto"></div>
                  <p className="mt-4 text-sm text-slate-500">Cargando ventas...</p>
                </div>
              ) : paginatedSales.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No se encontraron ventas</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Imagen</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Order ID</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">ID pedido</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Producto</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Comprador</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Origen</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Automatización</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Precio</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500" title="Margen registrado — ganancia realizada requiere proof de payout">Profit (registrado)</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Workflow</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Fecha</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {paginatedSales.map((sale) => (
                          <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-3 py-3">
                              {sale.productImage ? (
                                <img src={sale.productImage} alt="" className="w-10 h-10 object-cover rounded-md" />
                              ) : (
                                <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                  <Package className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-sm font-medium text-blue-600 dark:text-blue-400">{sale.orderId}</td>
                            <td className="px-3 py-3 text-sm text-slate-500">{sale.ebayOrderId || sale.mercadolibreOrderId || sale.amazonOrderId || '—'}</td>
                            <td className="px-3 py-3 text-sm text-slate-900 dark:text-slate-100 max-w-[200px] truncate">{sale.productTitle}</td>
                            <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-400">{sale.buyerName}</td>
                            <td className="px-3 py-3">
                              <Badge variant="outline">{sale.source || sale.marketplace}</Badge>
                            </td>
                            <td className="px-3 py-3">
                              <AutomationBadge sale={sale} />
                            </td>
                            <td className="px-3 py-3 text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">{formatCurrencySimple(sale.salePrice, 'USD')}</td>
                            <td className="px-3 py-3 text-sm font-medium tabular-nums text-green-600">+{formatCurrencySimple(sale.profit, 'USD')}</td>
                            <td className="px-3 py-3">{getStatusBadge(sale.status)}</td>
                            <td className="px-3 py-3">
                              {sale.productId ? (
                                <WorkflowStatusIndicator 
                                  productId={sale.productId}
                                  currentStage={undefined}
                                />
                              ) : (
                                <span className="text-xs text-slate-400">N/A</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-sm tabular-nums text-slate-500">
                              {new Date(sale.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <button
                                onClick={() => {
                                  setSelectedSale(sale);
                                  setShowModal(true);
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                title="Ver detalle"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <p className="text-sm text-slate-500">
                        Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredSales.length)} de {filteredSales.length} ventas
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Sale Detail Modal */}
      {showModal && selectedSale && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Detalle de venta</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              {selectedSale.productImage && (
                <div className="flex justify-center">
                  <img src={selectedSale.productImage} alt={selectedSale.productTitle} className="max-h-32 object-contain rounded-lg" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Order ID</p>
                  <p className="font-medium text-blue-600 dark:text-blue-400 mt-0.5">{selectedSale.orderId}</p>
                </div>
                {(selectedSale.ebayOrderId || selectedSale.mercadolibreOrderId || selectedSale.amazonOrderId) && (
                  <div>
                    <p className="text-xs text-slate-500">ID pedido {selectedSale.ebayOrderId ? 'eBay' : selectedSale.mercadolibreOrderId ? 'Mercado Libre' : 'Amazon'}</p>
                    <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{selectedSale.ebayOrderId || selectedSale.mercadolibreOrderId || selectedSale.amazonOrderId}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-500">Estado</p>
                  <div className="mt-0.5">{getStatusBadge(selectedSale.status)}</div>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500">Automatización</p>
                  <div className="mt-0.5"><AutomationBadge sale={selectedSale} /></div>
                  {(selectedSale.fulfillmentErrorReason || selectedSale.syncNote) && (
                    <p className="text-xs text-slate-400 mt-1 truncate" title={selectedSale.fulfillmentErrorReason || selectedSale.syncNote}>
                      {selectedSale.fulfillmentErrorReason || selectedSale.syncNote}
                    </p>
                  )}
                </div>
                {['pending_purchase', 'needs_mapping', 'failed'].includes(selectedSale.fulfillmentAutomationStatus || '') && (
                  <div className="col-span-2 flex flex-wrap gap-2">
                    <a href="/orders" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Ver Órdenes</a>
                    <a href="/pending-purchases" className="text-sm text-amber-600 dark:text-amber-400 hover:underline">Compras pendientes</a>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-xs text-slate-500">Producto</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{selectedSale.productTitle}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Origen</p>
                  <div className="mt-0.5"><Badge variant="outline">{selectedSale.source || selectedSale.marketplace}</Badge></div>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Comprador</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{selectedSale.buyerName}</p>
                  {selectedSale.buyerEmail && (
                    <p className="text-xs text-slate-400 mt-0.5">{selectedSale.buyerEmail}</p>
                  )}
                </div>
                {selectedSale.shippingAddress && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Dirección de envío
                    </p>
                    <p className="font-medium text-sm text-slate-900 dark:text-slate-100 break-words mt-0.5">
                      {typeof selectedSale.shippingAddress === 'string' 
                        ? selectedSale.shippingAddress 
                        : JSON.stringify(selectedSale.shippingAddress)}
                    </p>
                  </div>
                )}
                {selectedSale.trackingNumber && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Número de seguimiento
                    </p>
                    <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{selectedSale.trackingNumber}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Fecha de venta
                  </p>
                  <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{new Date(selectedSale.createdAt).toLocaleString()}</p>
                </div>
              </div>
              {/* Composición financiera — margen registrado, no necesariamente realizado */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Composición financiera (registrada)</h3>
                <p className="text-[11px] text-slate-500 mb-3">Margen inferido del ledger — la ganancia realizada requiere proof de payout en Finance.</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Precio de venta</span>
                  <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{formatCurrencySimple(selectedSale.salePrice, 'USD')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Costo proveedor</span>
                  <span className="font-medium tabular-nums text-red-600">-{formatCurrencySimple(selectedSale.cost, 'USD')}</span>
                </div>
                {(selectedSale.marketplaceFee ?? 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Fee marketplace</span>
                    <span className="font-medium tabular-nums text-red-600">-{formatCurrencySimple(selectedSale.marketplaceFee ?? 0, 'USD')}</span>
                  </div>
                )}
                {(selectedSale.commission ?? 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Comisión plataforma</span>
                    <span className="font-medium tabular-nums text-orange-600">-{formatCurrencySimple(selectedSale.commission ?? 0, 'USD')}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">Ganancia bruta</span>
                  <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{formatCurrencySimple(selectedSale.grossProfit ?? selectedSale.salePrice - selectedSale.cost, 'USD')}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-slate-700 dark:text-slate-300">Ganancia neta (registrada)</span>
                  <span className="tabular-nums text-slate-900 dark:text-slate-100">+{formatCurrencySimple(selectedSale.profit, 'USD')}</span>
                </div>
                <p className="text-[11px] text-slate-500 pt-1">No equivale a realized profit sin proof de fondos liberados.</p>
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
