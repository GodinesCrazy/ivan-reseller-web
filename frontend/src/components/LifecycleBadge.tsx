import { lifecycleToneClasses, resolveOperationalLifecycleStage } from '@/utils/operational-lifecycle';
import type { OperationsTruthItem } from '@/types/operations';
import type { MlPublishPreflightPayload, MlPilotControlState } from '@/types/mercadolibre-preflight';

interface LifecycleBadgeProps {
  product?: { status?: string | null; validationState?: string | null } | null;
  operationsTruth?: OperationsTruthItem | null;
  preflight?: MlPublishPreflightPayload | null;
  pilotControl?: MlPilotControlState | null;
  className?: string;
}

export default function LifecycleBadge({
  product,
  operationsTruth,
  preflight,
  pilotControl,
  className = '',
}: LifecycleBadgeProps) {
  const stage = resolveOperationalLifecycleStage({ product, operationsTruth, preflight, pilotControl });
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${lifecycleToneClasses(stage.tone)} ${className}`}
      title={stage.detail}
    >
      {stage.label}
    </span>
  );
}
