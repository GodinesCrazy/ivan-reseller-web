import { useState, useEffect } from 'react';
import api from '@/services/api';
import type { ProductWorkflowStatus, WorkflowStage } from '@/types/product-workflow.types';
import { Search, Brain, Send, ShoppingCart, Package, MessageCircle } from 'lucide-react';

interface WorkflowProgressBarProps {
  productId: number;
  preloadedStatus?: ProductWorkflowStatus | null;
  className?: string;
}

const stageConfig: Record<WorkflowStage, { label: string; icon: any; shortLabel: string }> = {
  scrape: { label: 'SCRAPE', icon: Search, shortLabel: 'Búsqueda' },
  analyze: { label: 'ANALYZE', icon: Brain, shortLabel: 'Análisis' },
  publish: { label: 'PUBLISH', icon: Send, shortLabel: 'Publicación' },
  purchase: { label: 'PURCHASE', icon: ShoppingCart, shortLabel: 'Compra' },
  fulfillment: { label: 'FULFILLMENT', icon: Package, shortLabel: 'Envío' },
  customerService: { label: 'SERVICE', icon: MessageCircle, shortLabel: 'Servicio' },
};

export default function WorkflowProgressBar({ productId, preloadedStatus, className = '' }: WorkflowProgressBarProps) {
  const [workflowStatus, setWorkflowStatus] = useState<ProductWorkflowStatus | null>(preloadedStatus ?? null);
  const [loading, setLoading] = useState(!preloadedStatus);

  useEffect(() => {
    if (preloadedStatus !== undefined) {
      setWorkflowStatus(preloadedStatus ?? null);
      setLoading(false);
      return;
    }
    fetchWorkflowStatus();
  }, [productId, preloadedStatus]);

  const fetchWorkflowStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/products/${productId}/workflow-status`);
      
      if (response.data?.success && response.data?.data) {
        setWorkflowStatus(response.data.data);
      }
    } catch (err: any) {
      console.error('Error fetching workflow status:', err);
    } finally {
      setLoading(false);
    }
  };

  const effectiveStatus = preloadedStatus ?? workflowStatus;
  if (loading || !effectiveStatus) {
    return (
      <div className={`h-2 bg-gray-200 rounded-full animate-pulse ${className}`} />
    );
  }

  const stages: WorkflowStage[] = ['scrape', 'analyze', 'publish', 'purchase', 'fulfillment', 'customerService'];
  const currentStageIndex = stages.indexOf(effectiveStatus.currentStage);
  const progress = ((currentStageIndex + 1) / stages.length) * 100;

  return (
    <div className={`${className}`}>
      {/* Barra de progreso principal */}
      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
        {/* Indicadores de etapas */}
        <div className="absolute inset-0 flex items-center">
          {stages.map((stage, index) => {
            const stageInfo = effectiveStatus.stages[stage];
            const isCompleted = stageInfo.status === 'completed';
            const isCurrent = effectiveStatus.currentStage === stage;
            const isPending = index > currentStageIndex;
            
            return (
              <div
                key={stage}
                className="flex-1 flex items-center justify-center relative"
                style={{ zIndex: 1 }}
              >
                <div
                  className={`w-2 h-2 rounded-full border-2 transition-all ${
                    isCompleted
                      ? 'bg-green-500 border-green-600'
                      : isCurrent
                      ? 'bg-blue-600 border-blue-700 animate-pulse'
                      : isPending
                      ? 'bg-gray-300 border-gray-400'
                      : 'bg-yellow-400 border-yellow-500'
                  }`}
                  title={`${stageConfig[stage].label}: ${stageInfo.status}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Etiquetas de etapas */}
      <div className="flex justify-between text-xs text-gray-600 mt-1">
        {stages.map((stage) => {
          const stageInfo = effectiveStatus.stages[stage];
          const isCurrent = effectiveStatus.currentStage === stage;
          const isCompleted = stageInfo.status === 'completed';
          const Icon = stageConfig[stage].icon;

          return (
            <div
              key={stage}
              className={`flex flex-col items-center flex-1 ${
                isCurrent ? 'text-blue-600 font-semibold' : isCompleted ? 'text-green-600' : 'text-gray-400'
              }`}
              title={`${stageConfig[stage].label}: ${stageInfo.status} - ${stageInfo.mode === 'automatic' ? 'Auto' : 'Manual'}`}
            >
              <Icon className={`w-3 h-3 mb-0.5 ${isCurrent ? 'text-blue-600' : ''}`} />
              <span className="truncate max-w-[60px]">{stageConfig[stage].shortLabel}</span>
              {stageInfo.mode === 'automatic' && (
                <span className="text-[8px] text-blue-500">AUTO</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

