import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
 * Redirige a /setup-required si es necesario (nunca desde /api-settings ni /setup-required)
 */
export function useSetupCheck() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
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
        // Usar pathname actual del router (evita redirigir si el usuario ya navegó a /api-settings)
        const currentPath = pathnameRef.current;
        if (currentPath !== '/setup-required' && !currentPath.startsWith('/api-settings')) {
          navigate('/setup-required', { replace: true });
        }
      }
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

