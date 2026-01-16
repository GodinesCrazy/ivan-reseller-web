import { create } from 'zustand';
import { toast } from 'sonner';
import api from '@services/api';

type ManualSessionInfo = {
  token: string;
  loginUrl: string;
  expiresAt?: string;
  status?: string;
};

export interface MarketplaceAuthStatus {
  status: string;
  message?: string | null;
  requiresManual?: boolean;
  updatedAt?: string;
  lastAutomaticAttempt?: string | null;
  lastAutomaticSuccess?: string | null;
  manualSession?: ManualSessionInfo | null;
}

interface AuthStatusState {
  statuses: Record<string, MarketplaceAuthStatus>;
  loading: boolean;
  pendingManualSession: ManualSessionInfo | null;
  lastManualToken: string | null;
  fetchStatuses: () => Promise<void>;
  requestRefresh: (marketplace: string) => Promise<void>;
  markManualHandled: (token: string) => void;
}

export const useAuthStatusStore = create<AuthStatusState>((set, get) => ({
  statuses: {},
  loading: false,
  pendingManualSession: null,
  lastManualToken: null,

  fetchStatuses: async () => {
    try {
      set({ loading: true });
      const response = await api.get('/api/auth-status');
      // ✅ FIX: Si es setup_required, no procesar (se manejará en App.tsx)
      if (response.data?.setupRequired === true || response.data?.error === 'setup_required') {
        set({ loading: false });
        return; // El hook useSetupCheck redirigirá
      }
      const statuses = response.data?.data?.statuses || {};

      const currentState = get();
      const lastToken = currentState.lastManualToken;
      let pendingManualSession: ManualSessionInfo | null = null;

      const aliStatus: MarketplaceAuthStatus | undefined = statuses.aliexpress;
      if (
        aliStatus?.requiresManual &&
        aliStatus.manualSession?.token &&
        aliStatus.manualSession.token !== lastToken
      ) {
        pendingManualSession = aliStatus.manualSession;
      }

      set({
        statuses,
        loading: false,
        pendingManualSession,
      });
    } catch (error: any) {
      set({ loading: false });
      console.error('useAuthStatusStore.fetchStatuses error:', error?.message || error);
    }
  },

  requestRefresh: async (marketplace: string) => {
    try {
      await api.post(`/api/auth-status/${marketplace}/refresh`);
      toast.info('Estamos renovando la sesión de AliExpress. Esto puede tardar unos segundos.');
      await get().fetchStatuses();
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'No se pudo iniciar el reintento automático.';
      toast.error(message);
      throw error;
    }
  },

  markManualHandled: (token: string) => {
    set({
      lastManualToken: token,
      pendingManualSession: null,
    });
  },
}));

