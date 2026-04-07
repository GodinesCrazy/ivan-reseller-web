import { useState, useCallback } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/ui/PageHeader';
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
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import { useEnvironment } from '@/contexts/EnvironmentContext';

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
  const { environment } = useEnvironment();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [stats, setStats] = useState<CommissionStats>({
    totalPending: 0,
    totalPaid: 0,
    totalCommissions: 0,
    nextPayoutDate: '',
    monthlyEarnings: 0,
    earningsChange: 0
  });

  const safeStats = {
    totalPending: Number(stats.totalPending) || 0,
    totalPaid: Number(stats.totalPaid) || 0,
    totalCommissions: Number(stats.totalCommissions) || 0,
    nextPayoutDate: stats.nextPayoutDate ?? '',
    monthlyEarnings: Number(stats.monthlyEarnings) || 0,
    earningsChange: Number(stats.earningsChange) || 0
  };
  const [payoutSchedule, setPayoutSchedule] = useState<PayoutSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const itemsPerPage = 10;

  const fetchCommissionsData = useCallback(async () => {
    try {
      setLoading(true);
      const params = { environment };
      const [commissionsResponse, statsResponse, scheduleResponse] = await Promise.all([
        api.get('/api/commissions', { params }),
        api.get('/api/commissions/stats', { params }),
        api.get('/api/commissions/payout-schedule', { params })
      ]);
      setCommissions(commissionsResponse.data?.commissions ?? []);
      setStats(statsResponse.data ?? { totalPending: 0, totalPaid: 0, totalCommissions: 0, nextPayoutDate: '', monthlyEarnings: 0, earningsChange: 0 });
      setPayoutSchedule(scheduleResponse.data?.schedule ?? []);
    } catch (error: any) {
      console.error('Error fetching commissions:', error);
      const status = error?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error loading commissions');
      }
    } finally {
      setLoading(false);
    }
  }, [environment]);

  useLiveData({ fetchFn: fetchCommissionsData, intervalMs: 30000, enabled: true });
  useNotificationRefetch({
    handlers: { SALE_CREATED: fetchCommissionsData, COMMISSION_CALCULATED: fetchCommissionsData },
    enabled: true,
  });

  const handleRequestPayout = async () => {
    if (safeStats.totalPending < 50) {
      toast.error('Minimum payout amount is $50');
      return;
    }

    try {
      setRequestingPayout(true);
      await api.post('/api/commissions/request-payout');
      toast.success('Payout request submitted successfully');
      fetchCommissionsData();
    } catch (error) {
      console.error('Error requesting payout:', error);
      toast.error('Error requesting payout');
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
      <Badge variant={variants[status] || 'secondary'} className="flex items-center gap-1 text-[11px]">
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  const filteredCommissions = commissions.filter(commission => {
    const matchesSearch = commission.productTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         commission.saleId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || commission.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredCommissions.length / itemsPerPage);
  const paginatedCommissions = filteredCommissions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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
    toast.success('Exportado a CSV');
  };

  const premiumCard = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card';

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DollarSign}
        title="Comisiones"
        subtitle="Seguimiento de ganancias y gestion de pagos"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportToCSV} className="flex items-center gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />
              Exportar
            </Button>
            <Button
              size="sm"
              onClick={handleRequestPayout}
              disabled={requestingPayout || safeStats.totalPending < 50}
              className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Wallet className="w-3.5 h-3.5" />
              Solicitar pago (${safeStats.totalPending.toFixed(2)})
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={premiumCard + ' p-5'}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Comisiones pendientes</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">${safeStats.totalPending.toFixed(2)}</p>
              <p className="text-[11px] text-slate-400">Available for payout</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <Clock className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        </div>

        <div className={premiumCard + ' p-5'}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Total Paid</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">${safeStats.totalPaid.toFixed(2)}</p>
              <p className="text-[11px] text-slate-400">All time earnings</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <CheckCircle className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </div>

        <div className={premiumCard + ' p-5'}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Monthly Earnings</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">${safeStats.monthlyEarnings.toFixed(2)}</p>
              <p className={`text-[11px] flex items-center gap-0.5 ${safeStats.earningsChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                <TrendingUp className="w-3 h-3" />
                {safeStats.earningsChange >= 0 ? '+' : ''}{safeStats.earningsChange.toFixed(1)}% vs last month
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className={premiumCard + ' p-5'}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Next Payout</p>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {stats.nextPayoutDate ? new Date(stats.nextPayoutDate).toLocaleDateString() : 'N/A'}
              </p>
              <p className="text-[11px] text-slate-400">Scheduled payment</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center">
              <Calendar className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      {safeStats.totalPending < 50 && safeStats.totalPending > 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Minimum Payout Amount</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
              You need ${(50 - safeStats.totalPending).toFixed(2)} more to reach the minimum payout amount of $50.00
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-8 p-0.5 bg-slate-100 dark:bg-slate-800/60 rounded-lg">
          <TabsTrigger value="overview" className="text-xs h-7 px-3 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">Overview</TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs h-7 px-3 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">Payout Schedule</TabsTrigger>
          <TabsTrigger value="history" className="text-xs h-7 px-3 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={premiumCard}>
              <div className="px-5 pt-4 pb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tendencia de ganancias</h3>
              </div>
              <div className="px-5 pb-5">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={earningsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#10B981" 
                      strokeWidth={2} 
                      name="Earnings ($)" 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={premiumCard}>
              <div className="px-5 pt-4 pb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pending vs Paid (Monthly)</h3>
              </div>
              <div className="px-5 pb-5">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="pending" fill="#F59E0B" name="Pending" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="paid" fill="#10B981" name="Paid" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Comisiones recientes */}
          <div className={premiumCard}>
            <div className="px-5 pt-4 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Comisiones recientes</h3>
            </div>
            <div className="px-5 pb-5 space-y-2">
              {commissions.slice(0, 5).map((commission) => (
                <div key={commission.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{commission.productTitle}</p>
                      <p className="text-xs text-slate-500">
                        {commission.marketplace} · {new Date(commission.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right space-y-1">
                      <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">${commission.amount.toFixed(2)}</p>
                      {getStatusBadge(commission.status)}
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Payout Schedule Tab */}
        <TabsContent value="schedule" className="space-y-4">
          <div className={premiumCard}>
            <div className="px-5 pt-4 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Upcoming Payouts
              </h3>
            </div>
            <div className="px-5 pb-5">
              {payoutSchedule.length === 0 ? (
                <div className="text-center py-10">
                  <Calendar className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No scheduled payouts</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {payoutSchedule.map((payout, index) => (
                    <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          payout.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-950/40' :
                          payout.status === 'processing' ? 'bg-blue-50 dark:bg-blue-950/40' :
                          'bg-slate-100 dark:bg-slate-800'
                        }`}>
                          {payout.status === 'completed' ? (
                            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          ) : payout.status === 'processing' ? (
                            <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Clock className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {new Date(payout.date).toLocaleDateString('en', { 
                              weekday: 'long', 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            })}
                          </p>
                          <p className="text-xs text-slate-500">{payout.count} commissions</p>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">${payout.amount.toFixed(2)}</p>
                        <Badge variant={
                          payout.status === 'completed' ? 'success' :
                          payout.status === 'processing' ? 'default' :
                          'warning'
                        } className="text-[11px]">
                          {payout.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {/* Filters */}
          <div className={premiumCard}>
            <div className="px-5 pt-4 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filters
              </h3>
            </div>
            <div className="px-5 pb-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    placeholder="Search by product or sale ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9 text-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 px-3 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                >
                  <option value="ALL">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="PAID">Paid</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Commissions Table */}
          <div className={premiumCard}>
            <div className="px-5 pt-4 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Commission History
                <span className="ml-1.5 text-xs font-normal text-slate-500">({filteredCommissions.length})</span>
              </h3>
            </div>
            <div className="px-5 pb-5">
              {loading ? (
                <div className="text-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-slate-600 mx-auto"></div>
                  <p className="mt-3 text-xs text-slate-500">Loading commissions...</p>
                </div>
              ) : paginatedCommissions.length === 0 ? (
                <div className="text-center py-10">
                  <DollarSign className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No commissions found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sale ID</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Product</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Marketplace</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Payment Date</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedCommissions.map((commission) => (
                          <tr key={commission.id} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-3 py-3 text-sm font-medium text-blue-600 dark:text-blue-400">{commission.saleId}</td>
                            <td className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate">{commission.productTitle}</td>
                            <td className="px-3 py-3">
                              <Badge variant="outline" className="text-[11px] border-slate-200 dark:border-slate-700">{commission.marketplace}</Badge>
                            </td>
                            <td className="px-3 py-3 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">${commission.amount.toFixed(2)}</td>
                            <td className="px-3 py-3">{getStatusBadge(commission.status)}</td>
                            <td className="px-3 py-3 text-sm text-slate-500">
                              {commission.paymentDate 
                                ? new Date(commission.paymentDate).toLocaleDateString()
                                : '-'
                              }
                            </td>
                            <td className="px-3 py-3 text-sm text-slate-500">
                              {new Date(commission.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <p className="text-xs text-slate-500">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredCommissions.length)} of {filteredCommissions.length} commissions
                      </p>
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="text-xs h-7 border-slate-200 dark:border-slate-800"
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="text-xs h-7 border-slate-200 dark:border-slate-800"
                        >
                          Next
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
    </div>
  );
}
