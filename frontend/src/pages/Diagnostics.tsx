/**
 * Diagnostics Page — Premium SaaS redesign
 */

import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  Stethoscope,
  Server,
  Wifi,
  Shield,
  Database,
  BarChart3,
  Info,
} from 'lucide-react';
import { getDiagnosticsInfo, API_BASE_URL } from '@/config/runtime';
import api from '@/services/api';
import PageHeader from '@/components/ui/PageHeader';

interface DiagnosticResult {
  name: string;
  group: string;
  status: 'success' | 'error' | 'loading' | 'unknown';
  message: string;
  data?: unknown;
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  'Sistema': <Server className="w-4 h-4 text-blue-500" />,
  'Conectividad': <Wifi className="w-4 h-4 text-emerald-500" />,
  'Seguridad': <Shield className="w-4 h-4 text-violet-500" />,
  'APIs': <BarChart3 className="w-4 h-4 text-amber-500" />,
  'Configuración': <Database className="w-4 h-4 text-slate-500" />,
};

function StatusPill({ status }: { status: DiagnosticResult['status'] }) {
  switch (status) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          OK
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          <XCircle className="w-3 h-3" />
          Error
        </span>
      );
    case 'loading':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          <Loader2 className="w-3 h-3 animate-spin" />
          Verificando
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          <AlertCircle className="w-3 h-3" />
          Desconocido
        </span>
      );
  }
}

function getStatusIcon(status: DiagnosticResult['status']) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />;
    case 'loading':
      return <Loader2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5 animate-spin" />;
    default:
      return <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />;
  }
}

