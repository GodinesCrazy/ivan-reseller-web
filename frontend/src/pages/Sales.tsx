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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import SalesReadinessPanel from '@/components/SalesReadinessPanel';

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
}

interface SalesStats {
  totalRevenue: number;
  totalProfit: number;
  totalSales: number;
  avgOrderValue: number;
  revenueChange: number;
  profitChange: number;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const MARKETPLACES = [
  { id: 'ebay', label: 'eBay' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'mercadolibre', label: 'Mercado Libre' },
  { id: 'checkout', label: 'Checkout' },
] as const;

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
    toast.success('Exported to CSV');
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Ventas</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Ventas de productos publicados en marketplaces</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Datos reales desde API · Entorno: {environment === 'production' ? 'producción' : environment === 'sandbox' ? 'sandbox' : 'todos'}
            {lastSyncAt && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                · Última sincronización: {(() => {
                  const mins = Math.round((Date.now() - new Date(lastSyncAt).getTime()) / 60000);
                  return mins < 1 ? 'ahora mismo' : `${mins} min`;
                })()}
              </span>
            )}
          </p>
          <div className="mt-3">
            <CycleStepsBreadcrumb currentStep={4} />
          </div>
        </div>
        <Button onClick={exportToCSV} className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Exportar CSV
        </Button>
      </div>

      <SalesReadinessPanel />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Ingresos totales ({periodLabel})</p>
                <p className="text-2xl font-bold">{formatCurrencySimple(stats.totalRevenue, 'USD')}</p>
                <p className={`text-xs flex items-center gap-1 mt-1 ${stats.revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <TrendingUp className="w-3 h-3" />
                  {stats.revenueChange >= 0 ? '+' : ''}{stats.revenueChange.toFixed(1)}% vs last period
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Beneficio total ({periodLabel})</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrencySimple(stats.totalProfit, 'USD')}</p>
                <p className={`text-xs flex items-center gap-1 mt-1 ${stats.profitChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <TrendingUp className="w-3 h-3" />
                  {stats.profitChange >= 0 ? '+' : ''}{stats.profitChange.toFixed(1)}% vs last period
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Sales ({periodLabel})</p>
                <p className="text-2xl font-bold">{stats.totalSales}</p>
                <p className="text-xs text-gray-500 mt-1">pedidos completados</p>
              </div>
              <ShoppingCart className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Order Value ({periodLabel})</p>
                <p className="text-2xl font-bold">{formatCurrencySimple(stats.avgOrderValue, 'USD')}</p>
                <p className="text-xs text-gray-500 mt-1">por transacción</p>
              </div>
              <Package className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs with Charts and Table */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="list">Sales List</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Evolución ingresos y beneficio</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} name="Revenue" />
                    <Line type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={2} name="Profit" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ventas por marketplace</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={marketplaceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Sales by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-gray-600">Conversion Rate</span>
                    <span className="text-sm font-medium">78%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{ width: '78%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-gray-600">Profit Margin</span>
                    <span className="text-sm font-medium">
                      {stats.totalRevenue > 0 ? ((stats.totalProfit / stats.totalRevenue) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: stats.totalRevenue > 0 ? `${(stats.totalProfit / stats.totalRevenue) * 100}%` : '0%' }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Fulfillment</span>
                    <span className="text-sm font-medium">
                      {salesInPeriod.length > 0
                        ? `${Math.round((salesInPeriod.filter((s) => s.status === 'SHIPPED' || s.status === 'DELIVERED').length / salesInPeriod.length) * 100)}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full"
                      style={{
                        width: salesInPeriod.length > 0
                          ? `${(salesInPeriod.filter((s) => s.status === 'SHIPPED' || s.status === 'DELIVERED').length / salesInPeriod.length) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sales List Tab */}
        <TabsContent value="list" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search orders..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="ALL">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="SHIPPED">Shipped</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <select
                  value={marketplaceFilter}
                  onChange={(e) => setMarketplaceFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="ALL">All Marketplaces</option>
                  <option value="ebay">eBay</option>
                  <option value="amazon">Amazon</option>
                  <option value="mercadolibre">MercadoLibre</option>
                  <option value="checkout">Checkout</option>
                </select>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="365">Last year</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Sales Table */}
          <Card>
            <CardHeader>
              <CardTitle>Sales List ({filteredSales.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading sales...</p>
                </div>
              ) : paginatedSales.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No sales found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Imagen</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comprador</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Origen</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Profit</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workflow</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {paginatedSales.map((sale) => (
                          <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-4 py-3">
                              {sale.productImage ? (
                                <img src={sale.productImage} alt="" className="w-10 h-10 object-cover rounded" />
                              ) : (
                                <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                                  <Package className="w-5 h-5 text-gray-400" />
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-blue-600 dark:text-blue-400">{sale.orderId}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate">{sale.productTitle}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{sale.buyerName}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline">{sale.source || sale.marketplace}</Badge>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrencySimple(sale.salePrice, 'USD')}</td>
                            <td className="px-4 py-3 text-sm font-medium text-green-600">+{formatCurrencySimple(sale.profit, 'USD')}</td>
                            <td className="px-4 py-3">{getStatusBadge(sale.status)}</td>
                            <td className="px-4 py-3">
                              {sale.productId ? (
                                <WorkflowStatusIndicator 
                                  productId={sale.productId}
                                  currentStage={undefined}
                                />
                              ) : (
                                <span className="text-xs text-gray-400">N/A</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {new Date(sale.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => {
                                  setSelectedSale(sale);
                                  setShowModal(true);
                                }}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                title="View details"
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
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <p className="text-sm text-gray-600">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredSales.length)} of {filteredSales.length} sales
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sale Detail Modal — Phase 40: full detail */}
      {showModal && selectedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Detalle de venta</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              {selectedSale.productImage && (
                <div className="flex justify-center">
                  <img src={selectedSale.productImage} alt={selectedSale.productTitle} className="max-h-32 object-contain rounded" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Order ID</p>
                  <p className="font-medium text-blue-600 dark:text-blue-400">{selectedSale.orderId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Estado</p>
                  {getStatusBadge(selectedSale.status)}
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Producto</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{selectedSale.productTitle}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Origen</p>
                  <Badge variant="outline">{selectedSale.source || selectedSale.marketplace}</Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Buyer</p>
                  <p className="font-medium">{selectedSale.buyerName}</p>
                  {selectedSale.buyerEmail && (
                    <p className="text-xs text-gray-500 mt-1">{selectedSale.buyerEmail}</p>
                  )}
                </div>
                {selectedSale.shippingAddress && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      Shipping Address
                    </p>
                    <p className="font-medium text-sm break-words">
                      {typeof selectedSale.shippingAddress === 'string' 
                        ? selectedSale.shippingAddress 
                        : JSON.stringify(selectedSale.shippingAddress)}
                    </p>
                  </div>
                )}
                {selectedSale.trackingNumber && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      Tracking Number
                    </p>
                    <p className="font-medium">{selectedSale.trackingNumber}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-600 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Sale Date
                  </p>
                  <p className="font-medium">{new Date(selectedSale.createdAt).toLocaleString()}</p>
                </div>
              </div>
              {/* Composición financiera */}
              <div className="border rounded-lg p-4 bg-gray-50 space-y-2">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Composición financiera</h3>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Precio de venta</span>
                  <span className="font-medium">{formatCurrencySimple(selectedSale.salePrice, 'USD')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Costo proveedor</span>
                  <span className="font-medium text-red-600">-{formatCurrencySimple(selectedSale.cost, 'USD')}</span>
                </div>
                {(selectedSale.marketplaceFee ?? 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Fee marketplace</span>
                    <span className="font-medium text-red-600">-{formatCurrencySimple(selectedSale.marketplaceFee ?? 0, 'USD')}</span>
                  </div>
                )}
                {(selectedSale.commission ?? 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Comisión plataforma</span>
                    <span className="font-medium text-orange-600">-{formatCurrencySimple(selectedSale.commission ?? 0, 'USD')}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="text-gray-600">Ganancia bruta</span>
                  <span className="font-medium">{formatCurrencySimple(selectedSale.grossProfit ?? selectedSale.salePrice - selectedSale.cost, 'USD')}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-900">Ganancia neta</span>
                  <span className="text-green-600">+{formatCurrencySimple(selectedSale.profit, 'USD')}</span>
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
