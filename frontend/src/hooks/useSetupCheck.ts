import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
 * Hook para verificar si el setup está completo
 * Redirige a /setup-required si es necesario
 */
export function useSetupCheck() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    // Solo verificar para usuarios no-admin
    if (user.role?.toUpperCase() === 'ADMIN') {
      return;
    }

    // ✅ FIX: Verificar setup inmediatamente al montar (antes de que otros componentes hagan llamadas)
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

      if (data.setupRequired) {
        // Si estamos en una ruta protegida (no /setup-required ni /api-settings), redirigir
        const currentPath = window.location.pathname;
        if (currentPath !== '/setup-required' && !currentPath.startsWith('/api-settings')) {
          navigate('/setup-required', { replace: true });
        }
      }
    } catch (error: any) {
      // Si falla, no hacer nada (mejor mostrar dashboard con errores que bloquear)
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