export default function Diagnostics() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const diagnosticsInfo = getDiagnosticsInfo();

  const runDiagnostics = async () => {
    setIsLoading(true);
    setResults([]);

    const newResults: DiagnosticResult[] = [];

    // ── SISTEMA ──────────────────────────────────────────────
    newResults.push({
      name: 'Configuración local',
      group: 'Sistema',
      status: 'success',
      message: 'Configuración cargada correctamente',
      data: diagnosticsInfo,
    });

    try {
      const r = await api.get('/health');
      newResults.push({
        name: 'Health check',
        group: 'Sistema',
        status: 'success',
        message: `Estado: ${r.data?.status || 'ok'}`,
        data: r.data,
      });
    } catch (e: unknown) {
      newResults.push({
        name: 'Health check',
        group: 'Sistema',
        status: 'error',
        message: `Error: ${(e as Error).message}`,
      });
    }

    try {
      const r = await fetch(`${API_BASE_URL}/version`, { credentials: 'include' });
      const d = await r.json() as { env?: string };
      newResults.push({
        name: 'Versión del backend',
        group: 'Sistema',
        status: r.ok ? 'success' : 'error',
        message: r.ok ? `Entorno: ${d.env ?? 'desconocido'}` : `HTTP ${r.status}`,
        data: d,
      });
    } catch (e: unknown) {
      newResults.push({ name: 'Versión del backend', group: 'Sistema', status: 'error', message: `Error: ${(e as Error).message}` });
    }

    // ── CONECTIVIDAD ─────────────────────────────────────────
    try {
      const r = await fetch(`${API_BASE_URL}/ready`, { credentials: 'include' });
      const d = await r.json() as { ready?: boolean; checks?: Record<string, unknown> };
      newResults.push({
        name: 'Readiness',
        group: 'Conectividad',
        status: r.ok && d.ready ? 'success' : 'error',
        message: d.ready ? 'Servicio listo para tráfico' : `No listo: ${JSON.stringify(d.checks ?? {})}`,
        data: d,
      });
    } catch (e: unknown) {
      newResults.push({ name: 'Readiness', group: 'Conectividad', status: 'error', message: `Error: ${(e as Error).message}` });
    }

    try {
      const r = await api.get('/api/connectivity');
      const d = r.data as { ok?: boolean };
      newResults.push({
        name: 'API connectivity',
        group: 'Conectividad',
        status: r.status === 200 && d?.ok ? 'success' : 'error',
        message: d?.ok ? 'Backend alcanzable' : `Inesperado: HTTP ${r.status}`,
        data: d,
      });
    } catch (e: unknown) {
      newResults.push({ name: 'API connectivity', group: 'Conectividad', status: 'error', message: `Error: ${(e as Error).message}` });
    }

    // ── SEGURIDAD ────────────────────────────────────────────
    try {
      const corsResponse = await fetch(`${API_BASE_URL}/health`, {
        method: 'OPTIONS',
        credentials: 'include',
        headers: { Origin: window.location.origin },
      });
      newResults.push({
        name: 'CORS preflight',
        group: 'Seguridad',
        status: corsResponse.ok || corsResponse.status === 204 ? 'success' : 'error',
        message: corsResponse.ok || corsResponse.status === 204 ? 'CORS preflight exitoso' : `HTTP ${corsResponse.status}`,
      });
    } catch (e: unknown) {
      newResults.push({ name: 'CORS preflight', group: 'Seguridad', status: 'error', message: `Error: ${(e as Error).message}` });
    }

    try {
      const status = await api.get('/api/auth-status')
        .then((r) => r.status)
        .catch((e: { response?: { status?: number } }) => e.response?.status ?? 0);
      newResults.push({
        name: 'Auth endpoint',
        group: 'Seguridad',
        status: status === 200 || status === 401 ? 'success' : 'error',
        message: status === 200 ? 'Autenticado' : status === 401 ? 'Sin sesión (endpoint OK)' : `HTTP ${status}`,
      });
    } catch (e: unknown) {
      newResults.push({ name: 'Auth endpoint', group: 'Seguridad', status: 'error', message: `Error: ${(e as Error).message}` });
    }

    // ── APIs ─────────────────────────────────────────────────
    const apiChecks: Array<{ name: string; path: string }> = [
      { name: 'Analytics', path: '/api/analytics/listings' },
      { name: 'Opportunities/research', path: '/api/opportunities/research' },
    ];

    for (const check of apiChecks) {
      try {
        const status = await api.get(check.path)
          .then((r) => r.status)
          .catch((e: { response?: { status?: number } }) => e.response?.status ?? 0);
        newResults.push({
          name: check.name,
          group: 'APIs',
          status: status === 200 || status === 401 ? 'success' : 'error',
          message: status === 200 ? 'OK' : status === 401 ? 'Requiere auth (endpoint OK)' : `HTTP ${status}`,
        });
      } catch (e: unknown) {
        newResults.push({ name: check.name, group: 'APIs', status: 'error', message: `Error: ${(e as Error).message}` });
      }
    }

    // ── CONFIGURACIÓN ────────────────────────────────────────
    try {
      const r = await fetch(`${API_BASE_URL}/config`, { credentials: 'include' });
      const d = await r.json() as { corsOriginCount?: number };
      newResults.push({
        name: 'Config info',
        group: 'Configuración',
        status: r.ok ? 'success' : 'error',
        message: r.ok ? `Orígenes CORS: ${d.corsOriginCount ?? 0}` : `HTTP ${r.status}`,
        data: d,
      });
    } catch (e: unknown) {
      newResults.push({ name: 'Config info', group: 'Configuración', status: 'error', message: `Error: ${(e as Error).message}` });
    }

    setResults(newResults);
    setIsLoading(false);
    setLastUpdate(new Date());
  };

  useEffect(() => {
    runDiagnostics();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = [...new Set(results.map((r) => r.group))];
  const totalOk = results.filter((r) => r.status === 'success').length;
  const totalErr = results.filter((r) => r.status === 'error').length;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Stethoscope}
        title="Diagnósticos"
        subtitle="Verificación de conectividad, APIs y configuración del sistema"
        badge={
          !isLoading && results.length > 0 ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              totalErr === 0
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
            }`}>
              {totalErr === 0 ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {totalErr === 0 ? `${totalOk} verificaciones OK` : `${totalErr} error${totalErr !== 1 ? 'es' : ''}`}
            </span>
          ) : undefined
        }
        actions={
          <button
            onClick={runDiagnostics}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Verificando...' : 'Volver a verificar'}
          </button>
        }
      />

      {/* Summary bar */}
      {!isLoading && results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="ir-panel p-3">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{results.length}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">verificaciones</p>
          </div>
          <div className={`ir-panel p-3 ${totalOk > 0 ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10' : ''}`}>
            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-500 uppercase tracking-wider">Exitosas</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">{totalOk}</p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-500">correctas</p>
          </div>
          <div className={`ir-panel p-3 ${totalErr > 0 ? 'border-red-200 dark:border-red-800/50 bg-red-50/40 dark:bg-red-900/10' : ''}`}>
            <p className="text-[11px] font-semibold text-red-600 dark:text-red-500 uppercase tracking-wider">Errores</p>
            <p className="text-2xl font-bold tabular-nums text-red-700 dark:text-red-300 mt-1">{totalErr}</p>
            <p className="text-[11px] text-red-600 dark:text-red-500">fallidas</p>
          </div>
          <div className="ir-panel p-3">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actualizado</p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1">
              {lastUpdate ? lastUpdate.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">última ejecución</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && results.length === 0 && (
        <div className="ir-panel p-8 flex flex-col items-center justify-center min-h-[200px]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Ejecutando diagnósticos...</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Verificando conectividad, APIs y seguridad</p>
        </div>
      )}

      {/* Results by group */}
      {groups.map((group) => {
        const groupResults = results.filter((r) => r.group === group);
        const groupErrors = groupResults.filter((r) => r.status === 'error').length;
        return (
          <div key={group} className="ir-panel overflow-hidden">
            <div className={`px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between ${
              groupErrors > 0
                ? 'bg-red-50/60 dark:bg-red-900/10'
                : 'bg-slate-50/60 dark:bg-slate-900/40'
            }`}>
              <div className="flex items-center gap-2">
                {GROUP_ICONS[group] ?? <Server className="w-4 h-4 text-slate-400" />}
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{group}</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">{groupResults.length} check{groupResults.length !== 1 ? 's' : ''}</span>
              </div>
              {groupErrors > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                  <XCircle className="w-3 h-3" />
                  {groupErrors} error{groupErrors !== 1 ? 'es' : ''}
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {groupResults.map((result, idx) => (
                <div key={idx} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {getStatusIcon(result.status)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{result.name}</p>
                        <p className={`text-xs mt-0.5 ${
                          result.status === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : result.status === 'success'
                              ? 'text-emerald-600 dark:text-emerald-500'
                              : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {result.message}
                        </p>
                      </div>
                    </div>
                    <StatusPill status={result.status} />
                  </div>
                  {result.data != null && (
                    <details className="mt-2 ml-6">
                      <summary className="text-[11px] text-blue-600 dark:text-blue-400 cursor-pointer hover:underline flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        Ver datos
                      </summary>
                      <pre className="mt-1.5 p-3 bg-slate-50 dark:bg-slate-900/80 rounded-lg text-[11px] overflow-auto text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 leading-relaxed">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Environment info panel */}
      <div className="ir-panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Entorno de ejecución</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: 'URL base API', value: diagnosticsInfo.apiBaseUrl },
            { label: 'Origen de ventana', value: diagnosticsInfo.windowOrigin },
            { label: 'Entorno', value: diagnosticsInfo.isProduction ? 'Producción' : 'Desarrollo' },
            { label: 'Nivel de log', value: diagnosticsInfo.logLevel },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-[110px] shrink-0 mt-0.5">{label}</span>
              <span className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all">{String(value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
