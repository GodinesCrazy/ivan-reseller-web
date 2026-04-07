import api from './api';
import type {
  MlPilotApproval,
  MlPilotControlState,
  MlPilotLedgerRow,
  MlPilotPostPublishStatus,
  MlProgramVerificationPayload,
} from '@/types/mercadolibre-preflight';

export async function fetchMercadoLibreProgramVerification(params?: {
  environment?: 'sandbox' | 'production';
  requestedMode?: 'local' | 'international';
}): Promise<MlProgramVerificationPayload> {
  const response = await api.get('/api/marketplace/mercadolibre/program-verification', {
    params: {
      environment: params?.environment,
      requestedMode: params?.requestedMode,
    },
  });
  return response.data?.data as MlProgramVerificationPayload;
}

export async function fetchMercadoLibrePilotApprovals(params?: {
  productId?: number;
  limit?: number;
}): Promise<MlPilotApproval[]> {
  const response = await api.get('/api/marketplace/mercadolibre/pilot-approvals', {
    params: {
      productId: params?.productId,
      limit: params?.limit,
    },
  });
  return Array.isArray(response.data?.data) ? (response.data.data as MlPilotApproval[]) : [];
}

export async function fetchMercadoLibrePilotAllowlist(params?: {
  siteId?: string;
  enabled?: boolean;
  limit?: number;
}): Promise<Array<{ categoryKey: string; enabled: boolean; notes?: string | null }>> {
  const response = await api.get('/api/marketplace/mercadolibre/pilot-category-allowlist', {
    params: {
      siteId: params?.siteId || 'MLC',
      enabled: params?.enabled,
      limit: params?.limit,
    },
  });
  return Array.isArray(response.data?.data)
    ? (response.data.data as Array<{ categoryKey: string; enabled: boolean; notes?: string | null }>)
    : [];
}

export async function fetchMercadoLibrePilotLedger(params?: {
  productId?: number;
  limit?: number;
}): Promise<MlPilotLedgerRow[]> {
  const response = await api.get('/api/marketplace/mercadolibre/pilot-ledger', {
    params: {
      productId: params?.productId,
      limit: params?.limit,
    },
  });
  return Array.isArray(response.data?.data) ? (response.data.data as MlPilotLedgerRow[]) : [];
}

export async function fetchMercadoLibrePilotControlState(productId: number): Promise<MlPilotControlState> {
  const response = await api.get(`/api/marketplace/mercadolibre/pilot-control/${productId}`);
  return response.data?.data as MlPilotControlState;
}

export async function setMercadoLibrePilotControlState(params: {
  productId: number;
  state: 'ready' | 'aborted' | 'rollback_requested' | 'rollback_completed';
  reason?: string;
}): Promise<MlPilotControlState> {
  const response = await api.post(`/api/marketplace/mercadolibre/pilot-control/${params.productId}`, {
    state: params.state,
    reason: params.reason,
  });
  return response.data?.data as MlPilotControlState;
}

export async function fetchMercadoLibrePilotPostPublishStatus(
  productId: number
): Promise<MlPilotPostPublishStatus> {
  const response = await api.get(`/api/marketplace/mercadolibre/pilot-post-publish/${productId}`);
  return response.data?.data as MlPilotPostPublishStatus;
}
