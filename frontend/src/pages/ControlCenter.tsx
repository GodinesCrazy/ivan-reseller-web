/**
 * Phase 12: Strategic Control Center
 * Unified operational dashboard: funnel, ROI, conversion trends, profit distribution, system readiness.
 */

import { useState, useEffect } from 'react';
import {
  BarChart3,
  Layers,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  DollarSign,
  Target,
} from 'lucide-react';
import api from '@services/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useEnvironment } from '@/contexts/EnvironmentContext';

interface FunnelStage {
  stage: string;
  count: number;
  label: string;
}

interface ControlCenterFunnel {
  funnel: FunnelStage[];
  profitDistribution: { marketplace: string; totalProfit: number; salesCount: number }[];
  counts: Record<string, number>;
}

interface SalesAccelerationMode {
  enabled: boolean;
  strategy: string;
  recentOptimizations: string[];
}

interface ReadinessReport {
  success: boolean;
  deploymentStatus: string;
  workerStatus: string;
  health: {
    database: string;
    redis: string;
    bullmq: string;
    workers?: string;
    marketplaceApi: string;
    supplierApi: string;
    alerts: string[];
  };
  marketplaceIntegrations: { configured: boolean; count: number };
  supplierIntegrations: { configured: boolean; count: number };
  automationModeStatus: string;
  canEnableAutonomous: boolean;
  salesOptimizationReadiness: Record<string, boolean>;
  salesAccelerationMode?: SalesAccelerationMode;
  timestamp?: string;
}

interface AutopilotMetrics {
  profitToday: number;
  profitMonth: number;
  dailySales: number;
  activeListings: number;
}

interface AutopilotStatus {
  running: boolean;
  status: string;
  lastRun: string | null;
  config?: { enabled?: boolean; cycleIntervalMinutes?: number };
}

