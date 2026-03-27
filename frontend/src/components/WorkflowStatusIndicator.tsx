import { useState, useEffect } from 'react';
import { Workflow, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ProductWorkflowPipeline from './ProductWorkflowPipeline';
import { fetchOperationsTruth } from '@/services/operationsTruth.api';
import type { OperationsTruthItem } from '@/types/operations';

interface WorkflowStatusIndicatorProps {
  productId: number;
  currentStage?: string;
  preloadedCurrentStage?: string | null;
  className?: string;
}

function getLiveStateLabel(state: string | null | undefined): string {
  const normalized = String(state || '').trim().toLowerCase();
  if (!normalized) return 'ops';
  return normalized;
}

function getLiveStateBadgeClass(state: string | null | undefined): string {
  const normalized = String(state || '').trim().toLowerCase();
  if (normalized === 'active') return 'bg-green-100 text-green-700';
  if (normalized === 'under_review') return 'bg-amber-100 text-amber-700';
  if (normalized === 'paused') return 'bg-orange-100 text-orange-700';
  if (normalized === 'failed_publish' || normalized === 'not_found') return 'bg-red-100 text-red-700';
  return 'bg-blue-100 text-blue-700';
}

export default function WorkflowStatusIndicator({
  productId,
  currentStage: _currentStage,
  preloadedCurrentStage: _preloadedCurrentStage,
  className = '',
}: WorkflowStatusIndicatorProps) {
  const [showModal, setShowModal] = useState(false);
  const [opsTruth, setOpsTruth] = useState<OperationsTruthItem | null>(null);

  useEffect(() => {
    if (!productId) return;
    fetchOperationsTruth({ ids: [productId] })
      .then((response) => {
        const item = response.items.find((candidate) => candidate.productId === productId) ?? null;
        if (item) {
          setOpsTruth(item);
        }
      })
      .catch(() => {});
  }, [productId]);

  const badgeLabel = opsTruth?.blockerCode || getLiveStateLabel(opsTruth?.externalMarketplaceState);
  const badgeClass = getLiveStateBadgeClass(opsTruth?.externalMarketplaceState);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`flex items-center gap-1.5 text-xs hover:bg-blue-50 px-2 py-1 rounded transition-colors ${className}`}
        title="Ver estado del workflow completo"
      >
        <Workflow className="w-4 h-4 text-blue-600" />
        {badgeLabel && (
          <Badge className={`${badgeClass} text-xs px-1.5 py-0.5`}>
            {badgeLabel}
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

