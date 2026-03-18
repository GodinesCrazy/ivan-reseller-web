import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@services/api';
import { Button } from '@/components/ui/button';
// removed unused Input import
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  FileText,
  TrendingUp,
  Users,
  Package,
  DollarSign,
  Filter,
  Eye,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Brain,
  Target,
  BarChart3,
  Trophy
} from 'lucide-react';
import { toast } from 'sonner';
import { log } from '@/utils/logger';
import { useEnvironment } from '@/contexts/EnvironmentContext';

const safeNumber = (v: unknown): number =>
  typeof v === 'number' && !Number.isNaN(v) ? v : 0;

interface ReportFilters {
  startDate?: Date;
  endDate?: Date;
  userId?: number;
  marketplace?: string;
  status?: string;
  format?: string;
}

interface ReportSummary {
  totalSales?: number;
  totalRevenue?: number;
  totalProfit?: number;
  totalCommissions?: number;
  averageOrderValue?: number;
  totalProducts?: number;
  activeProducts?: number;
  totalUsers?: number;
  activeUsers?: number;
  averageConversion?: number;
}

interface MarketplaceAnalytics {
  marketplace: string;
  totalProducts: number;
  activeListings: number;
  totalSales: number;
  revenue: number;
  averagePrice: number;
  conversionRate: number;
  monthlyTrend: Array<{
    month: string;
    sales: number;
    revenue: number;
  }>;
}

/** Phase 2: Listing metrics from GET /api/analytics/listings */
interface ListingMetricRow {
  listingId: number;
  marketplaceListingId: string;
  marketplace: string;
  listingUrl: string | null;
  productId: number | null;
  productTitle: string | null;
  suggestedPrice: number | null;
  supplierStock: number | null;
  publishedAt: string | null;
  impressions: number;
  clicks: number;
  sales: number;
  conversionRate: number | null;
  price: number | null;
  competitorPrice: number | null;
  viewCount: number;
  /** Phase 37: health score 0-100 from backend (visibility, conversion, sales) */
  healthScore?: number;
}

/** Phase 34: Listing health score 0-100 from visibility, conversion, sales */
function listingHealthScore(r: ListingMetricRow): number {
  let score = 0;
  const imp = r.impressions ?? 0;
  const conv = r.conversionRate != null ? Number(r.conversionRate) * 100 : 0;
  const sales = r.sales ?? 0;
  if (imp > 0) score += Math.min(40, Math.floor(imp / 25));
  score += Math.min(40, Math.floor(conv * 10));
  if (sales > 0) score += 20;
  return Math.min(100, score);
}

