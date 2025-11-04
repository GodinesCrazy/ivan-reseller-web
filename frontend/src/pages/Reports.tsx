import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Download,
  FileText,
  TrendingUp,
  Users,
  Package,
  DollarSign,
  Calendar,
  Filter,
  Eye,
  RefreshCw,
  AlertCircle
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
      id: 'executive',
      name: 'Ejecutivo',
      icon: Eye,
      description: 'Dashboard completo con KPIs'
    }
  ];

  useEffect(() => {
    if (activeTab === 'executive') {
      loadExecutiveReport();
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
        <TabsList className="grid w-full grid-cols-5">
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
                  date={filters.startDate}
                  onDateChange={(date) => setFilters({ ...filters, startDate: date })}
                />
              </div>

              <div>
                <Label htmlFor="endDate">Fecha Fin</Label>
                <DatePicker
                  date={filters.endDate}
                  onDateChange={(date) => setFilters({ ...filters, endDate: date })}
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
      </Tabs>
    </div>
  );
}