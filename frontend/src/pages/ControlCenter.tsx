import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Layers,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import api from '@services/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import OperationsTruthSummaryPanel from '@/components/OperationsTruthSummaryPanel';
import PostSaleProofLadderPanel from '@/components/PostSaleProofLadderPanel';
import AgentDecisionTracePanel from '@/components/AgentDecisionTracePanel';
import { fetchOperationsTruth } from '@/services/operationsTruth.api';
import type { OperationsTruthResponse } from '@/types/operations';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { lifecycleToneClasses, resolveOperationalLifecycleStage } from '@/utils/operational-lifecycle';

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

function formatStatusLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return 'unknown';
  return raw.replace(/_/g, ' ');
}

function statusTone(status: string) {
  if (status === 'ok' || status === 'enabled' || status === 'running') {
    return {
      icon: <CheckCircle className="h-4 w-4 text-green-500" />,
      card: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
      text: 'text-green-700 dark:text-green-300',
    };
  }
  if (status === 'degraded' || status === 'disabled') {
    return {
      icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
      card: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
      text: 'text-amber-700 dark:text-amber-300',
    };
  }
  return {
    icon: <ShieldAlert className="h-4 w-4 text-red-500" />,
    card: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
  };
}

export default function ControlCenter() {
  const { environment } = useEnvironment();
  const [operationsTruth, setOperationsTruth] = useState<OperationsTruthResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [autopilotStatus, setAutopilotStatus] = useState<AutopilotStatus | null>(null);
  const [phase32Status, setPhase32Status] = useState<Phase32Status | null>(null);
  const [phase32Activating, setPhase32Activating] = useState(false);
  const [phase32Validating, setPhase32Validating] = useState(false);
  const [phase32Message, setPhase32Message] = useState<string | null>(null);
  const [phase32MessageType, setPhase32MessageType] = useState<'success' | 'error' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);

  const fetchPhase32Status = () => {
    api
      .get('/api/system/phase32/status')
      .then((response) => response.data && setPhase32Status({ ...response.data }))
      .catch(() => setPhase32Status(null));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLoadWarnings([]);

    const isDbLimit = (reason: unknown): boolean => {
      const axiosError = reason as {
        response?: { status?: number; data?: { code?: string; error?: string } };
        message?: string;
      };
      if (axiosError?.response?.data?.code === 'DB_CONNECTION_LIMIT') return true;
      const msg = String(axiosError?.response?.data?.error ?? axiosError?.message ?? '').toLowerCase();
      return (
        axiosError?.response?.status === 503 &&
        (msg.includes('base de datos') || msg.includes('too many clients') || msg.includes('database'))
      );
    };

    const friendlyDbMsg =
      'El servicio no pudo conectar con la base de datos (muchas conexiones). Intenta de nuevo en unos segundos.';

    Promise.allSettled([
      fetchOperationsTruth({ limit: 12, environment }),
      api.get('/api/system/readiness-report').then((response) => response.data),
      api.get('/api/autopilot/status').then((response) => response.data),
      api.get('/api/system/phase32/status').then((response) => response.data),
    ])
      .then((results) => {
        if (cancelled) return;

        const warnings: string[] = [];
        let anyOk = false;

        if (results[0].status === 'fulfilled') {
          setOperationsTruth(results[0].value);
          anyOk = true;
        } else {
          setOperationsTruth(null);
          warnings.push('No se pudo cargar la verdad operativa canónica del Control Center.');
        }

        if (results[1].status === 'fulfilled') {
          setReadiness(results[1].value);
          anyOk = true;
        } else {
          setReadiness(null);
          warnings.push(isDbLimit(results[1].reason) ? friendlyDbMsg : 'No se pudo cargar la salud técnica del sistema.');
        }

        if (results[2].status === 'fulfilled') {
          const runtime = results[2].value;
          setAutopilotStatus({
            running: runtime?.running === true,
            status: runtime?.status ?? 'unknown',
            lastRun: runtime?.lastRun ?? null,
            config: runtime?.config,
          });
          anyOk = true;
        } else {
          setAutopilotStatus({ running: false, status: 'unknown', lastRun: null });
        }

        if (results[3].status === 'fulfilled') {
          setPhase32Status(results[3].value ?? null);
          anyOk = true;
        } else {
          setPhase32Status(null);
        }

        const uniqueWarnings = [...new Set(warnings)];
        setLoadWarnings(uniqueWarnings);
        if (!anyOk) {
          const dbBlocked = results.some((result) => result.status === 'rejected' && isDbLimit(result.reason));
          setError(dbBlocked ? friendlyDbMsg : 'No se pudo cargar el Control Center. Revisa la conexión e intenta de nuevo.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [environment]);

  const actionItems =
    operationsTruth?.items
      .filter((item) => item.blockerCode || item.nextAction)
      .slice(0, 6) ?? [];
  const watchRows = useMemo(() => {
    const items = operationsTruth?.items ?? [];
    return [...items]
      .sort((a, b) => {
        const blockerDelta = Number(Boolean(b.blockerCode)) - Number(Boolean(a.blockerCode));
        if (blockerDelta !== 0) return blockerDelta;
        const proofA = Number(a.orderIngested) + Number(a.supplierPurchaseProved) + Number(a.trackingAttached);
        const proofB = Number(b.orderIngested) + Number(b.supplierPurchaseProved) + Number(b.trackingAttached);
        return proofA - proofB;
      })
      .slice(0, 10);
  }, [operationsTruth]);

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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Layers className="h-5 w-5 text-primary-500 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Centro de Control</h1>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              environment === 'production'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
            }`}>
              {environment === 'production' ? 'Producción' : 'Sandbox'}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Listings, blockers, pruebas comerciales y decisiones de agentes.
            {operationsTruth?.generatedAt ? (
              <span className="ml-2 text-xs opacity-70">Evidencia: {new Date(operationsTruth.generatedAt).toLocaleString()}</span>
            ) : null}
          </p>
        </div>
      </div>

      {loadWarnings.length > 0 && (
        <div
          className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-amber-900 dark:text-amber-200"
          role="alert"
        >
          {loadWarnings.map((warning, index) => (
            <p key={index} className={index > 0 ? 'mt-2' : ''}>
              {warning}
            </p>
          ))}
        </div>
      )}

      {operationsTruth && (
        <>
          <OperationsTruthSummaryPanel data={operationsTruth} />

          <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1fr] gap-4">
            <PostSaleProofLadderPanel
              summary={operationsTruth.summary.proofCounts}
              title="Evidencia Post-venta"
              subtitle="La operación comercial solo avanza cuando cada evidencia existe en backend."
            />

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Acciones Pendientes</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Bloqueos y siguientes pasos tomados directamente del contrato canónico.
                </p>
              </div>
              {actionItems.length === 0 ? (
                <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-700 dark:text-green-300">
                  No hay acciones operativas pendientes en la muestra actual.
                </div>
              ) : (
                <div className="space-y-3">
                  {actionItems.map((item) => (
                    <div key={item.productId} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      {(() => {
                        const lifecycle = resolveOperationalLifecycleStage({ operationsTruth: item });
                        return (
                          <div className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium mb-2 ${lifecycleToneClasses(lifecycle.tone)}`}>
                            {lifecycle.label}
                          </div>
                        );
                      })()}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {item.productTitle}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Local: {formatStatusLabel(item.localListingState)} · Live: {formatStatusLabel(item.externalMarketplaceState)}
                          </p>
                        </div>
                        {item.blockerCode ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-1 text-xs text-red-700 dark:text-red-300">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            {item.blockerCode}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-1 text-xs text-blue-700 dark:text-blue-300">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            no blocker
                          </span>
                        )}
                      </div>
                      {item.nextAction && (
                        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                          Acción siguiente: {item.nextAction}
                        </p>
                      )}
                      {item.lastMarketplaceSyncAt && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Última evidencia marketplace: {new Date(item.lastMarketplaceSyncAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <AgentDecisionTracePanel items={operationsTruth.items} />

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Monitor de Ciclo Operativo</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Listing → Orden → Fulfillment: relación producto, listing, orden ingerida y evidencia de fulfillment.
              </p>
            </div>
            {watchRows.length === 0 ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-sm text-slate-500 dark:text-slate-400">
                Sin filas operativas para mostrar.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Producto</th>
                      <th className="py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ciclo de vida</th>
                      <th className="py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Listing</th>
                      <th className="py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sincr. Orden</th>
                      <th className="py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Fulfillment</th>
                      <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Acción siguiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchRows.map((row) => {
                      const lifecycle = resolveOperationalLifecycleStage({ operationsTruth: row });
                      return (
                        <tr key={row.productId} className="border-b border-slate-100 dark:border-slate-800/50">
                          <td className="py-2 pr-3">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{row.productTitle}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">#{row.productId}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${lifecycleToneClasses(lifecycle.tone)}`}>
                              {lifecycle.label}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <div className="text-slate-700 dark:text-slate-300">{row.marketplace || '—'}</div>
                            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{row.listingId || '—'}</div>
                          </td>
                          <td className="py-2 pr-3">
                            {row.orderIngested ? (
                              <span className="text-green-600 dark:text-green-400">ingested</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">pending</span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="text-xs text-slate-700 dark:text-slate-300">
                              Purchase: {row.supplierPurchaseProved ? 'proved' : 'pending'}
                            </div>
                            <div className="text-xs text-slate-700 dark:text-slate-300">
                              Tracking: {row.trackingAttached ? 'attached' : 'missing'}
                            </div>
                          </td>
                          <td className="py-2 text-xs text-amber-700 dark:text-amber-300">
                            {row.nextAction || row.blockerMessage || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {readiness && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Salud Técnica del Sistema
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Conectores e infraestructura. No reemplaza la verdad operativa del listing ni la prueba comercial.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {[
              { label: 'Database', value: readiness.health.database },
              { label: 'Redis', value: readiness.health.redis },
              { label: 'Workers', value: readiness.health.workers ?? readiness.workerStatus },
              { label: 'Marketplace API', value: readiness.health.marketplaceApi },
              { label: 'Supplier API', value: readiness.health.supplierApi },
              { label: 'Modo automatización', value: readiness.automationModeStatus === 'enabled' ? 'enabled' : 'disabled' },
            ].map((item) => {
              const tone = statusTone(item.value);
              return (
                <div key={item.label} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${tone.card}`}>
                  {tone.icon}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{item.label}</p>
                    <p className={`text-xs ${tone.text}`}>{item.value}</p>
                  </div>
                </div>
              );
            })}
            {autopilotStatus && (
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-3 py-2.5">
                {statusTone(autopilotStatus.running ? 'running' : 'disabled').icon}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100">Autopilot runtime</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {autopilotStatus.running
                      ? 'Ejecutándose'
                      : autopilotStatus.config?.enabled
                        ? `Detenido (${autopilotStatus.status})`
                        : 'No habilitado'}
                  </p>
                  {autopilotStatus.lastRun && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Último ciclo: {new Date(autopilotStatus.lastRun).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Deployment: <strong className="text-slate-700 dark:text-slate-300">{readiness.deploymentStatus}</strong>
            </span>
            <span>
              Marketplaces configurados: <strong className="text-slate-700 dark:text-slate-300">{readiness.marketplaceIntegrations.count}</strong>
            </span>
            <span>
              Proveedor configurado: <strong className="text-slate-700 dark:text-slate-300">{readiness.supplierIntegrations.configured ? 'sí' : 'no'}</strong>
            </span>
            {readiness.timestamp && (
              <span>
                Reportado: <strong className="text-slate-700 dark:text-slate-300">{new Date(readiness.timestamp).toLocaleString()}</strong>
              </span>
            )}
          </div>
          {readiness.health.alerts && readiness.health.alerts.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">Alertas técnicas</p>
              <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-300 mt-1.5 space-y-0.5">
                {readiness.health.alerts.map((alert, index) => (
                  <li key={index}>{alert}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Controles de Automatización
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Controles reales de ejecución. Disparan flujos técnicos, pero no equivalen por sí solos a éxito comercial o listings activos.
          </p>
        </div>

        {phase32Status ? (
          <div className="space-y-2 mb-4 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex flex-wrap gap-4">
              <span>
                Última activación:{' '}
                {phase32Status.lastActivation ? (
                  phase32Status.lastActivation.success ? (
                    <strong className="text-green-600 dark:text-green-400">OK</strong>
                  ) : (
                    <strong className="text-amber-600 dark:text-amber-400">Con errores</strong>
                  )
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">Nunca</span>
                )}
              </span>
              <span>
                Scheduler: <strong>{phase32Status.schedulerCron}</strong>
              </span>
              <span>
                Máx. nuevos listados/día: <strong>{phase32Status.maxNewListingsPerDay}</strong>
              </span>
            </div>
            {phase32Status.lastScheduledRun && (
              <div>
                Última ejecución automática: {new Date(phase32Status.lastScheduledRun.at).toLocaleString()}
                {phase32Status.lastScheduledRun.success ? (
                  <strong className="text-green-600 dark:text-green-400"> · OK</strong>
                ) : (
                  <strong className="text-amber-600 dark:text-amber-400"> · Con errores</strong>
                )}
                {phase32Status.lastScheduledRun.winnersDetected != null && (
                  <> · {phase32Status.lastScheduledRun.winnersDetected} winners</>
                )}
              </div>
            )}
            {phase32Status.lastValidationCycle && (
              <div>
                Último ciclo de validación:{' '}
                {phase32Status.lastValidationCycle.success ? 'OK' : 'Con errores'}
                {phase32Status.lastValidationCycle.durationMs != null && (
                  <> · {phase32Status.lastValidationCycle.durationMs} ms</>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
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
                .then((response) => {
                  setPhase32Message(
                    response.data?.success
                      ? 'Activación completada.'
                      : response.data?.errors?.join(' ') || 'Activación finalizada con avisos.'
                  );
                  setPhase32MessageType(response.data?.success ? 'success' : 'error');
                  fetchPhase32Status();
                })
                .catch((requestError) => {
                  setPhase32Message(requestError.response?.data?.error || requestError.message || 'Error al activar');
                  setPhase32MessageType('error');
                  fetchPhase32Status();
                })
                .finally(() => setPhase32Activating(false));
            }}
            disabled={phase32Activating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
          >
            {phase32Activating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Activar modo autónomo
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase32Message(null);
              setPhase32Validating(true);
              api
                .post('/api/system/phase32/run-validation-cycle')
                .then((response) => {
                  setPhase32Message(
                    response.data?.success
                      ? 'Ciclo de validación completado.'
                      : response.data?.errors?.join(' ') || 'Ciclo finalizado con avisos.'
                  );
                  setPhase32MessageType(response.data?.success ? 'success' : 'error');
                  fetchPhase32Status();
                })
                .catch((requestError) => {
                  setPhase32Message(
                    requestError.response?.data?.error || requestError.message || 'Error en ciclo de validación'
                  );
                  setPhase32MessageType('error');
                  fetchPhase32Status();
                })
                .finally(() => setPhase32Validating(false));
            }}
            disabled={phase32Validating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
          >
            {phase32Validating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Ejecutar ciclo de validación
          </button>
        </div>

        <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
          Las acciones manuales no sustituyen blocker truth, listing live state ni proof ladder. Revisa la capa canónica antes de concluir que la operación está lista.
        </p>
      </div>
    </div>
  );
}
