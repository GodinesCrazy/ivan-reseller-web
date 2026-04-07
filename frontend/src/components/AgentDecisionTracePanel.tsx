import { Bot, ShieldAlert } from 'lucide-react';
import type { OperationsTruthItem } from '@/types/operations';

interface AgentDecisionTracePanelProps {
  items: OperationsTruthItem[];
}

export default function AgentDecisionTracePanel({ items }: AgentDecisionTracePanelProps) {
  const traced = items.filter((item) => item.agentTrace).slice(0, 6);

  return (
    <div className="ir-panel p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Traza de Decisiones del Agente</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Decisiones consultivas y bloqueantes del contrato canónico de backend.
        </p>
      </div>
      {traced.length === 0 ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 text-sm text-slate-500 dark:text-slate-400">
          No hay traza de decisiones disponible para la muestra actual.
        </div>
      ) : (
        <div className="space-y-2.5">
          {traced.map((item) => {
            const trace = item.agentTrace!;
            return (
              <div key={`${item.productId}-${trace.agentName}-${trace.decidedAt || 'na'}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{item.productTitle}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {trace.agentName} · {trace.stage}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${
                    trace.blocking
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  }`}>
                    {trace.blocking ? <ShieldAlert className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                    {trace.blocking ? 'bloqueante' : 'consultivo'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-800 dark:text-slate-200">
                  Decisión: <span className="font-medium">{trace.decision}</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Motivo: {trace.reasonCode}
                </p>
                {trace.evidenceSummary.length > 0 && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">
                    Evidencia: {trace.evidenceSummary.join(' · ')}
                  </p>
                )}
                {trace.nextAction && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Siguiente acción: {trace.nextAction}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
