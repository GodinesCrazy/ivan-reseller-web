import { useState, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  ShoppingCart, 
  Package,
  Filter,
  Search,
  Eye,
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
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import api from '@/services/api';
import toast from 'react-hot-toast';

interface Sale {
  id: string;
  orderId: string;
  productId?: number; // ✅ Para mostrar workflow status del producto relacionado
  productTitle: string;
  marketplace: string;
  buyerName: string;
  buyerEmail?: string; // ✅ MEJORADO: Email del comprador
  shippingAddress?: string; // ✅ MEJORADO: Dirección de envío
  salePrice: number;
  cost: number;
  profit: number;
  commission: number;
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

export default function Sales() {
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

  useEffect(() => {
    fetchSalesData();
  }, [dateRange]);

  const fetchSalesData = async () => {
    try {
      setLoading(true);
      const [salesResponse, statsResponse] = await Promise.all([
        api.get('/api/sales'),
        api.get(`/api/sales/stats?days=${dateRange}`)
      ]);
      setSales(salesResponse.data?.sales || salesResponse.data || []);
      setStats(statsResponse.data || {});
    } catch (error) {
      console.error('Error fetching sales:', error);
      toast.error('Error al cargar ventas');
    } finally {
      setLoading(false);
    }
  };

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

  // Filtrado
  const filteredSales = sales.filter(sale => {
    const matchesSearch = sale.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sale.productTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sale.buyerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || sale.status === statusFilter;
    const matchesMarketplace = marketplaceFilter === 'ALL' || sale.marketplace === marketplaceFilter;
    return matchesSearch && matchesStatus && matchesMarketplace;
  });

  // Paginación
  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const paginatedSales = filteredSales.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Datos para gráficas
  const revenueData = sales.reduce((acc: any[], sale) => {
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

  const marketplaceData = Object.entries(
    sales.reduce((acc: Record<string, number>, sale) => {
      acc[sale.marketplace] = (acc[sale.marketplace] || 0) + sale.salePrice;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const statusData = Object.entries(
    sales.reduce((acc: Record<string, number>, sale) => {
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sales Dashboard</h1>
          <p className="text-gray-600 mt-1">Track and analyze your sales performance</p>
        </div>
        <Button onClick={exportToCSV} className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Revenue</p>
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
                <p className="text-sm text-gray-600">Total Profit</p>
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
                <p className="text-sm text-gray-600">Total Sales</p>
                <p className="text-2xl font-bold">{stats.totalSales}</p>
                <p className="text-xs text-gray-500 mt-1">orders processed</p>
              </div>
              <ShoppingCart className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Order Value</p>
                <p className="text-2xl font-bold">{formatCurrencySimple(stats.avgOrderValue, 'USD')}</p>
                <p className="text-xs text-gray-500 mt-1">per transaction</p>
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
                <CardTitle>Revenue & Profit Trend</CardTitle>
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
                <CardTitle>Sales by Marketplace</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={marketplaceData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {marketplaceData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
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
                    <span className="text-sm text-gray-600">Fulfillment Rate</span>
                    <span className="text-sm font-medium">92%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-purple-600 h-2 rounded-full" style={{ width: '92%' }}></div>
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
                  <option value="EBAY">eBay</option>
                  <option value="AMAZON">Amazon</option>
                  <option value="MERCADOLIBRE">MercadoLibre</option>
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
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buyer</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marketplace</th>
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
                          <tr key={sale.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-blue-600">{sale.orderId}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{sale.productTitle}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{sale.buyerName}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline">{sale.marketplace}</Badge>
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

      {/* Sale Detail Modal */}
      {showModal && selectedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-2xl font-bold">Sale Details</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Order ID</p>
                  <p className="font-medium text-blue-600">{selectedSale.orderId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  {getStatusBadge(selectedSale.status)}
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">Product</p>
                  <p className="font-medium">{selectedSale.productTitle}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Marketplace</p>
                  <Badge variant="outline">{selectedSale.marketplace}</Badge>
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
                <div>
                  <p className="text-sm text-gray-600">Sale Price</p>
                  <p className="font-medium text-lg">{formatCurrencySimple(selectedSale.salePrice, 'USD')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cost</p>
                  <p className="font-medium">{formatCurrencySimple(selectedSale.cost, 'USD')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Profit</p>
                  <p className="font-medium text-green-600 text-lg">+{formatCurrencySimple(selectedSale.profit, 'USD')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Commission</p>
                  <p className="font-medium text-orange-600">{formatCurrencySimple(selectedSale.commission, 'USD')}</p>
                </div>
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
