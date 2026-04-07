import { AlertCircle, Clock3, ExternalLink, ShieldAlert } from 'lucide-react';
import type { OperationsTruthResponse } from '@/types/operations';

function formatStateLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return 'desconocido';
  return raw.replace(/_/g, ' ');
}

interface OperationsTruthSummaryPanelProps {
  data: OperationsTruthResponse;
}

export default function OperationsTruthSummaryPanel({ data }: OperationsTruthSummaryPanelProps) {
  const topBlocked = data.items.filter((item) => item.blockerCode).slice(0, 4);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4">
      {/* Panel izquierdo: Estado de listings en vivo */}
      <div className="ir-panel p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Estado de Listings en Vivo</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Estado canónico de publicaciones, blockers y evidencia desde el contrato de backend.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3">
            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-semibold tracking-wider">Activo</p>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{data.summary.liveStateCounts.active}</p>
          </div>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-[10px] text-amber-700 dark:text-amber-300 uppercase font-semibold tracking-wider">En revisión</p>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">{data.summary.liveStateCounts.under_review}</p>
          </div>
          <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-3">
            <p className="text-[10px] text-orange-700 dark:text-orange-300 uppercase font-semibold tracking-wider">Pausado</p>
            <p className="text-xl font-bold text-orange-700 dark:text-orange-300 tabular-nums">{data.summary.liveStateCounts.paused}</p>
          </div>
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
            <p className="text-[10px] text-red-700 dark:text-red-300 uppercase font-semibold tracking-wider">Pub. fallida</p>
            <p className="text-xl font-bold text-red-700 dark:text-red-300 tabular-nums">{data.summary.liveStateCounts.failed_publish}</p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-[10px] text-slate-600 dark:text-slate-400 uppercase font-semibold tracking-wider">Desconocido</p>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-200 tabular-nums">{data.summary.liveStateCounts.unknown}</p>
          </div>
        </div>
      </div>

      {/* Panel derecho: Blockers activos */}
      <div className="ir-panel p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Blockers Activos</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Blockers canónicos del contrato de backend. La operación no avanza hasta resolverlos.
          </p>
        </div>
        {topBlocked.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            Sin blockers canónicos detectados en la muestra actual.
          </div>
        ) : (
          <div className="space-y-2.5">
            {topBlocked.map((item) => (
              <div key={item.productId} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {item.productTitle}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {formatStateLabel(item.externalMarketplaceState)}
                      {item.externalMarketplaceSubStatus.length > 0 && ` · ${item.externalMarketplaceSubStatus.join(', ')}`}
                    </p>
                  </div>
                  {item.listingUrl && (
                    <a
                      href={item.listingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Listing
                    </a>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-red-700 dark:text-red-300 font-medium">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {item.blockerCode}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-slate-700 dark:text-slate-300">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {item.sourceLabels.blocker}
                  </span>
                  {item.lastMarketplaceSyncAt && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-slate-600 dark:text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" />
                      {new Date(item.lastMarketplaceSyncAt).toLocaleString()}
                    </span>
                  )}
                </div>
                {item.blockerMessage && (
                  <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">{item.blockerMessage}</p>
                )}
                {item.nextAction && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    Siguiente acción: {item.nextAction}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
