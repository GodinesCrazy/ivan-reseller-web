import { useState, useEffect } from 'react';
import { 
  Search, 
  Brain, 
  Send, 
  ShoppingCart, 
  Package, 
  MessageCircle,
  Globe,
  Settings,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import WorkflowStageBadge from './WorkflowStageBadge';
import WorkflowTimeline from './WorkflowTimeline';
import LoadingSpinner from './ui/LoadingSpinner';
import api from '@/services/api';
import type { ProductWorkflowStatus, WorkflowStage } from '@/types/product-workflow.types';

interface ProductWorkflowPipelineProps {
  productId: number;
  className?: string;
  showTimeline?: boolean;
  compact?: boolean;
}

const stageConfig: Record<WorkflowStage, { label: string; icon: any; description: string }> = {
  scrape: {
    label: 'SCRAPE',
    icon: Search,
    description: 'Búsqueda de Oportunidades',
  },
  analyze: {
    label: 'ANALYZE',
    icon: Brain,
    description: 'Análisis IA',
  },
  publish: {
    label: 'PUBLISH',
    icon: Send,
    description: 'Publicación',
  },
  purchase: {
    label: 'PURCHASE',
    icon: ShoppingCart,
    description: 'Compra Automática',
  },
  fulfillment: {
    label: 'FULFILLMENT',
    icon: Package,
    description: 'Cumplimiento',
  },
  customerService: {
    label: 'SERVICE',
    icon: MessageCircle,
    description: 'Atención al Cliente',
  },
};

export default function ProductWorkflowPipeline({
  productId,
  className = '',
  showTimeline = true,
  compact = false,
}: ProductWorkflowPipelineProps) {
  const [workflowStatus, setWorkflowStatus] = useState<ProductWorkflowStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkflowStatus();
  }, [productId]);

  const fetchWorkflowStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/api/products/${productId}/workflow-status`);
      
      if (response.data?.success && response.data?.data) {
        setWorkflowStatus(response.data.data);
      } else {
        setError('No se pudo cargar el estado del workflow');
      }
    } catch (err: any) {
      console.error('Error fetching workflow status:', err);
      setError(err?.response?.data?.error || 'Error al cargar estado del workflow');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`${className}`}>
        <Card>
          <CardContent className="p-6">
            <LoadingSpinner text="Cargando estado del workflow..." />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !workflowStatus) {
    return (
      <div className={`${className}`}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <span>{error || 'Estado del workflow no disponible'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stages: WorkflowStage[] = ['scrape', 'analyze', 'publish', 'purchase', 'fulfillment', 'customerService'];

  return (
    <div className={`${className}`}>
      <Card className="bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold text-gray-800">Estado del Workflow</CardTitle>
            <div className="flex items-center gap-2">
              {/* Badge de ambiente */}
              <Badge
                className={
                  workflowStatus.environment === 'production'
                    ? 'bg-green-600 text-white border-2 border-green-700 font-bold shadow-md'
                    : 'bg-yellow-500 text-white border-2 border-yellow-600 font-bold shadow-md'
                }
              >
                <Globe className="w-3 h-3 mr-1" />
                {workflowStatus.environment.toUpperCase()}
              </Badge>
              
              {/* Badge de modo general */}
              <Badge className={
                workflowStatus.stages[workflowStatus.currentStage]?.mode === 'automatic'
                  ? 'bg-blue-600 text-white border-2 border-blue-700 font-bold shadow-md'
                  : 'bg-orange-500 text-white border-2 border-orange-600 font-bold shadow-md'
              }>
                <Settings className="w-3 h-3 mr-1" />
                Modo: {workflowStatus.stages[workflowStatus.currentStage]?.mode === 'automatic' ? 'Automático' : 'Manual'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pipeline de etapas */}
          <div className="relative">
            {/* Línea conectora (horizontal en desktop, vertical en mobile) */}
            <div className="hidden md:block absolute top-12 left-0 right-0 h-1 bg-gradient-to-r from-blue-300 via-indigo-300 to-purple-300 z-0 shadow-sm" />
            
            {/* Etapas */}
            <div className={`relative z-10 ${compact ? 'grid grid-cols-3 gap-4' : 'flex flex-wrap gap-6 md:flex-nowrap md:justify-between'}`}>
              {stages.map((stage, index) => {
                const config = stageConfig[stage];
                const stageInfo = workflowStatus.stages[stage];
                const isCurrent = workflowStatus.currentStage === stage;
                const Icon = config.icon;

                return (
                  <div key={stage} className="flex flex-col items-center flex-1 min-w-[120px]">
                    <WorkflowStageBadge
                      status={stageInfo.status}
                      mode={stageInfo.mode}
                      label={config.label}
                      isCurrent={isCurrent}
                      className="w-full"
                    />
                    
                    {!compact && (
                      <div className="mt-2 text-center">
                        <p className="text-xs text-gray-600 font-medium">{config.description}</p>
                        {stageInfo.completedAt && (
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(stageInfo.completedAt).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </p>
                        )}
                        {stageInfo.nextAction && (
                          <p className="text-xs text-blue-600 mt-1 italic">
                            {stageInfo.nextAction}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Conector (solo en desktop, entre etapas) */}
                    {!compact && index < stages.length - 1 && (
                      <div className="hidden md:block absolute top-12" style={{ left: `${((index + 1) * 100) / stages.length}%`, transform: 'translateX(-50%)' }}>
                        <ChevronRight className="w-5 h-5 text-gray-300" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Indicador de etapa actual */}
            {!compact && (
              <div className="mt-6 text-center">
                <Badge className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-2 border-blue-700 px-4 py-2 shadow-lg">
                  <span className="text-sm font-bold uppercase">
                    ETAPA ACTUAL: {stageConfig[workflowStatus.currentStage]?.label}
                  </span>
                </Badge>
              </div>
            )}
          </div>

          {/* Timeline */}
          {showTimeline && workflowStatus.timeline && workflowStatus.timeline.length > 0 && (
            <div className="border-t pt-6">
              <WorkflowTimeline events={workflowStatus.timeline} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

