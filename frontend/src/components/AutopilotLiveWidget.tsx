/**
 * AutopilotLiveWidget - Estado en vivo del Autopilot en el Dashboard
 * Muestra: Running/Stopped, fase actual, progreso del ciclo (query, oportunidades, analizadas, publicadas)
 * Polling cada 2s cuando corre, 10s cuando está parado.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Pause, ChevronRight } from 'lucide-react';
import api from '@/services/api';

interface AutopilotStatus {
  running: boolean;
  currentPhase?: 'idle' | 'searching' | 'filtering' | 'analyzing' | 'publishing';
  currentCycleProgress?: {
    query?: string;
    opportunitiesFound?: number;
    analyzed?: number;
    published?: number;
  };
  lastRun?: string | null;
  opportunitiesGenerated?: number;
  productsPublished?: number;
}

const PHASE_LABELS: Record<string, string> = {
  searching: 'Buscando oportunidades en AliExpress…',
  filtering: 'Filtrando productos asequibles…',
  analyzing: 'Analizando rentabilidad y ROI…',
  publishing: 'Publicando en marketplace…',
  idle: 'Entre ciclos',
};

export default function AutopilotLiveWidget() {
  const [status, setStatus] = useState<AutopilotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStatus = async () => {
    try {
      const { data } = await api.get<AutopilotStatus>('/api/autopilot/status');
      setStatus(data ?? null);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (loading) return;
    const ms = status?.running ? 2000 : 10000;
    const interval = setInterval(fetchStatus, ms);
    return () => clearInterval(interval);
  }, [status?.running, loading]);

  if (loading || error || !status) {
    return null;
  }

  const phase = status.currentPhase;
  const progress = status.currentCycleProgress;
  const hasProgress = progress && (progress.query || progress.opportunitiesFound != null || progress.analyzed != null || progress.published != null);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${status.running ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
            {status.running ? (
              <Activity className="w-5 h-5 text-green-600 dark:text-green-400 animate-pulse" />
            ) : (
              <Pause className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            )}
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Autopilot</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {status.running
                ? (phase ? PHASE_LABELS[phase] ?? 'En ejecución' : 'Ciclo activo')
                : 'Detenido'}
            </p>
          </div>
        </div>
        <Link
          to="/autopilot"
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          Ir a Autopilot <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {status.running && hasProgress && (
        <div className="flex flex-wrap gap-2 mt-2">
          {progress!.query && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 truncate max-w-[180px]"
              title={progress!.query}
            >
              {progress!.query}
            </span>
          )}
          {progress!.opportunitiesFound != null && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
              Oport: {progress!.opportunitiesFound}
            </span>
          )}
          {progress!.analyzed != null && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-medium">
              Anal: {progress!.analyzed}
            </span>
          )}
          {progress!.published != null && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">
              Publ: {progress!.published}
            </span>
          )}
        </div>
      )}

          {!status.running && (status.lastRun || status.opportunitiesGenerated != null || status.productsPublished != null) && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
          {status.lastRun && (
            <span>Último: {new Date(status.lastRun).toLocaleString()}</span>
          )}
          {status.opportunitiesGenerated != null && (
            <span>Oportunidades: {status.opportunitiesGenerated}</span>
          )}
          {status.productsPublished != null && (
            <span>Total publicados (Autopilot): {status.productsPublished}</span>
          )}
        </div>
      )}
    </div>
  );
}
