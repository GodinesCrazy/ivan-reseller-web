import { Bot, ShieldAlert } from 'lucide-react';
import type { OperationsTruthItem } from '@/types/operations';

interface AgentDecisionTracePanelProps {
  items: OperationsTruthItem[];
}

export default function AgentDecisionTracePanel({ items }: AgentDecisionTracePanelProps) {
  const traced = items.filter((item) => item.agentTrace).slice(0, 6);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Agent Decision Trace</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Advisory vs blocking decisions from the canonical backend truth contract.
        </p>
      </div>
      {traced.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-sm text-gray-500 dark:text-gray-400">
          No agent decision trace is available for the current sample.
        </div>
      ) : (
        <div className="space-y-3">
          {traced.map((item) => {
            const trace = item.agentTrace!;
            return (
              <div key={`${item.productId}-${trace.agentName}-${trace.decidedAt || 'na'}`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{item.productTitle}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {trace.agentName} · {trace.stage}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                    trace.blocking
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  }`}>
                    {trace.blocking ? <ShieldAlert className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    {trace.blocking ? 'blocking' : 'advisory'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-800 dark:text-gray-200">
                  Decision: <span className="font-medium">{trace.decision}</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Reason: {trace.reasonCode}
                </p>
                {trace.evidenceSummary.length > 0 && (
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
                    Evidence: {trace.evidenceSummary.join(' · ')}
                  </p>
                )}
                {trace.nextAction && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Next action: {trace.nextAction}
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
