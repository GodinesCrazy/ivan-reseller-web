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
  Target
} from 'lucide-react';
import { toast } from 'sonner';

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

  useEffect(() => {
    if (activeTab === 'executive') {
      loadExecutiveReport();
    } else if (activeTab === 'successful-operations') {
      loadSuccessfulOperations();
    }
  }, [activeTab]);

  const loadExecutiveReport = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/reports/executive', {
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
      console.error('Error loading executive report:', error);
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
    } catch (error) {
      console.error('Error loading successful operations:', error);
      toast.error('Error al cargar operaciones exitosas');
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

      const response = await fetch(`/api/reports/${activeTab}?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
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
      console.error('Error generating report:', error);
      toast.error('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const renderSummaryCards = (summary: ReportSummary) => {
    const cards = [
      { title: 'Ventas Totales', value: summary.totalSales || 0, icon: DollarSign },
      { title: 'Ingresos', value: `$${(summary.totalRevenue || 0).toLocaleString()}`, icon: TrendingUp },
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
                ${performer.totalRevenue.toLocaleString()}
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
                {successStats.avgProfitAccuracy?.toFixed(1) || 0}%
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
                  {learningPatterns.avgProfitAccuracy?.toFixed(1) || 0}%
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
                {successStats.avgCustomerSatisfaction?.toFixed(1) || 0}/5
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
        <TabsList className="grid w-full grid-cols-6">
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

        {/* Successful Operations Tab */}
        <TabsContent value="successful-operations">
          {renderSuccessfulOperations()}
        </TabsContent>
      </Tabs>
    </div>
  );
}