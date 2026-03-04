import { useEffect, useState } from 'react';
import api from '@/services/api';
import { useAuthStore } from '@stores/authStore';

interface SetupStatus {
  setupRequired: boolean;
  hasMarketplace: boolean;
  hasSearchAPI: boolean;
  missingRequirements: {
    marketplace: boolean;
    searchAPI: boolean;
  };
}

/**
 * Hook para verificar si el setup está completo.
 * No redirige: tras login el usuario siempre llega al dashboard; el setup incompleto
 * se muestra como aviso en Layout (banner con enlace a /api-settings).
 */
export function useSetupCheck() {
  const { isAuthenticated, user } = useAuthStore();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    if (user.role?.toUpperCase() === 'ADMIN') {
      return;
    }

    checkSetup();
  }, [isAuthenticated, user]);

  const checkSetup = async () => {
    try {
      setChecking(true);
      const response = await api.get('/api/setup-status');
      const data = response.data;

      setSetupStatus({
        setupRequired: data.setupRequired || false,
        hasMarketplace: data.hasMarketplace || false,
        hasSearchAPI: data.hasSearchAPI || false,
        missingRequirements: data.missingRequirements || {
          marketplace: false,
          searchAPI: false
        }
      });
    } catch (error: any) {
      console.error('Error checking setup status:', error);
    } finally {
      setChecking(false);
    }
  };

  return {
    setupStatus,
    checking,
    checkSetup
  };
}

