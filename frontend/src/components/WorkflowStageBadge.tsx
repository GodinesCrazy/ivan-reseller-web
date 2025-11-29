import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertCircle, XCircle, Loader2, PauseCircle } from 'lucide-react';
import type { StageStatus, StageMode } from '@/types/product-workflow.types';

interface WorkflowStageBadgeProps {
  status: StageStatus;
  mode: StageMode;
  label: string;
  isCurrent?: boolean;
  className?: string;
}

export default function WorkflowStageBadge({
  status,
  mode,
  label,
  isCurrent = false,
  className = '',
}: WorkflowStageBadgeProps) {
  // Iconos por estado
  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'in-progress':
      case 'active':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'pending':
        return <PauseCircle className="w-4 h-4" />;
      case 'failed':
        return <XCircle className="w-4 h-4" />;
      case 'skipped':
      case 'not-needed':
        return <Clock className="w-4 h-4 opacity-50" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  // Colores por estado
  const getStatusColors = () => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'in-progress':
      case 'active':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'pending':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      case 'failed':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'skipped':
      case 'not-needed':
        return 'bg-gray-50 text-gray-400 border-gray-100';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  // Colores por modo
  const getModeColors = () => {
    switch (mode) {
      case 'automatic':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'manual':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'guided':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  // Borde especial si es etapa actual
  const borderClass = isCurrent ? 'ring-2 ring-blue-500 ring-offset-2' : '';

  return (
    <div className={`flex flex-col items-center gap-2 ${className} ${borderClass} p-3 rounded-lg transition-all`}>
      {/* Badge de estado */}
      <Badge className={`${getStatusColors()} flex items-center gap-1.5 px-3 py-1.5 font-semibold`}>
        {getStatusIcon()}
        <span className="text-xs uppercase">{label}</span>
      </Badge>

      {/* Badge de modo */}
      <Badge className={`${getModeColors()} text-xs px-2 py-0.5`}>
        {mode === 'automatic' ? 'AUTO' : mode === 'manual' ? 'MANUAL' : 'GUIDED'}
      </Badge>
    </div>
  );
}

