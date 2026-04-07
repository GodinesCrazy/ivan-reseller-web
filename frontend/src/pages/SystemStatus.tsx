import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, ExternalLink, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import api from '@/services/api';
import { fetchOperationsTruth } from '@/services/operationsTruth.api';
import type { OperationsTruthResponse } from '@/types/operations';
import OperationsTruthSummaryPanel from '@/components/OperationsTruthSummaryPanel';
import PostSaleProofLadderPanel from '@/components/PostSaleProofLadderPanel';
import AgentDecisionTracePanel from '@/components/AgentDecisionTracePanel';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import { useEnvironment } from '@/contexts/EnvironmentContext';

interface StatusDetails {
  ebay?: { message?: string; error?: string };
  mercadolibre?: { message?: string; error?: string };
  amazon?: { message?: string; error?: string };
}

interface StatusData {
  paypalConnected: boolean;
  ebayConnected: boolean;
  mercadolibreConnected?: boolean;
  amazonConnected?: boolean;
  aliexpressOAuth: boolean;
  autopilotEnabled: boolean;
  profitGuardEnabled: boolean;
  details?: StatusDetails;
}

export default function SystemStatus() {
  const { environment } = useEnvironment();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [operationsTruth, setOperationsTruth] = useState<OperationsTruthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const [systemResult, operationsResult] = await Promise.allSettled([
        api.get('/api/system/status'),
        fetchOperationsTruth({ limit: 8, environment }),
      ]);

      if (systemResult.status === 'fulfilled' && systemResult.value.data?.success && systemResult.value.data.data) {
        setStatus(systemResult.value.data.data);
        setError(null);
      } else {
        setStatus(null);
        const systemError =
          systemResult.status === 'rejected'
            ? systemResult.reason?.response?.data?.error || systemResult.reason?.message
            : 'No se pudo cargar el estado';
        setError(systemError || 'No se pudo cargar el estado');
      }

      if (operationsResult.status === 'fulfilled') {
        setOperationsTruth(operationsResult.value);
      } else {
        setOperationsTruth(null);
      }
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || requestError?.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [environment]);

  useLiveData({ fetchFn: fetchStatus, intervalMs: 30000, enabled: true });
  useNotificationRefetch({
    handlers: { SYSTEM_ALERT: fetchStatus },
    enabled: true,
  });

  const Item = ({
    label,
    connected,
    message,
    showConnectLink = false,
    reconnectHint,
  }: {
    label: string;
    connected: boolean;
    message?: string;
    showConnectLink?: boolean;
    reconnectHint?: string;
  }) => {
    const tooltip = message || (connected ? undefined : 'Completa la configuración en Configuración de API');
    return (
      <div
        className={`flex items-center justify-between py-3 px-4 rounded-lg border ${
          !connected && showConnectLink
            ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
        }`}
        title={tooltip}
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
          {!connected && (message || reconnectHint) && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={message || reconnectHint}>
              {message || reconnectHint}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {connected ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <>
              <XCircle className="w-5 h-5 text-red-500" />
              {showConnectLink && (
                <Link
                  to="/api-settings"
                  className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
                >
                  Reconectar <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error && !status && !operationsTruth) {
    return (
      <div className="p-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <p className="text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Estado del sistema</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Salud técnica y conectores como subcapa. La verdad operativa real del negocio se muestra abajo.
        </p>
        {operationsTruth?.generatedAt && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Entorno: {environment === 'production' ? 'producción' : environment === 'sandbox' ? 'sandbox' : 'todos'}
            {' · '}
            Evidencia operativa: {new Date(operationsTruth.generatedAt).toLocaleString()}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-200">
        Conectado no significa comercialmente listo. Un conector sano puede coexistir con listings bajo revisión, blockers activos o prueba post-venta inexistente.
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-200">
          La capa técnica tuvo un problema parcial: {error}
        </div>
      )}

      {status ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="h-5 w-5 text-blue-500" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Salud de conectores</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Estado técnico de autenticación e integraciones. No reemplaza listing truth ni proof truth.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
            <Item label="PayPal conectado" connected={status.paypalConnected} />
            <Item
              label="eBay conectado"
              connected={status.ebayConnected}
              message={status.details?.ebay?.message || status.details?.ebay?.error}
              showConnectLink={!status.ebayConnected}
              reconnectHint={!status.ebayConnected ? 'Necesario para publicar y recibir ventas por eBay.' : undefined}
            />
            <Item
              label="Mercado Libre conectado"
              connected={status.mercadolibreConnected ?? false}
              message={status.details?.mercadolibre?.message || status.details?.mercadolibre?.error}
              showConnectLink={!(status.mercadolibreConnected ?? false)}
              reconnectHint={
                !(status.mercadolibreConnected ?? false)
                  ? 'Necesario para publicar y recibir ventas por Mercado Libre.'
                  : undefined
              }
            />
            <Item
              label="Amazon conectado"
              connected={status.amazonConnected ?? false}
              message={status.details?.amazon?.message || status.details?.amazon?.error}
              showConnectLink={!(status.amazonConnected ?? false)}
            />
            <Item label="AliExpress OAuth" connected={status.aliexpressOAuth} />
            <Item label="Autopilot habilitado" connected={status.autopilotEnabled} />
            <Item label="Profit Guard habilitado" connected={status.profitGuardEnabled} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-200">
          No se pudo cargar la capa de conectores. La verdad operativa canónica sigue siendo la referencia principal si está disponible abajo.
        </div>
      )}

      {operationsTruth ? (
        <>
          <OperationsTruthSummaryPanel data={operationsTruth} />
          <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1fr] gap-4">
            <PostSaleProofLadderPanel
              summary={operationsTruth.summary.proofCounts}
              title="Estado de prueba operativa"
              subtitle="Cada etapa comercial se muestra como backend proof presente o pendiente."
            />
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Alcance operativo canónico</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Este panel ya separa health técnico de:
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <li>Estado local del listing vs estado en el marketplace</li>
                <li>Bloqueos actuales y próxima acción</li>
                <li>Escalera de prueba post-venta</li>
                <li>Decisiones del agente y evidencia</li>
              </ul>
            </div>
          </div>
          <AgentDecisionTracePanel items={operationsTruth.items} />
        </>
      ) : (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-200">
          No se pudo cargar la verdad operativa canónica en esta vista. La capa de conectores está visible, pero eso no alcanza para concluir readiness operacional.
        </div>
      )}
    </div>
  );
}
