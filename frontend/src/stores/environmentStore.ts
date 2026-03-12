/**
 * Global environment store for API interceptor (dashboard/sales/finance).
 * Synced by EnvironmentProvider - allows interceptor to add ?environment= without React context.
 */
import { create } from 'zustand';

export type EnvironmentValue = 'sandbox' | 'production';

interface EnvironmentStore {
  environment: EnvironmentValue;
  setEnvironment: (env: EnvironmentValue) => void;
}

export const useEnvironmentStore = create<EnvironmentStore>()((set) => ({
  environment: 'production',
  setEnvironment: (env) => set({ environment: env }),
}));
