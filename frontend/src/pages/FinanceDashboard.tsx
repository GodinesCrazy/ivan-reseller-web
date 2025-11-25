import { useState, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  PieChart,
  BarChart3,
  Calendar,
  Download,
  RefreshCw,
  CreditCard,
  Wallet,
  Receipt,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';
import { formatCurrencySimple } from '../utils/currency';

interface FinancialData {
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  commissions: number;
  taxes: number;
  netProfit: number;
}

interface CategoryBreakdown {
  category: string;
  revenue: number;
  expenses: number;
  profit: number;
  percentage: number;
}

interface CashFlow {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

interface TaxSummary {
  taxableIncome: number;
  taxRate: number;
  taxAmount: number;
  deductions: number;
  netTax: number;
}

export default function FinanceDashboard() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [financialData, setFinancialData] = useState<FinancialData>({
    revenue: 0,
    expenses: 0,
    profit: 0,
    margin: 0,
    commissions: 0,
    taxes: 0,
    netProfit: 0
  });
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlow[]>([]);
  const [taxSummary, setTaxSummary] = useState<TaxSummary>({
    taxableIncome: 0,
    taxRate: 0,
    taxAmount: 0,
    deductions: 0,
    netTax: 0
  });

  useEffect(() => {
    loadFinancialData();
  }, [dateRange]);

  const loadFinancialData = async () => {
    setLoading(true);
    try {
      const [summaryRes, breakdownRes, cashFlowRes, taxRes] = await Promise.all([
        api.get('/api/finance/summary', { params: { range: dateRange } }),
        api.get('/api/finance/breakdown', { params: { range: dateRange } }),
        api.get('/api/finance/cashflow', { params: { range: dateRange } }),
        api.get('/api/finance/tax-summary', { params: { range: dateRange } })
      ]);

      setFinancialData(summaryRes.data?.summary || financialData);
      setCategoryBreakdown(breakdownRes.data?.breakdown || []);
      setCashFlow(cashFlowRes.data?.cashFlow || []);
      setTaxSummary(taxRes.data?.taxSummary || taxSummary);
    } catch (error: any) {
      toast.error('Error loading financial data: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (format: 'pdf' | 'excel' | 'csv') => {
    try {
      const { data } = await api.get(`/api/finance/export/${format}`, {
        params: { range: dateRange },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `financial-report-${dateRange}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success(`Report exported as ${format.toUpperCase()}`);
    } catch (error: any) {
      toast.error('Error exporting report');
    }
  };

  const getDateRangeLabel = () => {
    switch (dateRange) {
      case 'week': return 'Last 7 Days';
      case 'month': return 'Last 30 Days';
      case 'quarter': return 'Last 90 Days';
      case 'year': return 'Last 365 Days';
      default: return 'Last 30 Days';
    }
  };

  // ✅ Usar utilidad centralizada de formateo de moneda
  const formatCurrency = (amount: number) => {
    // TODO: Obtener moneda del usuario desde settings
    return formatCurrencySimple(amount, 'USD');
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance Dashboard</h1>
          <p className="text-gray-600">Consolidated KPIs: sales, commissions, payouts and balances</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadFinancialData}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <div className="relative">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 appearance-none bg-white"
            >
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="quarter">Last 90 Days</option>
              <option value="year">Last Year</option>
            </select>
            <Calendar className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative group">
            <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg hidden group-hover:block z-10">
              <button
                onClick={() => exportReport('pdf')}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export as PDF
              </button>
              <button
                onClick={() => exportReport('excel')}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export as Excel
              </button>
              <button
                onClick={() => exportReport('csv')}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export as CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Total Revenue</div>
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-2">
            {formatCurrency(financialData.revenue)}
          </div>
          <div className="flex items-center text-sm text-green-600">
            <ArrowUpRight className="w-4 h-4 mr-1" />
            <span>Revenue from all sources</span>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Total Expenses</div>
            <div className="p-2 bg-red-100 rounded-lg">
              <CreditCard className="w-5 h-5 text-red-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-2">
            {formatCurrency(financialData.expenses)}
          </div>
          <div className="flex items-center text-sm text-red-600">
            <ArrowDownRight className="w-4 h-4 mr-1" />
            <span>All operational costs</span>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Gross Profit</div>
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-2">
            {formatCurrency(financialData.profit)}
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <span>Margin: {formatPercentage(financialData.margin)}</span>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Net Profit</div>
            <div className="p-2 bg-purple-100 rounded-lg">
              <Wallet className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-2">
            {formatCurrency(financialData.netProfit)}
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <span>After taxes & fees</span>
          </div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-900">Commissions Paid</div>
            <Receipt className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(financialData.commissions)}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            To affiliates and partners
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-900">Taxes Paid</div>
            <Receipt className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(financialData.taxes)}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Total tax obligations
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <PieChart className="w-5 h-5" />
            Breakdown by Category
          </h3>
          <div className="text-sm text-gray-500">{getDateRangeLabel()}</div>
        </div>

        {categoryBreakdown.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No category data available
          </div>
        ) : (
          <div className="space-y-4">
            {categoryBreakdown.map((category, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-medium text-gray-900">{category.category}</div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-600">Revenue: {formatCurrency(category.revenue)}</span>
                    <span className="text-gray-600">Expenses: {formatCurrency(category.expenses)}</span>
                    <span className={`font-semibold ${category.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Profit: {formatCurrency(category.profit)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${category.profit >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{ width: `${category.percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 min-w-[60px] text-right">
                    {category.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cash Flow Chart */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Cash Flow Analysis
          </h3>
          <div className="text-sm text-gray-500">{getDateRangeLabel()}</div>
        </div>

        {cashFlow.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No cash flow data available
          </div>
        ) : (
          <div className="space-y-4">
            {/* Legend */}
            <div className="flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span className="text-gray-600">Income</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span className="text-gray-600">Expenses</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span className="text-gray-600">Net</span>
              </div>
            </div>

            {/* Chart */}
            <div className="space-y-3">
              {cashFlow.map((flow, index) => {
                const maxValue = Math.max(...cashFlow.map(f => Math.max(f.income, f.expenses, Math.abs(f.net))));
                
                return (
                  <div key={index} className="space-y-1">
                    <div className="text-sm font-medium text-gray-700">{flow.month}</div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 text-xs text-gray-500 text-right">Income</div>
                      <div className="flex-1 h-6 bg-gray-50 rounded relative">
                        <div
                          className="h-full bg-green-500 rounded flex items-center justify-end pr-2"
                          style={{ width: `${(flow.income / maxValue) * 100}%` }}
                        >
                          <span className="text-xs text-white font-medium">
                            {formatCurrency(flow.income)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 text-xs text-gray-500 text-right">Expenses</div>
                      <div className="flex-1 h-6 bg-gray-50 rounded relative">
                        <div
                          className="h-full bg-red-500 rounded flex items-center justify-end pr-2"
                          style={{ width: `${(flow.expenses / maxValue) * 100}%` }}
                        >
                          <span className="text-xs text-white font-medium">
                            {formatCurrency(flow.expenses)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 text-xs text-gray-500 text-right">Net</div>
                      <div className="flex-1 h-6 bg-gray-50 rounded relative">
                        <div
                          className={`h-full rounded flex items-center justify-end pr-2 ${
                            flow.net >= 0 ? 'bg-blue-500' : 'bg-orange-500'
                          }`}
                          style={{ width: `${(Math.abs(flow.net) / maxValue) * 100}%` }}
                        >
                          <span className="text-xs text-white font-medium">
                            {formatCurrency(flow.net)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tax Summary */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Tax Summary
          </h3>
          <div className="text-sm text-gray-500">{getDateRangeLabel()}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b">
              <div className="text-sm text-gray-600">Taxable Income</div>
              <div className="text-sm font-semibold text-gray-900">
                {formatCurrency(taxSummary.taxableIncome)}
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b">
              <div className="text-sm text-gray-600">Tax Rate</div>
              <div className="text-sm font-semibold text-gray-900">
                {taxSummary.taxRate.toFixed(2)}%
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b">
              <div className="text-sm text-gray-600">Gross Tax Amount</div>
              <div className="text-sm font-semibold text-gray-900">
                {formatCurrency(taxSummary.taxAmount)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b">
              <div className="text-sm text-gray-600">Deductions</div>
              <div className="text-sm font-semibold text-green-600">
                -{formatCurrency(taxSummary.deductions)}
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b">
              <div className="text-sm text-gray-600">Net Tax Payable</div>
              <div className="text-lg font-bold text-red-600">
                {formatCurrency(taxSummary.netTax)}
              </div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-xs text-blue-900">
                <strong>Note:</strong> Tax calculations are estimates. Consult with a tax professional for accurate filing.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
