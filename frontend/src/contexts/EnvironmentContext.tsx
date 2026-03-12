/**
 * EnvironmentContext - Global environment (sandbox vs production) for filtering API data.
 * Synced with WorkflowConfig; Dashboard toggle and WorkflowConfig page both update this.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '@/services/api';
import { useAuthStore } from '@stores/authStore';

export type Environment = 'sandbox' | 'production';

interface EnvironmentContextValue {
  environment: Environment;
  setEnvironment: (env: Environment) => Promise<void>;
  refreshEnvironment: () => Promise<void>;
  isProduction: boolean;
  isLoading: boolean;
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

const ENV_ROUTES = [
  '/api/dashboard/',
  '/api/sales',
  '/api/finance/',
  '/api/commissions',
];

export function isEnvironmentRoute(url: string): boolean {
  const path = typeof url === 'string' ? url : '';
  return ENV_ROUTES.some((r) => path.includes(r));
}

export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const [environment, setEnvironmentState] = useState<Environment>('production');
  const [isLoading, setIsLoading] = useState(true);

  const fetchEnvironment = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await api.get<{ success: boolean; environment: Environment }>(
        '/api/workflow/environment'
      );
      if (data?.environment === 'production' || data?.environment === 'sandbox') {
        setEnvironmentState(data.environment);
      }
    } catch {
      setEnvironmentState('production');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchEnvironment();
  }, [fetchEnvironment]);

  const setEnvironment = useCallback(
    async (env: Environment) => {
      if (!isAuthenticated) return;
      try {
        await api.put('/api/workflow/config', { environment: env });
        setEnvironmentState(env);
      } catch (err) {
        throw err;
      }
    },
    [isAuthenticated]
  );

  const value: EnvironmentContextValue = {
    environment,
    setEnvironment,
    refreshEnvironment: fetchEnvironment,
    isProduction: environment === 'production',
    isLoading,
  };

  return (
    <EnvironmentContext.Provider value={value}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment(): EnvironmentContextValue {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) {
    return {
      environment: 'production',
      setEnvironment: async () => {},
      refreshEnvironment: async () => {},
      isProduction: true,
      isLoading: false,
    };
  }
  return ctx;
}
