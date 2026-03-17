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
  Zap,
  Loader2,
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

interface Phase32ActivationResult {
  success: boolean;
  phase31Run: { success: boolean; winnersDetected: number; durationMs: number; errors: string[] };
  marketplacePrioritySet: string[];
  maxNewListingsPerDaySet: number;
  errors: string[];
}

interface Phase32ValidationCycleResult {
  success: boolean;
  metricsOk: boolean;
  profitOk: boolean;
  profitTotal: number;
  phase31Run: boolean;
  durationMs: number;
  errors: string[];
}

interface Phase31LastScheduledRun {
  at: string;
  success: boolean;
  winnersDetected: number;
  durationMs: number;
}

interface Phase32Status {
  lastActivation: Phase32ActivationResult | null;
  lastValidationCycle: Phase32ValidationCycleResult | null;
  lastScheduledRun: Phase31LastScheduledRun | null;
  schedulerCron: string;
  maxNewListingsPerDay: number;
}

export default function ControlCenter() {
  const { environment } = useEnvironment();
  const [funnel, setFunnel] = useState<ControlCenterFunnel | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [metrics, setMetrics] = useState<AutopilotMetrics | null>(null);
  const [autopilotStatus, setAutopilotStatus] = useState<AutopilotStatus | null>(null);
  const [phase32Status, setPhase32Status] = useState<Phase32Status | null>(null);
  const [phase32Activating, setPhase32Activating] = useState(false);
  const [phase32Validating, setPhase32Validating] = useState(false);
  const [phase32Message, setPhase32Message] = useState<string | null>(null);
  const [phase32MessageType, setPhase32MessageType] = useState<'success' | 'error' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPhase32Status = () => {
    api
      .get('/api/system/phase32/status')
      .then((r) => r.data && setPhase32Status({ ...r.data }))
      .catch(() => setPhase32Status(null));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get('/api/analytics/control-center-funnel', { params: { environment } }).then((r) => r.data),
      api.get('/api/system/readiness-report').then((r) => r.data),
      api.get('/api/dashboard/autopilot-metrics', { params: { environment } }).then((r) => r.data),
      api.get('/api/autopilot/status').then((r) => r.data).catch(() => ({ running: false, status: 'unknown', lastRun: null })),
      api.get('/api/system/phase32/status').then((r) => r.data).catch(() => null),
    ])
      .then(([funnelData, readinessData, metricsData, autopilotData, phase32Data]) => {
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
          setPhase32Status(phase32Data ?? null);
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
          Visión unificada del funnel, salud del sistema y modo autónomo. Datos en tiempo real desde el servidor.
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

          {((readiness.health.redis === 'degraded' || readiness.health.redis === 'fail') ||
            ((readiness.health.workers ?? readiness.workerStatus) === 'degraded' ||
              (readiness.health.workers ?? readiness.workerStatus) === 'fail')) && (
            <div className="mt-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Redis o Workers no disponibles
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Los jobs del Dashboard (Demand Radar, Strategy Brain, etc.) no se ejecutan. Reinicia
                Redis en Railway: servicio Redis → Deployments o Database → Restart/Redeploy. Si hace
                falta, redeploya también el backend (ivan-reseller-backend).
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-2 font-mono bg-amber-100/50 dark:bg-amber-900/30 px-2 py-1 rounded">
                railway service restart -s Redis -y
                <br />
                railway service redeploy -s ivan-reseller-backend -y
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Ejecutar desde el directorio backend con Railway CLI enlazado. Ver más en
                backend/docs/RAILWAY_REDIS_SETUP.md
              </p>
            </div>
          )}

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
                        {metrics.profitMonth > 0 && metrics.profitToday === 0 ? ' (este mes)' : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-amber-500" />
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        Generando utilidades: No (aún no hay ventas con ganancia registradas este mes)
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

      {/* Modo autónomo de ventas */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Modo autónomo de ventas
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          La activación inicial ejecuta un ciclo de ventas (prioridad de marketplaces y límite de 15 nuevos listados/día). El programador ejecuta el mismo ciclo cada 4–6 h automáticamente.
        </p>
        {phase32Status != null ? (
          <div className="space-y-3 mb-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-gray-600 dark:text-gray-300">
                Última activación:{' '}
                {phase32Status.lastActivation ? (
                  phase32Status.lastActivation.success ? (
                    <strong className="text-green-600 dark:text-green-400">OK</strong>
                  ) : (
                    <strong className="text-amber-600 dark:text-amber-400">Con errores</strong>
                  )
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">Nunca</span>
                )}
              </span>
              <span className="text-gray-600 dark:text-gray-300">
                Scheduler: <strong>{phase32Status.schedulerCron}</strong> (ej. cada 5 h)
              </span>
              <span className="text-gray-600 dark:text-gray-300">
                Máx. nuevos listados/día: <strong>{phase32Status.maxNewListingsPerDay}</strong>
              </span>
            </div>
            {phase32Status.lastScheduledRun && (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Última ejecución automática: {new Date(phase32Status.lastScheduledRun.at).toLocaleString()}
                {phase32Status.lastScheduledRun.success ? (
                  <strong className="text-green-600 dark:text-green-400"> · OK</strong>
                ) : (
                  <strong className="text-amber-600 dark:text-amber-400"> · Con errores</strong>
                )}
                {phase32Status.lastScheduledRun.winnersDetected != null && (
                  <> · {phase32Status.lastScheduledRun.winnersDetected} winners</>
                )}
                {phase32Status.lastScheduledRun.durationMs != null && phase32Status.lastScheduledRun.durationMs > 0 && (
                  <> · {phase32Status.lastScheduledRun.durationMs} ms</>
                )}
              </div>
            )}
            {phase32Status.lastValidationCycle && (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Último ciclo de validación: {phase32Status.lastValidationCycle.success ? 'OK' : 'Con errores'}
                {phase32Status.lastValidationCycle.durationMs != null && (
                  <> · {phase32Status.lastValidationCycle.durationMs} ms</>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Inicia sesión para ver el estado y activar el modo autónomo.
          </p>
        )}
        {phase32Message && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              phase32MessageType === 'error'
                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
            }`}
          >
            {phase32Message}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setPhase32Message(null);
              setPhase32Activating(true);
              api
                .post('/api/system/phase32/activate')
                .then((res) => {
                  setPhase32Message(
                    res.data?.success ? 'Activación completada.' : res.data?.errors?.join(' ') || 'Activación finalizada con avisos.'
                  );
                  setPhase32MessageType(res.data?.success ? 'success' : 'error');
                  fetchPhase32Status();
                })
                .catch((err) => {
                  setPhase32Message(err.response?.data?.error || err.message || 'Error al activar');
                  setPhase32MessageType('error');
                  fetchPhase32Status();
                })
                .finally(() => setPhase32Activating(false));
            }}
            disabled={phase32Activating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm"
          >
            {phase32Activating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Activar modo autónomo
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase32Message(null);
              setPhase32Validating(true);
              api
                .post('/api/system/phase32/run-validation-cycle')
                .then((res) => {
                  setPhase32Message(
                    res.data?.success
                      ? 'Ciclo de validación completado.'
                      : res.data?.errors?.join(' ') || 'Ciclo finalizado con avisos.'
                  );
                  setPhase32MessageType(res.data?.success ? 'success' : 'error');
                  fetchPhase32Status();
                })
                .catch((err) => {
                  setPhase32Message(err.response?.data?.error || err.message || 'Error en ciclo de validación');
                  setPhase32MessageType('error');
                  fetchPhase32Status();
                })
                .finally(() => setPhase32Validating(false));
            }}
            disabled={phase32Validating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm"
          >
            {phase32Validating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Ejecutar ciclo de validación
          </button>
        </div>
      </div>

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
