import { useState, useEffect } from 'react';
import { Workflow, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ProductWorkflowPipeline from './ProductWorkflowPipeline';
import api from '@/services/api';

interface WorkflowStatusIndicatorProps {
  productId: number;
  currentStage?: string;
  className?: string;
}

const stageLabels: Record<string, string> = {
  scrape: 'SCRAPE',
  analyze: 'ANALYZE',
  publish: 'PUBLISH',
  purchase: 'PURCHASE',
  fulfillment: 'FULFILL',
  customerService: 'SERVICE',
};

export default function WorkflowStatusIndicator({
  productId,
  currentStage,
  className = '',
}: WorkflowStatusIndicatorProps) {
  const [showModal, setShowModal] = useState(false);
  const [fetchedStage, setFetchedStage] = useState<string | null>(null);

  // Si no se proporciona currentStage, intentar obtenerlo
  useEffect(() => {
    if (!currentStage && productId) {
      // Cargar el stage desde el endpoint (solo si es necesario)
      api.get(`/api/products/${productId}/workflow-status`)
        .then(response => {
          if (response.data?.success && response.data?.data?.currentStage) {
            setFetchedStage(response.data.data.currentStage);
          }
        })
        .catch(() => {
          // Silenciar error - solo es un indicador, no crítico
        });
    }
  }, [productId, currentStage]);

  const displayStage = currentStage || fetchedStage;
  const showBadge = displayStage && stageLabels[displayStage];

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`flex items-center gap-1.5 text-xs hover:bg-blue-50 px-2 py-1 rounded transition-colors ${className}`}
        title="Ver estado del workflow completo"
      >
        <Workflow className="w-4 h-4 text-blue-600" />
        {showBadge && (
          <Badge className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5">
            {stageLabels[displayStage!]}
          </Badge>
        )}
      </button>

      {/* Modal con pipeline completo */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold">Estado del Workflow</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <ProductWorkflowPipeline productId={productId} showTimeline={true} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

