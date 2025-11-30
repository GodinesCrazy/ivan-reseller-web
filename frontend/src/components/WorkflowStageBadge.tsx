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

  // Colores por estado - mejorado contraste
  const getStatusColors = () => {
    switch (status) {
      case 'completed':
        return 'bg-green-600 text-white border-2 border-green-700 shadow-md font-bold';
      case 'in-progress':
      case 'active':
        return 'bg-blue-600 text-white border-2 border-blue-700 shadow-md font-bold';
      case 'pending':
        return 'bg-gray-400 text-white border-2 border-gray-500 shadow-md font-semibold';
      case 'failed':
        return 'bg-red-600 text-white border-2 border-red-700 shadow-md font-bold';
      case 'skipped':
      case 'not-needed':
        return 'bg-gray-300 text-gray-700 border-2 border-gray-400 shadow-sm';
      default:
        return 'bg-gray-400 text-white border-2 border-gray-500 shadow-md';
    }
  };

  // Colores por modo - mejorado contraste
  const getModeColors = () => {
    switch (mode) {
      case 'automatic':
        return 'bg-blue-500 text-white border-2 border-blue-600 font-bold shadow-md';
      case 'manual':
        return 'bg-orange-500 text-white border-2 border-orange-600 font-bold shadow-md';
      case 'guided':
        return 'bg-purple-500 text-white border-2 border-purple-600 font-bold shadow-md';
      default:
        return 'bg-gray-400 text-white border-2 border-gray-500 font-semibold';
    }
  };

  // Borde especial si es etapa actual - mejorado contraste
  const borderClass = isCurrent ? 'ring-4 ring-blue-500 ring-offset-4 bg-blue-50 shadow-xl transform scale-105' : '';

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

