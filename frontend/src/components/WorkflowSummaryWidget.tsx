import { useState, useEffect } from 'react';
import { Workflow, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from './ui/LoadingSpinner';
import api from '@/services/api';

interface WorkflowSummary {
  totalProducts: number;
  byStage: {
    scrape: number;
    analyze: number;
    publish: number;
    purchase: number;
    fulfillment: number;
    customerService: number;
  };
  byStatus: {
    completed: number;
    in_progress: number;
    pending: number;
    failed: number;
  };
}

export default function WorkflowSummaryWidget() {
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Por ahora, cargar desde productos y calcular resumen básico
    // En el futuro se puede crear un endpoint específico /api/dashboard/workflow-summary
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      setLoading(true);
      // ✅ FIX: Manejo robusto de errores - degradación suave
      const response = await api.get('/api/products').catch((err) => {
        // Si es error de red/CORS, no mostrar error rojo, solo degradar
        if (!err.response) {
          console.warn('⚠️  No se pudo cargar resumen de workflows (error de conexión). Mostrando datos vacíos.');
        }
        // Retornar estructura vacía para degradación suave
        return { data: { data: { products: [] }, products: [] } };
      });
      
      const products = response.data?.data?.products || response.data?.products || response.data || [];
      
      // Calcular resumen básico (simplificado)
      const summary: WorkflowSummary = {
        totalProducts: products.length || 0,
        byStage: {
          scrape: products.filter((p: any) => p.status === 'PENDING').length,
          analyze: products.filter((p: any) => p.status === 'APPROVED' && !p.isPublished).length,
          publish: products.filter((p: any) => p.isPublished).length,
          purchase: 0, // Se calcularía desde Sales
          fulfillment: 0, // Se calcularía desde Sales con status SHIPPED
          customerService: 0, // Se calcularía desde Sales con status CANCELLED/RETURNED
        },
        byStatus: {
          completed: products.filter((p: any) => p.isPublished && p.status === 'PUBLISHED').length,
          in_progress: products.filter((p: any) => p.status === 'APPROVED' && !p.isPublished).length,
          pending: products.filter((p: any) => p.status === 'PENDING').length,
          failed: products.filter((p: any) => p.status === 'REJECTED').length,
        },
      };

      setSummary(summary);
    } catch (error) {
      // ✅ FIX: Degradación suave - no mostrar error rojo, solo loggear
      console.warn('⚠️  Error loading workflow summary (degradación suave):', error);
      // Establecer resumen vacío en lugar de null para que el componente no desaparezca
      setSummary({
        totalProducts: 0,
        byStage: { scrape: 0, analyze: 0, publish: 0, purchase: 0, fulfillment: 0, customerService: 0 },
        byStatus: { completed: 0, in_progress: 0, pending: 0, failed: 0 }
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="w-5 h-5" />
            Resumen de Workflows
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSpinner text="Cargando..." />
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const activeWorkflows = summary.byStatus.in_progress + summary.byStatus.pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Workflow className="w-5 h-5 text-blue-600" />
          Resumen de Workflows
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total de productos */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="text-sm font-medium text-gray-700">Total de Productos</span>
          <Badge className="bg-blue-100 text-blue-700">{summary.totalProducts}</Badge>
        </div>

        {/* Workflows activos */}
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
          <span className="text-sm font-medium text-blue-700">Workflows Activos</span>
          <Badge className="bg-blue-600 text-white">
            {activeWorkflows}
          </Badge>
        </div>

        {/* Distribución por etapa */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-600 uppercase">Por Etapa</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span className="text-gray-600">SCRAPE</span>
              <Badge className="bg-gray-200 text-gray-700 text-xs">{summary.byStage.scrape}</Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span className="text-gray-600">ANALYZE</span>
              <Badge className="bg-gray-200 text-gray-700 text-xs">{summary.byStage.analyze}</Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span className="text-gray-600">PUBLISH</span>
              <Badge className="bg-gray-200 text-gray-700 text-xs">{summary.byStage.publish}</Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span className="text-gray-600">PURCHASE</span>
              <Badge className="bg-gray-200 text-gray-700 text-xs">{summary.byStage.purchase}</Badge>
            </div>
          </div>
        </div>

        {/* Estado general */}
        <div className="space-y-2 pt-2 border-t">
          <h4 className="text-xs font-semibold text-gray-600 uppercase">Estado General</h4>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 text-green-600" />
                <span className="text-gray-600">Completados</span>
              </div>
              <span className="font-medium">{summary.byStatus.completed}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-blue-600" />
                <span className="text-gray-600">En Progreso</span>
              </div>
              <span className="font-medium">{summary.byStatus.in_progress}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3 h-3 text-yellow-600" />
                <span className="text-gray-600">Pendientes</span>
              </div>
              <span className="font-medium">{summary.byStatus.pending}</span>
            </div>
            {summary.byStatus.failed > 0 && (
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-3 h-3 text-red-600" />
                  <span className="text-gray-600">Fallidos</span>
                </div>
                <span className="font-medium text-red-600">{summary.byStatus.failed}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

