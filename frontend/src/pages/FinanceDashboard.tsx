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
  sales?: number;
  margin?: number;
}

interface CashFlow {
  month: string;
  date?: string;
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
  { id: 'overview', label: 'Resumen', icon: LayoutGrid },
  { id: 'sales-ledger', label: 'Libro de Ventas', icon: BookOpen },
  { id: 'working-capital', label: 'Capital de Trabajo', icon: PiggyBank },
  { id: 'leverage-risk', label: 'Apalancamiento', icon: Shield },
  { id: 'top-products', label: 'Top Productos', icon: Award },
  { id: 'capital-allocation', label: 'Asignación Capital', icon: Target },
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
      
      toast.success(`Reporte exportado como ${format.toUpperCase()}`);
    } catch (error: any) {
      toast.error('Error al exportar reporte');
    }
  };

  const getDateRangeLabel = () => {
    switch (dateRange) {
      case 'week': return 'Últimos 7 días';
      case 'month': return 'Últimos 30 días';
      case 'quarter': return 'Últimos 90 días';
      case 'year': return 'Últimos 365 días';
      default: return 'Últimos 30 días';
    }
  };

  const formatCurrency = (amount: number) => formatMoney(amount);

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${safeNumber(value).toFixed(2)}%`;
  };

  const isLoadingTab = loading && activeTab === 'overview';

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Finanzas</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">KPIs consolidados: ventas, comisiones, pagos y saldos</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5" title="Origen de los datos">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <strong>Analytics vs proof:</strong> Summary/Ledger provienen de ventas registradas; la ganancia realizada probada requiere proof ladder (payout ejecutado). La proyección de beneficio es estimada. El capital puede venir de PayPal API o de tu configuración.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Entorno: {environment === 'production' ? 'producción' : environment === 'sandbox' ? 'sandbox' : 'todos'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => { loadFinancialData(); loadSalesLedger(); loadWorkingCapital(); loadLeverageRisk(); loadTopProducts(); loadCapitalAllocation(); }}
            className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
          <div className="relative">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="px-3 py-1.5 pr-9 text-sm border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary-500 appearance-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors"
            >
              <option value="week">Últimos 7 días</option>
              <option value="month">Últimos 30 días</option>
              <option value="quarter">Últimos 90 días</option>
              <option value="year">Último año</option>
            </select>
            <Calendar className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative group">
            <button className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-1.5 transition-colors">
              <Download className="w-3.5 h-3.5" />
              Exportar
            </button>
            <div className="absolute right-0 mt-1.5 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg hidden group-hover:block z-10 overflow-hidden">
              <button
                onClick={() => exportReport('pdf')}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-900 dark:text-slate-100 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                Exportar como PDF
              </button>
              <button
                onClick={() => exportReport('excel')}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-900 dark:text-slate-100 transition-colors border-t border-slate-100 dark:border-slate-800"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                Exportar como Excel
              </button>
              <button
                onClick={() => exportReport('csv')}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-900 dark:text-slate-100 transition-colors border-t border-slate-100 dark:border-slate-800"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                Exportar como CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Row */}
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex items-center gap-1 min-w-max">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === id
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'sales-ledger' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Estado de cuenta (Libro de Ventas)</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {getDateRangeLabel()} · Solo ventas reales (excluye simulaciones). La columna Payout indica si hay proof de fondos liberados; la ganancia realizada probada se confirma con proof ladder.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Orden</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Producto</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Marketplace</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Venta</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Costo</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Bruto</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Margen</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">ROI</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {salesLedger.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">Sin ventas en el período</td></tr>
                ) : (
                  salesLedger.map((s) => (
                    <tr key={s.orderId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-900 dark:text-slate-100">{s.orderId.slice(0, 12)}</td>
                      <td className="px-4 py-2.5 max-w-[200px] truncate text-slate-900 dark:text-slate-100" title={s.productTitle}>{s.productTitle}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{s.marketplace}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(s.salePrice)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(s.totalCost)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-green-600 dark:text-green-400">{formatCurrency(s.grossProfit)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{s.marginPercent.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{s.roiPercent.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{s.payoutExecuted ? '✓' : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'working-capital' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {workingCapitalDetail ? (
            <>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
                <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Capital de Trabajo</h3>
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-xs text-slate-500">Efectivo disponible</span><span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(workingCapitalDetail.availableCash)}</span></div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs text-slate-500">En PayPal</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatCurrency(workingCapitalDetail.inPayPal)}</span>
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
                          { label: 'No disponible', title: unavailableTitle, className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' };
                        return (
                          <span title={badge.title} className={`px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                        );
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-xs text-slate-500">En Payoneer</span><span className="tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(workingCapitalDetail.inPayoneer)}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-slate-500">Retenido por Marketplace</span><span className="tabular-nums text-orange-600 dark:text-orange-400">{formatCurrency(workingCapitalDetail.retainedByMarketplace)}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-slate-500">En tránsito</span><span className="tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(workingCapitalDetail.inTransit)}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-slate-500">Comprometido en órdenes</span><span className="tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(workingCapitalDetail.committedToOrders)}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-slate-500">Exposición (Listados activos)</span><span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(workingCapitalDetail.exposureFromActiveListings)}</span></div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
                <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Apalancamiento y Riesgo</h3>
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-xs text-slate-500">Capital total</span><span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(workingCapitalDetail.totalCapital)}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-slate-500">ICLR</span><span className="tabular-nums text-slate-900 dark:text-slate-100">{workingCapitalDetail.inventoryCapitalLeverageRatio.toFixed(3)}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-slate-500">OLR (Óptimo)</span><span className="tabular-nums text-slate-900 dark:text-slate-100">{workingCapitalDetail.optimalLeverageRatio.toFixed(2)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Nivel de riesgo</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      workingCapitalDetail.riskLevel === 'LOW' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      workingCapitalDetail.riskLevel === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>{workingCapitalDetail.riskLevel}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-2 text-center py-8 text-slate-500 dark:text-slate-400">Cargando...</div>
          )}
        </div>
      )}

      {activeTab === 'leverage-risk' && leverageRisk && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
            <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Apalancamiento</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-xs text-slate-500">ICLR</span><span className="tabular-nums text-slate-900 dark:text-slate-100">{leverageRisk.leverage.iclr.toFixed(3)}</span></div>
              <div className="flex justify-between"><span className="text-xs text-slate-500">OLR</span><span className="tabular-nums text-slate-900 dark:text-slate-100">{leverageRisk.leverage.olr.toFixed(2)}</span></div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">Riesgo</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${leverageRisk.leverage.riskLevel === 'LOW' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : leverageRisk.leverage.riskLevel === 'MEDIUM' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'}`}>
                  {leverageRisk.leverage.riskLevel}
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
            <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Riesgo</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-xs text-slate-500">Riesgo simultáneo máx.</span><span className="tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(leverageRisk.risk.worstCaseCost)}</span></div>
              <div className="flex justify-between"><span className="text-xs text-slate-500">Buffer de capital</span><span className="tabular-nums text-green-600 dark:text-green-400">{formatCurrency(leverageRisk.risk.capitalBuffer)}</span></div>
              <div className="flex justify-between"><span className="text-xs text-slate-500">Buffer %</span><span className="tabular-nums text-slate-900 dark:text-slate-100">{leverageRisk.risk.bufferPercent.toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-xs text-slate-500">Ratio de rotación</span><span className="tabular-nums text-slate-900 dark:text-slate-100">{leverageRisk.risk.capitalTurnover.toFixed(2)}x</span></div>
            </div>
          </div>
          <div className="md:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
            <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Asignación de Capital</h3>
            <div className="flex flex-wrap gap-4 text-sm text-slate-900 dark:text-slate-100">
              <span>Puede publicar: <strong>{leverageRisk.capitalAllocation.canPublish ? 'Sí' : 'No'}</strong></span>
              <span>Exposición restante: <span className="tabular-nums">{formatCurrency(leverageRisk.capitalAllocation.remainingExposure)}</span></span>
              <span>Exposición actual: <span className="tabular-nums">{formatCurrency(leverageRisk.capitalAllocation.currentExposure)}</span></span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'top-products' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Top Productos (WinningScore heurístico)</h2>
            <button
              onClick={loadTopProducts}
              className="text-xs font-medium px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Actualizar
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Producto</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ventas</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Margen prom.</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">ROI prom.</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Velocidad</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ef. Capital</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">WinningScore</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {topProducts.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">Sin datos de productos</td></tr>
                ) : (
                  topProducts.map((p) => (
                    <tr key={p.productId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-2.5 max-w-[250px] truncate text-slate-900 dark:text-slate-100" title={p.productTitle}>{p.productTitle}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{p.totalSales}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{p.avgMargin.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{p.avgROI.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{p.salesVelocity.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{p.capitalEfficiency.toFixed(2)}x</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{p.winningScore.toFixed(1)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'capital-allocation' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
          <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Estado de Asignación de Capital</h3>
          {allocation ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-lg text-sm font-medium ${allocation.canPublish ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'}`}>
                  {allocation.canPublish ? 'Publicación permitida' : 'Publicación bloqueada'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-slate-500">Exposición restante</div>
                  <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">{formatCurrency(allocation.remainingExposure)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Máximo permitido</div>
                  <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">{formatCurrency(allocation.maxExposureAllowed)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Exposición actual</div>
                  <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">{formatCurrency(allocation.currentExposure)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Riesgo</div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{allocation.riskLevel}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 dark:text-slate-400">Cargando...</div>
          )}
        </div>
      )}

      {activeTab === 'overview' && isLoadingTab && (
        <div className="animate-pulse space-y-5">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-48"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'overview' && !isLoadingTab && (
        <>
      <div className="mb-1">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Los totales inferidos del sales ledger (ventas con payout); la ganancia realizada probada se confirma con proof ladder en Control Center.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Beneficio neto (ledger)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(financialData.netProfit)}</p>
              <p className="text-xs text-slate-500 mt-1">Ventas registradas; after taxes & fees</p>
            </div>
            <div className="w-11 h-11 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
              <Wallet className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Beneficio bruto (ledger)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(financialData.profit)}</p>
              <p className="text-xs text-slate-500 mt-1">Margen: {formatPercentage(financialData.margin)}</p>
            </div>
            <div className="w-11 h-11 shrink-0 bg-green-100 dark:bg-green-900/40 rounded-xl flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Ingresos totales</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(financialData.revenue)}</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">De todas las fuentes</p>
            </div>
            <div className="w-11 h-11 shrink-0 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Gastos totales</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(financialData.expenses)}</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">Todos los costos operativos</p>
            </div>
            <div className="w-11 h-11 shrink-0 bg-red-100 dark:bg-red-900/40 rounded-xl flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Profit Projection */}
      {profitProjection && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
            <Target className="w-5 h-5 text-slate-500" />
            Proyección mensual (estimación)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">No es proof; es referencia analítica basada en histórico o defaults.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-500">Utilidad proyectada</div>
              <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">{formatCurrency(profitProjection.projectedMonthlyProfit)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Ventas proyectadas/mes</div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">{profitProjection.projectedMonthlySales.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Utilidad por venta</div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">{formatCurrency(profitProjection.avgProfitPerSale)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Metodología</div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                {profitProjection.methodology === 'historical'
                  ? 'Histórica (90 días)'
                  : 'Por defecto (nuevo usuario)'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Confianza: {Math.round(profitProjection.confidence * 100)}%
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Basado en {profitProjection.activeListings} listados activos
            {profitProjection.methodology === 'historical' && profitProjection.historicalSales != null && (
              <> · {profitProjection.historicalSales} ventas en los últimos 90 días</>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Esta proyección es una estimación, no un dato contable.</p>
        </div>
      )}

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Comisiones pagadas</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(financialData.commissions)}</p>
              <p className="text-xs text-slate-500 mt-1">A afiliados y partners</p>
            </div>
            <div className="w-11 h-11 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
              <Receipt className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Impuestos pagados</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(financialData.taxes)}</p>
              <p className="text-xs text-slate-500 mt-1">Total obligaciones tributarias</p>
            </div>
            <div className="w-11 h-11 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
              <Receipt className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Capital Metrics Section */}
      {financialData.workingCapital && financialData.capitalMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Capital de Trabajo
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500">Capital total</div>
                <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCurrency(financialData.workingCapital.total)}
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500">Comprometido</div>
                <div className="text-lg font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                  {formatCurrency(financialData.workingCapital.committed)}
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500">Disponible</div>
                <div className={`text-lg font-semibold tabular-nums ${
                  financialData.workingCapital.available > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatCurrency(financialData.workingCapital.available)}
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">Tasa de utilización</span>
                  <span className="text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {safeNumber(financialData.workingCapital?.utilizationRate).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
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

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              Rendimiento del Capital
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500">Rotación de capital</div>
                <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {financialData.capitalMetrics.capitalTurnover.toFixed(2)}x
                </div>
              </div>
              <div className="text-xs text-slate-500 mb-4">
                Ingreso por dólar de capital de trabajo
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500">Tiempo prom. de recuperación</div>
                <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {safeNumber(financialData.capitalMetrics?.averageRecoveryDays).toFixed(1)} días
                </div>
              </div>
              <div className="text-xs text-slate-500 mb-4">
                Promedio desde compra hasta pago
              </div>
              {financialData.cashFlowMetrics && (
                <>
                  <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500">Ventas pendientes</div>
                    <div className="text-lg font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                      {formatCurrency(financialData.cashFlowMetrics.pendingSalesValue)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500">Flujo de caja real</div>
                    <div className={`text-lg font-semibold tabular-nums ${
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
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-slate-500" />
            Desglose por Categoría
          </h3>
          <div className="text-xs text-slate-500">{getDateRangeLabel()}</div>
        </div>

        {categoryBreakdown.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            Sin datos de categoría disponibles
          </div>
        ) : (
          <div className="space-y-4">
            {categoryBreakdown.map((category, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{category.category}</div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-slate-500">Ingresos: <span className="tabular-nums">{formatCurrency(category.revenue ?? category.sales ?? 0)}</span></span>
                    <span className="text-slate-500">Gastos: <span className="tabular-nums">{formatCurrency(category.expenses ?? ((category.sales ?? category.revenue ?? 0) - (category.profit ?? 0)))}</span></span>
                    <span className={`font-semibold tabular-nums ${category.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      Ganancia: {formatCurrency(category.profit)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${category.profit >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, category.percentage ?? category.margin ?? 0)}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-slate-500 min-w-[60px] text-right">
                    {safeNumber(category.percentage ?? category.margin).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cash Flow Chart */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-slate-500" />
            Análisis de Flujo de Caja
          </h3>
          <div className="text-xs text-slate-500">{getDateRangeLabel()}</div>
        </div>

        {cashFlow.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            Sin datos de flujo de caja disponibles
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-6 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-sm"></div>
                <span className="text-slate-500">Ingresos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-red-500 rounded-sm"></div>
                <span className="text-slate-500">Gastos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-sm"></div>
                <span className="text-slate-500">Neto</span>
              </div>
            </div>

            <div className="space-y-3">
              {cashFlow.map((flow, index) => {
                const maxValue = Math.max(...cashFlow.map(f => Math.max(f.income, f.expenses, Math.abs(f.net))));
                
                return (
                  <div key={index} className="space-y-1">
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300">{flow.date ?? flow.month}</div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 text-[11px] text-slate-500 text-right">Ingresos</div>
                      <div className="flex-1 h-5 bg-slate-50 dark:bg-slate-800 rounded relative">
                        <div
                          className="h-full bg-green-500 rounded flex items-center justify-end pr-2"
                          style={{ width: `${(flow.income / maxValue) * 100}%` }}
                        >
                          <span className="text-[10px] text-white font-medium tabular-nums">
                            {formatCurrency(flow.income)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 text-[11px] text-slate-500 text-right">Gastos</div>
                      <div className="flex-1 h-5 bg-slate-50 dark:bg-slate-800 rounded relative">
                        <div
                          className="h-full bg-red-500 rounded flex items-center justify-end pr-2"
                          style={{ width: `${(flow.expenses / maxValue) * 100}%` }}
                        >
                          <span className="text-[10px] text-white font-medium tabular-nums">
                            {formatCurrency(flow.expenses)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 text-[11px] text-slate-500 text-right">Neto</div>
                      <div className="flex-1 h-5 bg-slate-50 dark:bg-slate-800 rounded relative">
                        <div
                          className={`h-full rounded flex items-center justify-end pr-2 ${
                            flow.net >= 0 ? 'bg-blue-500' : 'bg-orange-500'
                          }`}
                          style={{ width: `${(Math.abs(flow.net) / maxValue) * 100}%` }}
                        >
                          <span className="text-[10px] text-white font-medium tabular-nums">
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
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-slate-500" />
            Resumen de Impuestos
          </h3>
          <div className="text-xs text-slate-500">{getDateRangeLabel()}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">Ingreso gravable</div>
              <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatCurrency(taxSummary.taxableIncome)}
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">Tasa impositiva</div>
              <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {safeNumber(taxSummary.taxRate).toFixed(2)}%
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">Impuesto bruto</div>
              <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatCurrency(taxSummary.taxAmount)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">Deducciones</div>
              <div className="text-sm font-semibold tabular-nums text-green-600 dark:text-green-400">
                -{formatCurrency(taxSummary.deductions)}
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">Impuesto neto a pagar</div>
              <div className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
                {formatCurrency(taxSummary.netTax)}
              </div>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-xs text-blue-900 dark:text-blue-200">
                <strong>Nota:</strong> Los cálculos de impuestos son estimaciones. Consulta con un profesional tributario para la declaración precisa.
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
