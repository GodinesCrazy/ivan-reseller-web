import { useEffect, useState } from 'react';
import api from '@/services/api';
import { useAuthStore } from '@stores/authStore';
import { useEnvironment } from '@/contexts/EnvironmentContext';

export interface InventoryBadges {
  pendingPurchasesCount: number;
  productsPending: number;
}

const REFETCH_MS = 60_000;

/**
 * Fetches inventory summary for sidebar badges (Compras pendientes, Productos).
 * Only runs when user is authenticated; refetches on mount and every 60s.
 */
export function useInventoryBadges(): InventoryBadges {
  const { isAuthenticated } = useAuthStore();
  const { environment } = useEnvironment();
  const [badges, setBadges] = useState<InventoryBadges>({
    pendingPurchasesCount: 0,
    productsPending: 0,
  });

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchSummary = async () => {
      try {
        const res = await api.get<{
          pendingPurchasesCount?: number;
          products?: { pending?: number };
        }>('/api/dashboard/inventory-summary', { params: { environment } });
        const data = res.data;
        setBadges({
          pendingPurchasesCount: data?.pendingPurchasesCount ?? 0,
          productsPending: data?.products?.pending ?? 0,
        });
      } catch {
        // Silently ignore; sidebar still works without badges
      }
    };

    fetchSummary();
    const interval = setInterval(fetchSummary, REFETCH_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, environment]);

  return badges;
}