interface ExecutiveReport {
  summary: ReportSummary;
  marketplaceBreakdown: MarketplaceAnalytics[];
  topPerformers: Array<{
    userId: number;
    username: string;
    totalProducts: number;
    totalSales: number;
    totalRevenue: number;
    conversionRate: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    users: number;
    products: number;
    sales: number;
    revenue: number;
  }>;
  alerts: Array<{
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function Reports() {
  const { environment } = useEnvironment();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('sales');
  const [reportData, setReportData] = useState<any>(null);
  const [executiveData, setExecutiveData] = useState<ExecutiveReport | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({
    format: 'json'
  });

  const reportTypes = [
    {
      id: 'sales',
      name: 'Ventas',
      icon: DollarSign,
      description: 'Reporte detallado de ventas y comisiones'
    },
    {
      id: 'products',
      name: 'Productos',
      icon: Package,
      description: 'Performance y métricas de productos'
    },
    {
      id: 'users',
      name: 'Usuarios',
      icon: Users,
      description: 'Rendimiento por usuario'
    },
    {
      id: 'marketplace-analytics',
      name: 'Marketplaces',
      icon: TrendingUp,
      description: 'Analytics comparativo por marketplace'
    },
    {
      id: 'listing-performance',
      name: 'Rendimiento Listings',
      icon: BarChart3,
      description: 'Impresiones, clics, ventas y conversión por listing (Phase 2)'
    },
    {
      id: 'winning-products',
      name: 'Productos Ganadores',
      icon: Trophy,
      description: 'Productos detectados como ganadores por impresiones, conversión y ventas (Phase 3)'
    },
    {
      id: 'successful-operations',
      name: 'Operaciones Exitosas',
      icon: TrendingUp,
      description: 'Estadísticas y patrones de aprendizaje de operaciones exitosas'
    },
    {
      id: 'executive',
      name: 'Ejecutivo',
      icon: Eye,
      description: 'Dashboard completo con KPIs'
    }
  ];

  const [successStats, setSuccessStats] = useState<any>(null);
  const [learningPatterns, setLearningPatterns] = useState<any>(null);

  const [listingAnalytics, setListingAnalytics] = useState<{ listings: ListingMetricRow[]; days: number; marketplace: string } | null>(null);
  const [listingAnalyticsLoading, setListingAnalyticsLoading] = useState(false);
  const [listingDays, setListingDays] = useState(30);
  const [listingMarketplace, setListingMarketplace] = useState<string>('');

  const [winningProducts, setWinningProducts] = useState<{ winners: any[]; days: number; marketplace: string } | null>(null);
  const [winningProductsLoading, setWinningProductsLoading] = useState(false);
  const [winningProductsDays, setWinningProductsDays] = useState(90);
  const [winningProductsMarketplace, setWinningProductsMarketplace] = useState<string>('');

  const loadListingAnalytics = async () => {
    setListingAnalyticsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('days', String(listingDays));
      params.set('limit', '100');
      if (listingMarketplace) params.set('marketplace', listingMarketplace);
      const res = await api.get(`/api/analytics/listings?${params.toString()}`);
      setListingAnalytics({
        listings: res.data?.listings ?? [],
        days: res.data?.days ?? listingDays,
        marketplace: res.data?.marketplace ?? (listingMarketplace || 'all'),
      });
    } catch (e) {
      log.error('Listing analytics load failed', e);
      toast.error('Error al cargar métricas de listings');
      setListingAnalytics(null);
    } finally {
      setListingAnalyticsLoading(false);
    }
  };

  const loadWinningProducts = async () => {
    setWinningProductsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('days', String(winningProductsDays));
      params.set('limit', '100');
      if (winningProductsMarketplace) params.set('marketplace', winningProductsMarketplace);
      const res = await api.get(`/api/analytics/winning-products?${params.toString()}`);
      setWinningProducts({
        winners: res.data?.winners ?? [],
        days: res.data?.days ?? winningProductsDays,
        marketplace: res.data?.marketplace ?? (winningProductsMarketplace || 'all'),
      });
    } catch (e) {
      log.error('Winning products load failed', e);
      toast.error('Error al cargar productos ganadores');
      setWinningProducts(null);
    } finally {
      setWinningProductsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'executive') {
      loadExecutiveReport();
    } else if (activeTab === 'successful-operations') {
      loadSuccessfulOperations();
    } else if (activeTab === 'listing-performance') {
      loadListingAnalytics();
    } else if (activeTab === 'winning-products') {
      loadWinningProducts();
    }
  }, [activeTab, environment]);

  useEffect(() => {
    if (activeTab === 'listing-performance') {
      loadListingAnalytics();
    }
  }, [listingDays, listingMarketplace]);

  useEffect(() => {
    if (activeTab === 'winning-products') {
      loadWinningProducts();
    }
  }, [winningProductsDays, winningProductsMarketplace]);

  const loadExecutiveReport = async () => {
    try {
      setLoading(true);
      const url = `/api/reports/executive${environment ? `?environment=${environment}` : ''}`;
      const response = await fetch(url, {
        credentials: 'include', // ✅ FIX AUTH: Incluir cookies
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Error al cargar el reporte ejecutivo');
      }

      const result = await response.json();
      setExecutiveData(result.data);
    } catch (error) {
      log.error('Error loading executive report:', error);
      toast.error('Error al cargar el reporte ejecutivo');
    } finally {
      setLoading(false);
    }
  };

  const loadSuccessfulOperations = async () => {
    try {
      setLoading(true);
      const [statsRes, patternsRes] = await Promise.all([
        api.get('/api/operations/success-stats'),
        api.get('/api/operations/learning-patterns')
      ]);

      setSuccessStats(statsRes.data?.stats);
      setLearningPatterns(patternsRes.data?.patterns);
    } catch (error: any) {
      log.error('Error loading successful operations:', error);
      const status = error?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error al cargar operaciones exitosas');
      }
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams();
      if (filters.startDate) {
        params.append('startDate', filters.startDate.toISOString());
      }
      if (filters.endDate) {
        params.append('endDate', filters.endDate.toISOString());
      }
      if (filters.userId) {
        params.append('userId', filters.userId.toString());
      }
      if (filters.marketplace) {
        params.append('marketplace', filters.marketplace);
      }
      if (filters.status) {
        params.append('status', filters.status);
      }
      if (filters.format) {
        params.append('format', filters.format);
      }
      if (environment) {
        params.append('environment', environment);
      }

      // Build headers conditionally (solo añadir Authorization si existe token)
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('token');
      if (token && token !== 'null' && token !== 'undefined') {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/reports/${activeTab}?${params}`, {
        headers,
        // Incluir cookies httpOnly si están presentes (producción usa cookies)
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Error al generar el reporte: ${response.statusText}`);
      }

      // Handle different formats
      if (filters.format === 'excel' || filters.format === 'pdf') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        const contentDisposition = response.headers.get('content-disposition');
        const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 
          `reporte_${activeTab}_${new Date().toISOString().split('T')[0]}.${filters.format}`;
        
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success('Reporte descargado exitosamente');
      } else if (filters.format === 'html') {
        const htmlContent = await response.text();
        const newWindow = window.open();
        if (newWindow) {
          newWindow.document.write(htmlContent);
          newWindow.document.close();
        }
      } else {
        // JSON format
        const result = await response.json();
        setReportData(result);
        toast.success('Reporte generado exitosamente');
      }
    } catch (error) {
      log.error('Error generating report:', error);
      toast.error('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const renderSummaryCards = (summary: ReportSummary) => {
    const cards = [
      { title: 'Ventas Totales', value: summary.totalSales || 0, icon: DollarSign },
      { title: 'Ingresos', value: `$${safeNumber(summary.totalRevenue).toLocaleString()}`, icon: TrendingUp },
      { title: 'Productos', value: summary.totalProducts || 0, icon: Package },
      { title: 'Usuarios', value: summary.totalUsers || 0, icon: Users }
    ];

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((card, index) => (
          <Card key={index}>
            <CardContent className="flex items-center p-4">
              <card.icon className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderMarketplaceChart = (data: MarketplaceAnalytics[]) => {
    const chartData = data.map(item => ({
      name: item.marketplace,
      revenue: item.revenue,
      sales: item.totalSales,
      conversion: item.conversionRate
    }));

    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="revenue" fill="#8884d8" name="Ingresos" />
          <Bar dataKey="sales" fill="#82ca9d" name="Ventas" />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderTrendChart = (data: any[]) => {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="sales" stroke="#8884d8" name="Ventas" />
          <Line type="monotone" dataKey="revenue" stroke="#82ca9d" name="Ingresos" />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const renderTopPerformers = (performers: any[]) => {
    return (
      <div className="space-y-3">
        {performers.slice(0, 5).map((performer, index) => (
          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">{performer.username}</p>
              <p className="text-sm text-gray-600">
                {performer.totalProducts} productos • {performer.totalSales} ventas
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold text-green-600">
                ${safeNumber(performer.totalRevenue).toLocaleString()}
              </p>
              <p className="text-sm text-gray-600">
                {performer.conversionRate.toFixed(1)}% conversión
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderAlerts = (alerts: ExecutiveReport['alerts']) => {
    const severityColors = {
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    };

    return (
      <div className="space-y-2">
        {alerts.map((alert, index) => (
          <div key={index} className={`p-3 rounded-lg flex items-start ${severityColors[alert.severity]}`}>
            <AlertCircle className="h-4 w-4 mr-2 mt-0.5" />
            <div>
              <p className="font-medium">{alert.type.toUpperCase()}</p>
              <p className="text-sm">{alert.message}</p>
            </div>
            <Badge variant="secondary" className="ml-auto">
              {alert.severity}
            </Badge>
          </div>
        ))}
      </div>
    );
  };

  // Render content for successful operations tab
  const renderSuccessfulOperations = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      );
    }

    if (!successStats || !learningPatterns) {
      return (
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No hay datos de operaciones exitosas disponibles</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Estadísticas Principales */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Operaciones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{successStats.total || 0}</div>
              <p className="text-xs text-gray-500 mt-1">Operaciones completadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Tasa de Éxito</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {successStats.successRate?.toFixed(1) || 0}%
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {successStats.successful || 0} exitosas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Precisión Promedio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {safeNumber(successStats.avgProfitAccuracy).toFixed(1)}%
              </div>
              <p className="text-xs text-gray-500 mt-1">Exactitud de predicción</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Días Promedio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {successStats.avgDaysToComplete?.toFixed(1) || 0}
              </div>
              <p className="text-xs text-gray-500 mt-1">Tiempo de ciclo completo</p>
            </CardContent>
          </Card>
        </div>

        {/* Problemas */}
        {(successStats.withReturns > 0 || successStats.withIssues > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                <span>Operaciones con Problemas</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl font-bold text-orange-600">{successStats.withReturns || 0}</div>
                  <p className="text-sm text-gray-600">Con Devoluciones</p>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{successStats.withIssues || 0}</div>
                  <p className="text-sm text-gray-600">Con Problemas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Patrones de Aprendizaje */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-purple-500" />
              <span>Patrones de Aprendizaje IA</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Precisión Promedio de Predicción</h4>
                <div className="text-2xl font-bold text-purple-600">
                  {safeNumber(learningPatterns.avgProfitAccuracy).toFixed(1)}%
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  La IA predice correctamente la ganancia en promedio
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Días Promedio para Completar</h4>
                <div className="text-2xl font-bold text-blue-600">
                  {learningPatterns.avgDaysToComplete?.toFixed(1) || 0} días
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Tiempo promedio desde publicación hasta entrega completa
                </p>
              </div>

              {learningPatterns.categories && Object.keys(learningPatterns.categories).length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3">Categorías Más Exitosas</h4>
                  <div className="space-y-2">
                    {Object.entries(learningPatterns.categories)
                      .sort(([, a]: any, [, b]: any) => b - a)
                      .slice(0, 5)
                      .map(([category, count]: [string, any]) => (
                        <div key={category} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm font-medium">{category}</span>
                          <span className="text-sm text-gray-600">{count} operaciones</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Satisfacción del Cliente */}
        {successStats.avgCustomerSatisfaction > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-green-500" />
                <span>Satisfacción del Cliente</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {safeNumber(successStats.avgCustomerSatisfaction).toFixed(1)}/5
              </div>
              <p className="text-sm text-gray-600 mt-2">Calificación promedio de clientes</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes y Analytics</h1>
          <p className="text-gray-600">Genera reportes detallados y analiza el rendimiento</p>
        </div>
        <Button onClick={generateReport} disabled={loading}>
          {loading ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 mr-2" />
          )}
          Generar Reporte
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1">
          {reportTypes.map((type) => (
            <TabsTrigger key={type.id} value={type.id}>
              <type.icon className="h-4 w-4 mr-2" />
              {type.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Report Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="h-5 w-5 mr-2" />
              Configuración del Reporte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="format">Formato</Label>
                <Select value={filters.format} onValueChange={(value) => setFilters({ ...filters, format: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">Vista en pantalla</SelectItem>
                    <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="startDate">Fecha Inicio</Label>
                <DatePicker
                  value={filters.startDate}
                  onChange={(date: Date | undefined) => setFilters({ ...filters, startDate: date })}
                />
              </div>

              <div>
                <Label htmlFor="endDate">Fecha Fin</Label>
                <DatePicker
                  value={filters.endDate}
                  onChange={(date: Date | undefined) => setFilters({ ...filters, endDate: date })}
                />
              </div>

              {activeTab === 'sales' && (
                <div>
                  <Label htmlFor="marketplace">Marketplace</Label>
                  <Select value={filters.marketplace} onValueChange={(value) => setFilters({ ...filters, marketplace: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      <SelectItem value="ebay">eBay</SelectItem>
                      <SelectItem value="mercadolibre">MercadoLibre</SelectItem>
                      <SelectItem value="amazon">Amazon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Executive Dashboard */}
        <TabsContent value="executive">
          {executiveData && (
            <div className="space-y-6">
              {renderSummaryCards(executiveData.summary)}
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Performance por Marketplace</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderMarketplaceChart(executiveData.marketplaceBreakdown)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Tendencia Mensual</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderTrendChart(executiveData.monthlyTrends)}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Performers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderTopPerformers(executiveData.topPerformers)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Alertas del Sistema</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {executiveData.alerts.length > 0 ? (
                      renderAlerts(executiveData.alerts)
                    ) : (
                      <p className="text-gray-500 text-center py-4">
                        No hay alertas activas
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Other report tabs */}
        {reportTypes.slice(0, -1).map((type) => (
          <TabsContent key={type.id} value={type.id}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <type.icon className="h-5 w-5 mr-2" />
                  {type.name}
                </CardTitle>
                <p className="text-gray-600">{type.description}</p>
              </CardHeader>
              <CardContent>
                {reportData && reportData.summary && (
                  <>
                    {renderSummaryCards(reportData.summary)}
                    
                    {reportData.data && reportData.data.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              {Object.keys(reportData.data[0]).map((key) => (
                                <th key={key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {reportData.data.slice(0, 10).map((row: any, index: number) => (
                              <tr key={index} className="hover:bg-gray-50">
                                {Object.values(row).map((value: any, cellIndex) => (
                                  <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {value?.toString() || '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {reportData.data.length > 10 && (
                          <p className="text-center text-gray-500 py-4">
                            Mostrando 10 de {reportData.data.length} registros. 
                            Usa formato Excel o PDF para ver todos los datos.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">
                          Configura los filtros y genera un reporte para ver los datos
                        </p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        {/* Listing Performance (Phase 2) */}
        <TabsContent value="listing-performance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Rendimiento por listing
              </CardTitle>
              <p className="text-gray-600">Impresiones, clics, ventas y conversión desde GET /api/analytics/listings</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div>
                  <Label>Días</Label>
                  <Select value={String(listingDays)} onValueChange={(v) => setListingDays(Number(v))}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7</SelectItem>
                      <SelectItem value="30">30</SelectItem>
                      <SelectItem value="90">90</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Marketplace</Label>
                  <Select value={listingMarketplace || 'all'} onValueChange={(v) => setListingMarketplace(v === 'all' ? '' : v)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="ebay">eBay</SelectItem>
                      <SelectItem value="mercadolibre">MercadoLibre</SelectItem>
                      <SelectItem value="amazon">Amazon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={loadListingAnalytics} disabled={listingAnalyticsLoading}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${listingAnalyticsLoading ? 'animate-spin' : ''}`} />
                  Actualizar
                </Button>
              </div>

              {listingAnalyticsLoading && (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              )}

              {!listingAnalyticsLoading && listingAnalytics && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-gray-600">Impresiones</p>
                        <p className="text-2xl font-bold">
                          {listingAnalytics.listings.reduce((s, r) => s + (r.impressions || 0), 0).toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-gray-600">Clics</p>
                        <p className="text-2xl font-bold">
                          {listingAnalytics.listings.reduce((s, r) => s + (r.clicks || 0), 0).toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-gray-600">Ventas</p>
                        <p className="text-2xl font-bold">
                          {listingAnalytics.listings.reduce((s, r) => s + (r.sales || 0), 0).toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-gray-600">Conv. promedio</p>
                        <p className="text-2xl font-bold">
                          {(() => {
                            const withRate = listingAnalytics.listings.filter((r) => r.conversionRate != null && r.conversionRate > 0);
                            if (withRate.length === 0) return '—';
                            const avg = withRate.reduce((s, r) => s + (r.conversionRate ?? 0), 0) / withRate.length;
                            return `${(avg * 100).toFixed(2)}%`;
                          })()}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {listingAnalytics.listings.length > 0 && (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={['ebay', 'mercadolibre', 'amazon'].map((mp) => {
                          const rows = listingAnalytics!.listings.filter((r) => r.marketplace === mp);
                          return {
                            name: mp,
                            impresiones: rows.reduce((s, r) => s + r.impressions, 0),
                            clics: rows.reduce((s, r) => s + r.clicks, 0),
                            ventas: rows.reduce((s, r) => s + r.sales, 0),
                          };
                        })}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="impresiones" fill="#0088FE" name="Impresiones" />
                        <Bar dataKey="clics" fill="#00C49F" name="Clics" />
                        <Bar dataKey="ventas" fill="#FFBB28" name="Ventas" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Listing / Producto</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Marketplace</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Impresiones</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Clics</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">CTR</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ventas</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Conv.%</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Salud</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {listingAnalytics.listings.slice(0, 50).map((r) => {
                          const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : null;
                          const health = r.healthScore ?? listingHealthScore(r);
                          return (
                            <tr key={`${r.listingId}-${r.marketplace}`}>
                              <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 truncate max-w-[200px]" title={r.productTitle ?? ''}>
                                {r.productTitle ?? r.marketplaceListingId}
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{r.marketplace}</td>
                              <td className="px-3 py-2 text-sm text-right">{r.impressions.toLocaleString()}</td>
                              <td className="px-3 py-2 text-sm text-right">{r.clicks.toLocaleString()}</td>
                              <td className="px-3 py-2 text-sm text-right">{ctr != null ? `${ctr.toFixed(2)}%` : '—'}</td>
                              <td className="px-3 py-2 text-sm text-right">{r.sales.toLocaleString()}</td>
                              <td className="px-3 py-2 text-sm text-right">
                                {r.conversionRate != null ? `${(Number(r.conversionRate) * 100).toFixed(2)}%` : '—'}
                              </td>
                              <td className="px-3 py-2 text-sm text-right">
                                <span className={`font-medium ${health >= 60 ? 'text-green-600 dark:text-green-400' : health >= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`} title="Visibilidad, conversión y ventas">
                                  {health}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {listingAnalytics.listings.length > 50 && (
                      <p className="text-center text-gray-500 py-2 text-sm">Mostrando 50 de {listingAnalytics.listings.length} listings</p>
                    )}
                  </div>
                </>
              )}

              {!listingAnalyticsLoading && listingAnalytics && listingAnalytics.listings.length === 0 && (
                <p className="text-gray-500 text-center py-8">No hay datos de listings en el período seleccionado.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Winning Products (Phase 3) */}
        <TabsContent value="winning-products">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Productos ganadores
              </CardTitle>
              <p className="text-gray-600">Detectados por impresiones, conversión y velocidad de ventas (motor Phase 3)</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div>
                  <Label>Días</Label>
                  <Select value={String(winningProductsDays)} onValueChange={(v) => setWinningProductsDays(Number(v))}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30</SelectItem>
                      <SelectItem value="90">90</SelectItem>
                      <SelectItem value="365">365</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Marketplace</Label>
                  <Select value={winningProductsMarketplace || 'all'} onValueChange={(v) => setWinningProductsMarketplace(v === 'all' ? '' : v)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="ebay">eBay</SelectItem>
                      <SelectItem value="mercadolibre">MercadoLibre</SelectItem>
                      <SelectItem value="amazon">Amazon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={loadWinningProducts} disabled={winningProductsLoading}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${winningProductsLoading ? 'animate-spin' : ''}`} />
                  Actualizar
                </Button>
              </div>
              {winningProductsLoading && (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              )}
              {!winningProductsLoading && winningProducts && winningProducts.winners.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Marketplace</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Score</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ventas</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Velocidad</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Conv.%</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Detectado</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {winningProducts.winners.map((w: any) => (
                        <tr key={w.id}>
                          <td className="px-3 py-2 text-sm text-gray-900 truncate max-w-[220px]" title={w.productTitle ?? ''}>{w.productTitle ?? `Product ${w.productId}`}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{w.marketplace}</td>
                          <td className="px-3 py-2 text-sm text-right font-medium">{typeof w.score === 'number' ? w.score.toFixed(2) : w.score}</td>
                          <td className="px-3 py-2 text-sm text-right">{w.sales != null ? w.sales : '—'}</td>
                          <td className="px-3 py-2 text-sm text-right">{w.salesVelocity != null ? w.salesVelocity.toFixed(2) : '—'}</td>
                          <td className="px-3 py-2 text-sm text-right">{w.conversionRate != null ? `${(w.conversionRate * 100).toFixed(2)}%` : '—'}</td>
                          <td className="px-3 py-2 text-sm text-gray-500">{w.detectedAt ? new Date(w.detectedAt).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!winningProductsLoading && winningProducts && winningProducts.winners.length === 0 && (
                <p className="text-gray-500 text-center py-8">No hay productos ganadores detectados en el período. El worker se ejecuta diariamente.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Successful Operations Tab */}
        <TabsContent value="successful-operations">
          {renderSuccessfulOperations()}
        </TabsContent>
      </Tabs>
    </div>
  );
}