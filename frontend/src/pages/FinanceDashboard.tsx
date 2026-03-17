import { useState, useEffect } from 'react';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import { 
  DollarSign, 
  TrendingUp, 
  PieChart,
  BarChart3,
  Calendar,
  Download,
  RefreshCw,
  CreditCard,
  Wallet,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  LayoutGrid,
  BookOpen,
  PiggyBank,
  Shield,
  Award,
  Target,
  RotateCcw,
  Info
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';
import { useCurrency } from '../hooks/useCurrency';
import { useEnvironment } from '@/contexts/EnvironmentContext';

interface FinancialData {
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  commissions: number;
  taxes: number;
  netProfit: number;
  workingCapital?: {
    total: number;
    committed: number;
    available: number;
    utilizationRate: number;
  };
  capitalMetrics?: {
    capitalTurnover: number;
    averageRecoveryDays: number;
    averageWorkingCapital: number;
  };
  cashFlowMetrics?: {
    pendingSalesValue: number;
    paidSalesValue: number;
    realCashFlow: number;
    pendingSalesCount: number;
    paidSalesCount: number;
  };
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

interface SalesLedgerEntry {
  orderId: string;
  productId: number;
  productTitle: string;
  marketplace: string;
  salePrice: number;
  supplierCost: number;
  totalCost: number;
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
  roiPercent: number;
  payoutExecuted: boolean;
  payoutDate: string | null;
  marketplaceUrl: string | null;
  supplierUrl: string | null;
  dataIntegrityIssue: string[];
}

interface WorkingCapitalDetail {
  totalCapital: number;
  availableCash: number;
  retainedByMarketplace: number;
  inPayoneer: number;
  inPayPal: number;
  inPayPalSource?: 'wallet_api' | 'reporting_api_estimated' | 'manual_declared' | 'unavailable';
  inPayPalUnavailableReason?: 'no_credentials' | 'api_failed';
  inTransit: number;
  committedToOrders: number;
  exposureFromActiveListings: number;
  inventoryCapitalLeverageRatio: number;
  optimalLeverageRatio: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface LeverageRisk {
  leverage: { iclr: number; olr: number; riskLevel: string };
  capitalAllocation: { canPublish: boolean; remainingExposure: number; maxExposureAllowed: number; currentExposure: number };
  risk: { worstCaseCost: number; capitalBuffer: number; bufferPercent: number; capitalTurnover: number };
}

interface ProfitProjection {
  projectedMonthlyProfit: number;
  projectedMonthlySales: number;
  avgProfitPerSale: number;
  methodology: 'historical' | 'default';
  confidence: number;
  activeListings: number;
  historicalSales?: number;
  historicalActiveListings?: number;
}

interface TopProduct {
  productId: number;
  productTitle: string;
  totalSales: number;
  avgMargin: number;
  avgROI: number;
  salesVelocity: number;
  capitalEfficiency: number;
  winningScore: number;
}

type TabId = 'overview' | 'sales-ledger' | 'working-capital' | 'leverage-risk' | 'top-products' | 'capital-allocation';

const safeNumber = (v: unknown): number =>
  typeof v === 'number' && !Number.isNaN(v) ? v : 0;

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'sales-ledger', label: 'Sales Ledger', icon: BookOpen },
  { id: 'working-capital', label: 'Working Capital', icon: PiggyBank },
  { id: 'leverage-risk', label: 'Leverage & Risk', icon: Shield },
  { id: 'top-products', label: 'Top Products', icon: Award },
  { id: 'capital-allocation', label: 'Capital Allocation', icon: Target },
];

export default function FinanceDashboard() {
  const { formatMoney } = useCurrency();
  const { environment } = useEnvironment();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [salesLedger, setSalesLedger] = useState<SalesLedgerEntry[]>([]);
  const [workingCapitalDetail, setWorkingCapitalDetail] = useState<WorkingCapitalDetail | null>(null);
  const [leverageRisk, setLeverageRisk] = useState<LeverageRisk | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [allocation, setAllocation] = useState<any>(null);
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
  const [profitProjection, setProfitProjection] = useState<ProfitProjection | null>(null);

  useEffect(() => {
    loadFinancialData();
  }, [dateRange, environment]);

  useEffect(() => {
    if (activeTab === 'sales-ledger') loadSalesLedger();
    else if (activeTab === 'working-capital') loadWorkingCapital();
    else if (activeTab === 'leverage-risk') loadLeverageRisk();
    else if (activeTab === 'top-products') loadTopProducts();
    else if (activeTab === 'capital-allocation') loadCapitalAllocation();
  }, [activeTab, dateRange, environment]);

  const loadSalesLedger = async () => {
    try {
      const { data } = await api.get('/api/finance/sales-ledger', {
        params: { range: dateRange, environment },
      });
      setSalesLedger(data?.sales ?? []);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error loading sales ledger');
      }
    }
  };

  const loadWorkingCapital = async () => {
    try {
      const { data } = await api.get('/api/finance/working-capital-detail', {
        params: { environment },
      });
      setWorkingCapitalDetail(data?.detail ?? null);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error loading working capital');
      }
    }
  };

  const loadLeverageRisk = async () => {
    try {
      const { data } = await api.get('/api/finance/leverage-and-risk');
      setLeverageRisk(data ?? null);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error loading leverage & risk');
      }
    }
  };

  const loadTopProducts = async () => {
    try {
      const { data } = await api.get('/api/finance/top-products', { params: { days: 90 } });
      setTopProducts(data?.products ?? []);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error loading top products');
      }
    }
  };

  const loadCapitalAllocation = async () => {
    try {
      const { data } = await api.get('/api/finance/capital-allocation');
      setAllocation(data?.allocation ?? null);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error loading capital allocation');
      }
    }
  };

  const loadFinancialData = async () => {
    setLoading(true);
    try {
      const [summaryRes, breakdownRes, cashFlowRes, taxRes, projectionRes] = await Promise.all([
        api.get('/api/finance/summary', { params: { range: dateRange, environment } }),
        api.get('/api/finance/breakdown', { params: { range: dateRange, environment } }),
        api.get('/api/finance/cashflow', { params: { range: dateRange, environment } }),
        api.get('/api/finance/tax-summary', { params: { range: dateRange, environment } }),
        api.get('/api/finance/profit-projection')
      ]);

      setFinancialData(summaryRes.data?.summary || financialData);
      setCategoryBreakdown(breakdownRes.data?.breakdown || []);
      setCashFlow(cashFlowRes.data?.cashFlow || []);
      setTaxSummary(taxRes.data?.taxSummary || taxSummary);
      setProfitProjection(projectionRes.data?.projection ?? null);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error loading financial data: ' + (error.response?.data?.error || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  useLiveData({
    fetchFn: () => {
      void loadFinancialData();
      if (activeTab === 'sales-ledger') void loadSalesLedger();
    },
    intervalMs: 30000,
    enabled: activeTab === 'overview' || activeTab === 'sales-ledger',
  });
  useNotificationRefetch({
    handlers: { SALE_CREATED: loadFinancialData, COMMISSION_CALCULATED: loadFinancialData },
    enabled: true,
  });

  const exportReport = async (format: 'pdf' | 'excel' | 'csv') => {
    try {
      const { data } = await api.get(`/api/finance/export/${format}`, {
        params: { range: dateRange, environment },
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

  // Moneda del usuario desde settings (useCurrency: API /api/settings + localStorage)
  const formatCurrency = (amount: number) => formatMoney(amount);

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${safeNumber(value).toFixed(2)}%`;
  };

  const isLoadingTab = loading && activeTab === 'overview';

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Finance Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Consolidated KPIs: sales, commissions, payouts and balances</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5" title="Origen de los datos">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Los datos de Summary, Ledger, Cashflow y Tax provienen de ventas y comisiones registradas. La proyección de beneficio es una estimación. El capital disponible puede venir de la API de PayPal o de tu configuración.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Datos actualizados en cada carga.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-4 py-2 flex items-center gap-2 text-sm font-medium ${
                  activeTab === id
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { loadFinancialData(); loadSalesLedger(); loadWorkingCapital(); loadLeverageRisk(); loadTopProducts(); loadCapitalAllocation(); }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <div className="relative">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 appearance-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
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
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg hidden group-hover:block z-10">
              <button
                onClick={() => exportReport('pdf')}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-900 dark:text-gray-100"
              >
                <Download className="w-4 h-4" />
                Export as PDF
              </button>
              <button
                onClick={() => exportReport('excel')}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-900 dark:text-gray-100"
              >
                <Download className="w-4 h-4" />
                Export as Excel
              </button>
              <button
                onClick={() => exportReport('csv')}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-900 dark:text-gray-100"
              >
                <Download className="w-4 h-4" />
                Export as CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'sales-ledger' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Estado de cuenta (Sales Ledger)</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {getDateRangeLabel()} · Solo ventas reales (excluye simulaciones)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300">Order</th>
                  <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300">Product</th>
                  <th className="px-4 py-2 text-gray-600 dark:text-gray-300">Marketplace</th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Sale</th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Cost</th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Gross</th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Margin</th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">ROI</th>
                  <th className="px-4 py-2 text-gray-600 dark:text-gray-300">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {salesLedger.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No sales in period</td></tr>
                ) : (
                  salesLedger.map((s) => (
                    <tr key={s.orderId}>
                      <td className="px-4 py-2 font-mono text-xs text-gray-900 dark:text-gray-100">{s.orderId.slice(0, 12)}</td>
                      <td className="px-4 py-2 max-w-[200px] truncate text-gray-900 dark:text-gray-100" title={s.productTitle}>{s.productTitle}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{s.marketplace}</td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">{formatCurrency(s.salePrice)}</td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">{formatCurrency(s.totalCost)}</td>
                      <td className="px-4 py-2 text-right text-green-600 dark:text-green-400">{formatCurrency(s.grossProfit)}</td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">{s.marginPercent.toFixed(1)}%</td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">{s.roiPercent.toFixed(1)}%</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{s.payoutExecuted ? '✓' : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'working-capital' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workingCapitalDetail ? (
            <>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Working Capital</h3>
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Available Cash</span><span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(workingCapitalDetail.availableCash)}</span></div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-gray-600">In PayPal</span>
                    <span className="flex items-center gap-2">
                      {formatCurrency(workingCapitalDetail.inPayPal)}
                      {(() => {
                        const src = workingCapitalDetail.inPayPalSource ?? (workingCapitalDetail.inPayPal === 0 ? 'unavailable' : undefined);
                        if (!src) return null;
                        const reason = workingCapitalDetail.inPayPalUnavailableReason;
                        const unavailableTitle = reason === 'api_failed'
                          ? 'No se pudo obtener el saldo. En developer.paypal.com > Apps & Credentials > Ivan_reseller (Live) activa "Balance and Transaction Information" o contacta a PayPal si la API de balance no está disponible para tu cuenta. Alternativa: actualiza tu capital de trabajo en Configuración > Config. workflows para ver un valor estimado en In PayPal.'
                          : 'Configura PayPal en Configuración > API Settings para ver tu saldo. Alternativa: actualiza tu capital de trabajo en Configuración > Config. workflows para ver un valor estimado en In PayPal.';
                        const badge = src === 'wallet_api' ? { label: 'Real', title: 'Saldo real requiere permiso wallet:read en la app PayPal', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' } :
                          src === 'reporting_api_estimated' ? { label: 'Estimado', title: 'Saldo estimado desde transacciones recientes', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' } :
                          src === 'manual_declared' ? { label: 'Declarado', title: 'Saldo introducido manualmente en Config. workflows. La API de PayPal no está disponible para tu cuenta.', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' } :
                          { label: 'No disponible', title: unavailableTitle, className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' };
                        return (
                          <span title={badge.title} className={`px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                        );
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">In Payoneer</span><span className="text-gray-900 dark:text-gray-100">{formatCurrency(workingCapitalDetail.inPayoneer)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Retained by Marketplace</span><span className="text-orange-600 dark:text-orange-400">{formatCurrency(workingCapitalDetail.retainedByMarketplace)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">In Transit</span><span className="text-gray-900 dark:text-gray-100">{formatCurrency(workingCapitalDetail.inTransit)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Committed to Orders</span><span className="text-gray-900 dark:text-gray-100">{formatCurrency(workingCapitalDetail.committedToOrders)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Exposure (Active Listings)</span><span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(workingCapitalDetail.exposureFromActiveListings)}</span></div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Leverage & Risk</h3>
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Total Capital</span><span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(workingCapitalDetail.totalCapital)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">ICLR</span><span className="text-gray-900 dark:text-gray-100">{workingCapitalDetail.inventoryCapitalLeverageRatio.toFixed(3)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">OLR (Optimal)</span><span className="text-gray-900 dark:text-gray-100">{workingCapitalDetail.optimalLeverageRatio.toFixed(2)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Risk Level</span>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${
                      workingCapitalDetail.riskLevel === 'LOW' ? 'bg-green-100 text-green-800' :
                      workingCapitalDetail.riskLevel === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>{workingCapitalDetail.riskLevel}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-2 text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
          )}
        </div>
      )}

      {activeTab === 'leverage-risk' && leverageRisk && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Leverage</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">ICLR</span><span className="text-gray-900 dark:text-gray-100">{leverageRisk.leverage.iclr.toFixed(3)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">OLR</span><span className="text-gray-900 dark:text-gray-100">{leverageRisk.leverage.olr.toFixed(2)}</span></div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Risk</span>
                <span className={`px-2 py-1 rounded ${leverageRisk.leverage.riskLevel === 'LOW' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : leverageRisk.leverage.riskLevel === 'MEDIUM' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'}`}>
                  {leverageRisk.leverage.riskLevel}
                </span>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Risk</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Max Simultaneous Risk</span><span className="text-gray-900 dark:text-gray-100">{formatCurrency(leverageRisk.risk.worstCaseCost)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Capital Buffer</span><span className="text-green-600 dark:text-green-400">{formatCurrency(leverageRisk.risk.capitalBuffer)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Buffer %</span><span className="text-gray-900 dark:text-gray-100">{leverageRisk.risk.bufferPercent.toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Turnover Ratio</span><span className="text-gray-900 dark:text-gray-100">{leverageRisk.risk.capitalTurnover.toFixed(2)}x</span></div>
            </div>
          </div>
          <div className="md:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Capital Allocation</h3>
            <div className="flex flex-wrap gap-4 text-gray-900 dark:text-gray-100">
              <span>Can Publish: <strong>{leverageRisk.capitalAllocation.canPublish ? 'Yes' : 'No'}</strong></span>
              <span>Remaining Exposure: {formatCurrency(leverageRisk.capitalAllocation.remainingExposure)}</span>
              <span>Current Exposure: {formatCurrency(leverageRisk.capitalAllocation.currentExposure)}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'top-products' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top Products (WinningScore)</h2>
            <button
              onClick={loadTopProducts}
              className="text-sm px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
            >
              <RotateCcw className="w-4 h-4" />
              Replicar
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300">Product</th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Sales</th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Avg Margin</th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Avg ROI</th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Velocity</th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Cap.Eff</th>
                  <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">WinningScore</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {topProducts.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No product data</td></tr>
                ) : (
                  topProducts.map((p) => (
                    <tr key={p.productId}>
                      <td className="px-4 py-2 max-w-[250px] truncate text-gray-900 dark:text-gray-100" title={p.productTitle}>{p.productTitle}</td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">{p.totalSales}</td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">{p.avgMargin.toFixed(1)}%</td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">{p.avgROI.toFixed(1)}%</td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">{p.salesVelocity.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">{p.capitalEfficiency.toFixed(2)}x</td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">{p.winningScore.toFixed(1)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'capital-allocation' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Capital Allocation Status</h3>
          {allocation ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded font-medium ${allocation.canPublish ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'}`}>
                  {allocation.canPublish ? 'Publishing allowed' : 'Publishing blocked'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><div className="text-sm text-gray-600 dark:text-gray-400">Remaining Exposure</div><div className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(allocation.remainingExposure)}</div></div>
                <div><div className="text-sm text-gray-600 dark:text-gray-400">Max Allowed</div><div className="text-gray-900 dark:text-gray-100">{formatCurrency(allocation.maxExposureAllowed)}</div></div>
                <div><div className="text-sm text-gray-600 dark:text-gray-400">Current Exposure</div><div className="text-gray-900 dark:text-gray-100">{formatCurrency(allocation.currentExposure)}</div></div>
                <div><div className="text-sm text-gray-600 dark:text-gray-400">Risk</div><div className="text-gray-900 dark:text-gray-100">{allocation.riskLevel}</div></div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 dark:text-gray-400">Loading...</div>
          )}
        </div>
      )}

      {activeTab === 'overview' && isLoadingTab && (
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4"></div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'overview' && !isLoadingTab && (
        <>
      {/* Main Stats Cards — Phase 34: Net Profit first, then Gross Profit, Revenue, Expenses */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 border-2 border-emerald-500/50 dark:border-emerald-500/50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Net Profit</div>
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {formatCurrency(financialData.netProfit)}
          </div>
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
            <span>After taxes & fees</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Gross Profit</div>
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {formatCurrency(financialData.profit)}
          </div>
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
            <span>Margin: {formatPercentage(financialData.margin)}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Revenue</div>
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {formatCurrency(financialData.revenue)}
          </div>
          <div className="flex items-center text-sm text-green-600 dark:text-green-400">
            <ArrowUpRight className="w-4 h-4 mr-1" />
            <span>Revenue from all sources</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Expenses</div>
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <CreditCard className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {formatCurrency(financialData.expenses)}
          </div>
          <div className="flex items-center text-sm text-red-600 dark:text-red-400">
            <ArrowDownRight className="w-4 h-4 mr-1" />
            <span>All operational costs</span>
          </div>
        </div>
      </div>

      {/* Monthly Profit Projection */}
      {profitProjection && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Proyección mensual estimada
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Utilidad proyectada</div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(profitProjection.projectedMonthlyProfit)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Ventas proyectadas/mes</div>
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{profitProjection.projectedMonthlySales.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Utilidad por venta</div>
              <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(profitProjection.avgProfitPerSale)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Metodología</div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {profitProjection.methodology === 'historical'
                  ? 'Histórica (90 días)'
                  : 'Por defecto (nuevo usuario)'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Confianza: {Math.round(profitProjection.confidence * 100)}%
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Basado en {profitProjection.activeListings} listados activos
            {profitProjection.methodology === 'historical' && profitProjection.historicalSales != null && (
              <> · {profitProjection.historicalSales} ventas en los últimos 90 días</>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Esta proyección es una estimación, no un dato contable.</p>
        </div>
      )}

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Commissions Paid</div>
            <Receipt className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(financialData.commissions)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            To affiliates and partners
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Taxes Paid</div>
            <Receipt className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(financialData.taxes)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Total tax obligations
          </div>
        </div>
      </div>

      {/* Capital Metrics Section */}
      {financialData.workingCapital && financialData.capitalMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Working Capital Card */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Working Capital
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Capital</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(financialData.workingCapital.total)}
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400">Committed</div>
                <div className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                  {formatCurrency(financialData.workingCapital.committed)}
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400">Available</div>
                <div className={`text-lg font-semibold ${
                  financialData.workingCapital.available > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatCurrency(financialData.workingCapital.available)}
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Utilization Rate</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {safeNumber(financialData.workingCapital?.utilizationRate).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      financialData.workingCapital.utilizationRate < 70
                        ? 'bg-green-500'
                        : financialData.workingCapital.utilizationRate < 90
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(safeNumber(financialData.workingCapital?.utilizationRate), 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Capital Performance Card */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              Capital Performance
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400">Capital Turnover</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {financialData.capitalMetrics.capitalTurnover.toFixed(2)}x
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Revenue per dollar of working capital
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400">Avg. Recovery Time</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {safeNumber(financialData.capitalMetrics?.averageRecoveryDays).toFixed(1)} days
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Average time from purchase to payment
              </div>
              {financialData.cashFlowMetrics && (
                <>
                  <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Pending Sales Value</div>
                    <div className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                      {formatCurrency(financialData.cashFlowMetrics.pendingSalesValue)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Real Cash Flow</div>
                    <div className={`text-lg font-semibold ${
                      financialData.cashFlowMetrics.realCashFlow >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {formatCurrency(financialData.cashFlowMetrics.realCashFlow)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            Breakdown by Category
          </h3>
          <div className="text-sm text-gray-500 dark:text-gray-400">{getDateRangeLabel()}</div>
        </div>

        {categoryBreakdown.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No category data available
          </div>
        ) : (
          <div className="space-y-4">
            {categoryBreakdown.map((category, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{category.category}</div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-600 dark:text-gray-400">Revenue: {formatCurrency(category.revenue ?? category.sales ?? 0)}</span>
                    <span className="text-gray-600 dark:text-gray-400">Expenses: {formatCurrency(category.expenses ?? ((category.sales ?? category.revenue ?? 0) - (category.profit ?? 0)))}</span>
                    <span className={`font-semibold ${category.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      Profit: {formatCurrency(category.profit)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${category.profit >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, category.percentage ?? category.margin ?? 0)}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[60px] text-right">
                    {safeNumber(category.percentage ?? category.margin).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cash Flow Chart */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            Cash Flow Analysis
          </h3>
          <div className="text-sm text-gray-500 dark:text-gray-400">{getDateRangeLabel()}</div>
        </div>

        {cashFlow.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
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
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{flow.date ?? flow.month}</div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 text-xs text-gray-500 dark:text-gray-400 text-right">Income</div>
                      <div className="flex-1 h-6 bg-gray-50 dark:bg-gray-700 rounded relative">
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
                      <div className="w-20 text-xs text-gray-500 dark:text-gray-400 text-right">Expenses</div>
                      <div className="flex-1 h-6 bg-gray-50 dark:bg-gray-700 rounded relative">
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
                      <div className="w-20 text-xs text-gray-500 dark:text-gray-400 text-right">Net</div>
                      <div className="flex-1 h-6 bg-gray-50 dark:bg-gray-700 rounded relative">
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
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            Tax Summary
          </h3>
          <div className="text-sm text-gray-500 dark:text-gray-400">{getDateRangeLabel()}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">Taxable Income</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(taxSummary.taxableIncome)}
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">Tax Rate</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {safeNumber(taxSummary.taxRate).toFixed(2)}%
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">Gross Tax Amount</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(taxSummary.taxAmount)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">Deductions</div>
              <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                -{formatCurrency(taxSummary.deductions)}
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">Net Tax Payable</div>
              <div className="text-lg font-bold text-red-600 dark:text-red-400">
                {formatCurrency(taxSummary.netTax)}
              </div>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-xs text-blue-900 dark:text-blue-200">
                <strong>Note:</strong> Tax calculations are estimates. Consult with a tax professional for accurate filing.
              </div>
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
