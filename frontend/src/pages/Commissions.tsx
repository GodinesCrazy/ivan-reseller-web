import { useState, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CheckCircle,
  Calendar,
  Download,
  Filter,
  Search,
  ArrowUpRight,
  Wallet,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import api from '@/services/api';
import toast from 'react-hot-toast';

interface Commission {
  id: string;
  saleId: string;
  amount: number;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'CANCELLED';
  paymentMethod?: string;
  paymentDate?: string;
  productTitle: string;
  marketplace: string;
  createdAt: string;
}

interface CommissionStats {
  totalPending: number;
  totalPaid: number;
  totalCommissions: number;
  nextPayoutDate: string;
  monthlyEarnings: number;
  earningsChange: number;
}

interface PayoutSchedule {
  date: string;
  amount: number;
  count: number;
  status: 'scheduled' | 'processing' | 'completed';
}

export default function Commissions() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [stats, setStats] = useState<CommissionStats>({
    totalPending: 0,
    totalPaid: 0,
    totalCommissions: 0,
    nextPayoutDate: '',
    monthlyEarnings: 0,
    earningsChange: 0
  });
  const [payoutSchedule, setPayoutSchedule] = useState<PayoutSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchCommissionsData();
  }, []);

  const fetchCommissionsData = async () => {
    try {
      setLoading(true);
      const [commissionsResponse, statsResponse, scheduleResponse] = await Promise.all([
        api.get('/commissions'),
        api.get('/commissions/stats'),
        api.get('/commissions/payout-schedule')
      ]);
      setCommissions(commissionsResponse.data);
      setStats(statsResponse.data);
      setPayoutSchedule(scheduleResponse.data);
    } catch (error) {
      console.error('Error fetching commissions:', error);
      toast.error('Error al cargar comisiones');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPayout = async () => {
    if (stats.totalPending < 50) {
      toast.error('Minimum payout amount is $50');
      return;
    }

    try {
      setRequestingPayout(true);
      await api.post('/commissions/request-payout');
      toast.success('Payout request submitted successfully');
      fetchCommissionsData();
    } catch (error) {
      console.error('Error requesting payout:', error);
      toast.error('Error al solicitar pago');
    } finally {
      setRequestingPayout(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      PENDING: 'warning',
      PROCESSING: 'default',
      PAID: 'success',
      CANCELLED: 'destructive'
    };
    const icons: Record<string, any> = {
      PENDING: Clock,
      PROCESSING: TrendingUp,
      PAID: CheckCircle,
      CANCELLED: AlertCircle
    };
    const Icon = icons[status] || Clock;
    return (
      <Badge variant={variants[status] || 'secondary'} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  // Filtrado
  const filteredCommissions = commissions.filter(commission => {
    const matchesSearch = commission.productTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         commission.saleId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || commission.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Paginación
  const totalPages = Math.ceil(filteredCommissions.length / itemsPerPage);
  const paginatedCommissions = filteredCommissions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Datos para gráficas
  const earningsData = commissions
    .filter(c => c.status === 'PAID')
    .reduce((acc: any[], commission) => {
      const date = new Date(commission.paymentDate || commission.createdAt).toLocaleDateString('es', { month: 'short' });
      const existing = acc.find(item => item.month === date);
      if (existing) {
        existing.amount += commission.amount;
        existing.count += 1;
      } else {
        acc.push({ month: date, amount: commission.amount, count: 1 });
      }
      return acc;
    }, []).slice(-6);

  const monthlyData = commissions.reduce((acc: any[], commission) => {
    const month = new Date(commission.createdAt).toLocaleDateString('es', { month: 'short' });
    const existing = acc.find(item => item.month === month);
    if (existing) {
      if (commission.status === 'PENDING') existing.pending += commission.amount;
      if (commission.status === 'PAID') existing.paid += commission.amount;
    } else {
      acc.push({
        month,
        pending: commission.status === 'PENDING' ? commission.amount : 0,
        paid: commission.status === 'PAID' ? commission.amount : 0
      });
    }
    return acc;
  }, []).slice(-6);

  const exportToCSV = () => {
    const csv = [
      ['Sale ID', 'Product', 'Marketplace', 'Amount', 'Status', 'Payment Date', 'Created Date'].join(','),
      ...filteredCommissions.map(commission => [
        commission.saleId,
        `"${commission.productTitle}"`,
        commission.marketplace,
        commission.amount.toFixed(2),
        commission.status,
        commission.paymentDate ? new Date(commission.paymentDate).toLocaleDateString() : 'N/A',
        new Date(commission.createdAt).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commissions-${Date.now()}.csv`;
    a.click();
    toast.success('Exported to CSV');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Commissions Dashboard</h1>
          <p className="text-gray-600 mt-1">Track your earnings and manage payouts</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={exportToCSV} className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button 
            onClick={handleRequestPayout}
            disabled={requestingPayout || stats.totalPending < 50}
            className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
          >
            <Wallet className="w-4 h-4" />
            Request Payout (${stats.totalPending.toFixed(2)})
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Commissions</p>
                <p className="text-3xl font-bold text-yellow-700">${stats.totalPending.toFixed(2)}</p>
                <p className="text-xs text-gray-600 mt-1">Available for payout</p>
              </div>
              <Clock className="w-10 h-10 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Paid</p>
                <p className="text-3xl font-bold text-green-700">${stats.totalPaid.toFixed(2)}</p>
                <p className="text-xs text-gray-600 mt-1">All time earnings</p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Monthly Earnings</p>
                <p className="text-3xl font-bold text-blue-700">${stats.monthlyEarnings.toFixed(2)}</p>
                <p className={`text-xs flex items-center gap-1 mt-1 ${stats.earningsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <TrendingUp className="w-3 h-3" />
                  {stats.earningsChange >= 0 ? '+' : ''}{stats.earningsChange.toFixed(1)}% vs last month
                </p>
              </div>
              <TrendingUp className="w-10 h-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Next Payout</p>
                <p className="text-lg font-bold text-purple-700">
                  {stats.nextPayoutDate ? new Date(stats.nextPayoutDate).toLocaleDateString() : 'N/A'}
                </p>
                <p className="text-xs text-gray-600 mt-1">Scheduled payment</p>
              </div>
              <Calendar className="w-10 h-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Banner */}
      {stats.totalPending < 50 && stats.totalPending > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">Minimum Payout Amount</p>
            <p className="text-sm text-blue-700">
              You need ${(50 - stats.totalPending).toFixed(2)} more to reach the minimum payout amount of $50.00
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="schedule">Payout Schedule</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Earnings Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={earningsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#10B981" 
                      strokeWidth={2} 
                      name="Earnings ($)" 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pending vs Paid (Monthly)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="pending" fill="#F59E0B" name="Pending" />
                    <Bar dataKey="paid" fill="#10B981" name="Paid" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Recent Commissions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Commissions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {commissions.slice(0, 5).map((commission) => (
                  <div key={commission.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{commission.productTitle}</p>
                        <p className="text-sm text-gray-600">
                          {commission.marketplace} • {new Date(commission.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-bold text-green-600">${commission.amount.toFixed(2)}</p>
                        {getStatusBadge(commission.status)}
                      </div>
                      <ArrowUpRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payout Schedule Tab */}
        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Upcoming Payouts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payoutSchedule.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No scheduled payouts</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {payoutSchedule.map((payout, index) => (
                    <div key={index} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          payout.status === 'completed' ? 'bg-green-100' :
                          payout.status === 'processing' ? 'bg-blue-100' :
                          'bg-gray-100'
                        }`}>
                          {payout.status === 'completed' ? (
                            <CheckCircle className="w-6 h-6 text-green-600" />
                          ) : payout.status === 'processing' ? (
                            <TrendingUp className="w-6 h-6 text-blue-600" />
                          ) : (
                            <Clock className="w-6 h-6 text-gray-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {new Date(payout.date).toLocaleDateString('es', { 
                              weekday: 'long', 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            })}
                          </p>
                          <p className="text-sm text-gray-600">{payout.count} commissions</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-600">${payout.amount.toFixed(2)}</p>
                        <Badge variant={
                          payout.status === 'completed' ? 'success' :
                          payout.status === 'processing' ? 'default' :
                          'warning'
                        }>
                          {payout.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by product or sale ID..."
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
                  <option value="PAID">Paid</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Commissions Table */}
          <Card>
            <CardHeader>
              <CardTitle>Commission History ({filteredCommissions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading commissions...</p>
                </div>
              ) : paginatedCommissions.length === 0 ? (
                <div className="text-center py-8">
                  <DollarSign className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No commissions found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sale ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marketplace</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {paginatedCommissions.map((commission) => (
                          <tr key={commission.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-blue-600">{commission.saleId}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{commission.productTitle}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline">{commission.marketplace}</Badge>
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-green-600">${commission.amount.toFixed(2)}</td>
                            <td className="px-4 py-3">{getStatusBadge(commission.status)}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {commission.paymentDate 
                                ? new Date(commission.paymentDate).toLocaleDateString()
                                : '-'
                              }
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {new Date(commission.createdAt).toLocaleDateString()}
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
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredCommissions.length)} of {filteredCommissions.length} commissions
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
    </div>
  );
}
