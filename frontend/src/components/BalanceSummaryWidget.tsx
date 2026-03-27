/**
 * BalanceSummaryWidget - Resumen de balance/capital en el Dashboard
 * Muestra: Capital disponible, Comprometido a órdenes, indicador "Puede publicar"
 * Polling cada 60s (working-capital llama a PayPal).
 */

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, ChevronRight, TrendingUp } from 'lucide-react';
import api from '@/services/api';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import { formatCurrencySimple } from '@/utils/currency';
import MetricLabelWithTooltip from '@/components/MetricLabelWithTooltip';
import { metricTooltips } from '@/config/metricTooltips';

interface WorkingCapitalDetail {
  availableCash: number;
  committedToOrders: number;
  totalCapital: number;
  inPayPal: number;
  inPayoneer: number;
}

interface LeverageRiskResponse {
  capitalAllocation?: {
    canPublish: boolean;
    remainingExposure: number;
    maxExposureAllowed: number;
    currentExposure: number;
  };
}

export default function BalanceSummaryWidget() {
  const [wc, setWc] = useState<WorkingCapitalDetail | null>(null);
  const [allocation, setAllocation] = useState<LeverageRiskResponse['capitalAllocation'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(false);
      const [wcRes, allocRes] = await Promise.all([
        api.get<{ detail?: WorkingCapitalDetail }>('/api/finance/working-capital-detail', {
          params: { environment: 'production' },
        }),
        api.get<LeverageRiskResponse>('/api/finance/leverage-and-risk', {
          params: { environment: 'production' },
        }).catch(() => ({ data: {} })),
      ]);
      const detail = wcRes.data?.detail;
      if (detail) {
        setWc(detail);
      } else {
        setWc(null);
      }
      setAllocation(allocRes.data?.capitalAllocation ?? null);
    } catch {
      setError(true);
      setWc(null);
      setAllocation(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveData({ fetchFn: fetchData, intervalMs: 60000, enabled: true });
  useNotificationRefetch({
    handlers: {
      SALE_CREATED: fetchData,
      COMMISSION_CALCULATED: fetchData,
    },
    enabled: true,
  });

  if (loading && !wc) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-5 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-3" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
      </div>
    );
  }

  if (error && !wc) return null;

  const availableCash = wc?.availableCash ?? 0;
  const committed = wc?.committedToOrders ?? 0;
  const canPublish = allocation?.canPublish ?? false;
  const remainingExposure = allocation?.remainingExposure ?? 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Balance</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Capital y exposición — snapshot; proof de fondos liberados en Finance</p>
          </div>
        </div>
        <Link
          to="/finance"
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          Ver Finance <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center text-sm">
          <MetricLabelWithTooltip
            label="Capital disponible"
            tooltipBody={metricTooltips.capitalDisponible.body}
            className="text-gray-600 dark:text-gray-400"
          />
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrencySimple(availableCash, 'USD')}
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <MetricLabelWithTooltip
            label="Comprometido a órdenes"
            tooltipBody={metricTooltips.comprometidoOrdenes.body}
            className="text-gray-600 dark:text-gray-400"
          />
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {formatCurrencySimple(committed, 'USD')}
          </span>
        </div>
        <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <MetricLabelWithTooltip
            label="Puede publicar"
            tooltipBody={metricTooltips.puedePublicar.body}
            className="text-sm text-gray-600 dark:text-gray-400"
          />
          {canPublish ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400">
              <TrendingUp className="w-4 h-4" />
              Sí
              {remainingExposure > 0 && (
                <span className="text-gray-500 dark:text-gray-400 font-normal">
                  (+{formatCurrencySimple(remainingExposure, 'USD')})
                </span>
              )}
            </span>
          ) : (
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Límite alcanzado</span>
          )}
        </div>
      </div>
    </div>
  );
}