export default function ControlCenter() {
  const { environment } = useEnvironment();
  const [funnel, setFunnel] = useState<ControlCenterFunnel | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [metrics, setMetrics] = useState<AutopilotMetrics | null>(null);
  const [autopilotStatus, setAutopilotStatus] = useState<AutopilotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get('/api/analytics/control-center-funnel', { params: { environment } }).then((r) => r.data),
      api.get('/api/system/readiness-report').then((r) => r.data),
      api.get('/api/dashboard/autopilot-metrics', { params: { environment } }).then((r) => r.data),
      api.get('/api/autopilot/status').then((r) => r.data).catch(() => ({ running: false, status: 'unknown', lastRun: null })),
    ])
      .then(([funnelData, readinessData, metricsData, autopilotData]) => {
        if (!cancelled) {
          setFunnel(funnelData);
          setReadiness(readinessData);
          setMetrics({
            profitToday: metricsData.profitToday ?? 0,
            profitMonth: metricsData.profitMonth ?? 0,
            dailySales: metricsData.dailySales ?? 0,
            activeListings: metricsData.activeListings ?? 0,
          });
          setAutopilotStatus({
            running: autopilotData.running === true,
            status: autopilotData.status ?? 'unknown',
            lastRun: autopilotData.lastRun ?? null,
            config: autopilotData.config,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.error || err.message || 'Error loading control center');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [environment]);

  const statusIcon = (status: string) => {
    if (status === 'ok' || status === 'enabled' || status === 'running') {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    if (status === 'degraded' || status === 'disabled') {
      return <AlertCircle className="h-5 w-5 text-amber-500" />;
    }
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <LoadingSpinner text="Cargando Control Center..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Layers className="h-8 w-8 text-primary-500" />
          Strategic Control Center
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Visión unificada del funnel, salud del sistema y modo autónomo.
        </p>
      </div>

      {/* System Readiness */}
      {readiness && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            System Readiness
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              {statusIcon(readiness.health.database)}
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Database</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{readiness.health.database}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              {statusIcon(readiness.health.redis)}
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Redis</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{readiness.health.redis}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              {statusIcon(readiness.health.workers ?? readiness.workerStatus)}
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Workers</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {readiness.health.workers ?? readiness.workerStatus}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              {statusIcon(readiness.automationModeStatus === 'enabled' ? 'enabled' : 'disabled')}
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Autonomous mode</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {readiness.automationModeStatus}
                  {readiness.canEnableAutonomous && readiness.automationModeStatus === 'disabled'
                    ? ' (ready to enable)'
                    : ''}
                </p>
              </div>
            </div>
            {autopilotStatus != null && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 sm:col-span-2 lg:col-span-1">
                {statusIcon(autopilotStatus.running ? 'running' : 'disabled')}
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100">Ciclos de dropshipping</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {autopilotStatus.running
                      ? 'En ejecución (Autopilot activo)'
                      : autopilotStatus.config?.enabled
                        ? 'Parados (revisar logs o iniciar en Autopilot)'
                        : 'Parados (activar en Autopilot)'}
                    {autopilotStatus.lastRun && (
                      <> · Último ciclo: {new Date(autopilotStatus.lastRun).toLocaleString()}</>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Utilidades: indicador claro de si el sistema está generando ganancias */}
          {metrics != null && (
            <div className="mt-6 p-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Utilidades
              </h3>
              <div className="mt-3 flex flex-wrap items-baseline gap-6">
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Hoy: </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    ${metrics.profitToday.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Este mes: </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    ${metrics.profitMonth.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Ventas hoy: </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{metrics.dailySales}</span>
                </div>
                <div className="flex items-center gap-2">
                  {(metrics.profitMonth > 0 || metrics.profitToday > 0) ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="font-semibold text-green-700 dark:text-green-400">
                        Generando utilidades: Sí
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-amber-500" />
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        Generando utilidades: No (aún no hay ventas con ganancia registradas)
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {readiness.health.alerts && readiness.health.alerts.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Alerts</p>
              <ul className="list-disc list-inside text-sm text-amber-700 dark:text-amber-300 mt-1">
                {readiness.health.alerts.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              Deployment: <strong>{readiness.deploymentStatus}</strong>
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              Marketplaces: <strong>{readiness.marketplaceIntegrations.count}</strong> configured
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              Supplier: <strong>{readiness.supplierIntegrations.configured ? 'Yes' : 'No'}</strong>
            </span>
          </div>
          {readiness.salesAccelerationMode && (
            <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Sales Acceleration Mode
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {readiness.salesAccelerationMode.enabled ? 'Enabled' : 'Disabled'}
                {readiness.salesAccelerationMode.enabled && readiness.salesAccelerationMode.strategy && (
                  <> — {readiness.salesAccelerationMode.strategy}</>
                )}
              </p>
              {readiness.salesAccelerationMode.recentOptimizations?.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-sm text-gray-600 dark:text-gray-300">
                  {readiness.salesAccelerationMode.recentOptimizations.slice(0, 5).map((opt, i) => (
                    <li key={i}>{opt}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Platform Funnel */}
      {funnel && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary-500" />
            Platform Funnel
          </h2>
          <div className="overflow-x-auto">
            <div className="flex flex-wrap gap-4 min-w-0">
              {funnel.funnel.map((stage, i) => (
                <div
                  key={stage.stage}
                  className="flex-shrink-0 w-36 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-center"
                >
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stage.count}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{stage.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Profit distribution */}
      {funnel && funnel.profitDistribution.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            Profit distribution (last 30 days)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {funnel.profitDistribution.map((p) => (
              <div
                key={p.marketplace}
                className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
              >
                <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{p.marketplace}</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  ${p.totalProfit.toFixed(2)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{p.salesCount} ventas</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales optimization (MercadoLibre) */}
      {readiness?.salesOptimizationReadiness && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Target className="h-5 w-5 text-amber-500" />
            Sales optimization (MercadoLibre)
          </h2>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-center gap-2">
              {readiness.salesOptimizationReadiness.mercadolibreCompetitivePrice ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              Competitive price positioning
            </li>
            <li className="flex items-center gap-2">
              {readiness.salesOptimizationReadiness.mercadolibreShippingSignals ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              Fast shipping advantage
            </li>
            <li className="flex items-center gap-2">
              {readiness.salesOptimizationReadiness.mercadolibreAttributeCompleteness ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              Listing attribute completeness
            </li>
          </ul>
        </div>
      )}

      {/* Pipeline stages reminder */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Autonomous pipeline</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Trend Detection → Market Intelligence → Auto Listing Strategy → Publishing → Metrics → Dynamic
          Optimization → Winner Detection → Strategy Brain → Autonomous Scaling → SEO Intelligence → Conversion
          Optimization
        </p>
      </div>
    </div>
  );
}
