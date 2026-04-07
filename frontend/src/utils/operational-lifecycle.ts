import type { OperationsTruthItem } from '@/types/operations';
import type { MlPublishPreflightPayload, MlPilotControlState } from '@/types/mercadolibre-preflight';

type ProductLike = {
  status?: string | null;
  validationState?: string | null;
};

export interface OperationalLifecycleStage {
  key:
    | 'sourced'
    | 'evaluation'
    | 'preflight_blocked'
    | 'ready_local'
    | 'ready_international'
    | 'pilot_pending_approval'
    | 'pilot_ready'
    | 'pilot_blocked'
    | 'published_under_review'
    | 'listed_active'
    | 'listed_paused'
    | 'published_failed'
    | 'order_received'
    | 'fulfillment_in_progress'
    | 'shipped'
    | 'delivered'
    | 'completed'
    | 'aborted'
    | 'rollback';
  label: string;
  detail: string;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger';
}

export function lifecycleToneClasses(tone: OperationalLifecycleStage['tone']): string {
  if (tone === 'success') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
  if (tone === 'warning') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  if (tone === 'danger') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
  if (tone === 'info') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
}

export function resolveOperationalLifecycleStage(input: {
  product?: ProductLike | null;
  operationsTruth?: OperationsTruthItem | null;
  preflight?: MlPublishPreflightPayload | null;
  pilotControl?: MlPilotControlState | null;
}): OperationalLifecycleStage {
  const productStatus = String(input.product?.validationState || input.product?.status || '').toUpperCase();
  const truth = input.operationsTruth;
  const preflight = input.preflight;
  const pilotControl = input.pilotControl?.state;

  if (pilotControl === 'aborted') {
    return {
      key: 'aborted',
      label: 'Aborted',
      detail: 'Pilot detenido por operador.',
      tone: 'danger',
    };
  }
  if (pilotControl === 'rollback_requested' || pilotControl === 'rollback_completed') {
    return {
      key: 'rollback',
      label: pilotControl === 'rollback_completed' ? 'Rollback completed' : 'Rollback requested',
      detail: 'Control state operativo de rollback activo.',
      tone: 'warning',
    };
  }

  if (truth?.realizedProfitObtained) {
    return {
      key: 'completed',
      label: 'Completed',
      detail: 'Proof ladder completa con ganancia realizada.',
      tone: 'success',
    };
  }
  if (truth?.deliveredTruthObtained) {
    return {
      key: 'delivered',
      label: 'Delivered',
      detail: 'Entrega verificada en truth operacional.',
      tone: 'success',
    };
  }
  if (truth?.trackingAttached) {
    return {
      key: 'shipped',
      label: 'Shipped',
      detail: 'Tracking adjuntado; esperando entrega.',
      tone: 'info',
    };
  }
  if (truth?.supplierPurchaseProved) {
    return {
      key: 'fulfillment_in_progress',
      label: 'Fulfillment in progress',
      detail: 'Compra al proveedor verificada.',
      tone: 'info',
    };
  }
  if (truth?.orderIngested) {
    return {
      key: 'order_received',
      label: 'Order received',
      detail: 'Orden ingerida; falta evidencia posterior.',
      tone: 'info',
    };
  }

  const externalState = String(truth?.externalMarketplaceState || '').toLowerCase().trim();
  if (externalState === 'active') {
    return {
      key: 'listed_active',
      label: 'Listed active',
      detail: 'Listing activo en marketplace.',
      tone: 'success',
    };
  }
  if (externalState === 'under_review') {
    return {
      key: 'published_under_review',
      label: 'Moderated / under review',
      detail: 'Marketplace en revisión o moderación.',
      tone: 'warning',
    };
  }
  if (externalState === 'paused') {
    return {
      key: 'listed_paused',
      label: 'Listed paused',
      detail: 'Listing pausado en marketplace.',
      tone: 'warning',
    };
  }
  if (externalState === 'failed_publish' || externalState === 'not_found') {
    return {
      key: 'published_failed',
      label: 'Publish failed',
      detail: 'Fallo de publicación o listing no encontrado.',
      tone: 'danger',
    };
  }

  if (preflight) {
    if (preflight.publishAllowed !== true) {
      return {
        key: preflight.publishIntent === 'pilot' ? 'pilot_blocked' : 'preflight_blocked',
        label: preflight.publishIntent === 'pilot' ? 'Pilot blocked' : 'Preflight blocked',
        detail: preflight.blockers?.[0] || preflight.nextAction || preflight.overallState,
        tone: 'danger',
      };
    }
    if (preflight.publishIntent === 'pilot') {
      if (preflight.pilotReadiness?.pilotAllowed) {
        return {
          key: 'pilot_ready',
          label: 'Pilot approved',
          detail: 'Pilot readiness en verde con guardas cumplidas.',
          tone: 'success',
        };
      }
      return {
        key: 'pilot_pending_approval',
        label: 'Pilot approval pending',
        detail:
          preflight.pilotReadiness?.requiredManualChecks?.[0] ||
          preflight.pilotReadiness?.blockers?.[0] ||
          preflight.nextAction ||
          'Falta aprobación/manual checks de piloto.',
        tone: 'warning',
      };
    }
    if (preflight.modeResolved === 'international') {
      return {
        key: 'ready_international',
        label: 'Ready international',
        detail: preflight.nextAction || 'Ready para publicación internacional.',
        tone: 'info',
      };
    }
    return {
      key: 'ready_local',
      label: 'Ready local',
      detail: preflight.nextAction || 'Ready para publicación local.',
      tone: 'success',
    };
  }

  if (productStatus === 'VALIDATED_READY') {
    return {
      key: 'ready_local',
      label: 'Ready local',
      detail: 'Validado en catálogo; falta disparar publicación.',
      tone: 'success',
    };
  }
  if (productStatus === 'APPROVED') {
    return {
      key: 'evaluation',
      label: 'Approved / queued',
      detail: 'Aprobado internamente, pendiente de publicación.',
      tone: 'info',
    };
  }
  if (productStatus === 'REJECTED' || productStatus === 'BLOCKED') {
    return {
      key: 'preflight_blocked',
      label: 'Blocked',
      detail: 'Bloqueado o rechazado a nivel operativo.',
      tone: 'danger',
    };
  }
  if (productStatus === 'PUBLISHED') {
    return {
      key: 'published_under_review',
      label: 'Published',
      detail: 'Publicado; espera sync/estado externo canónico.',
      tone: 'info',
    };
  }

  return {
    key: 'sourced',
    label: 'Sourced',
    detail: 'Producto detectado, pendiente de evaluación completa.',
    tone: 'neutral',
  };
}
