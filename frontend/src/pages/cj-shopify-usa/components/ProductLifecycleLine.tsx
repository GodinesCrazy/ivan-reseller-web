import { Check, AlertTriangle } from 'lucide-react';

export type ProductLifecycleStepState = 'done' | 'active' | 'blocked' | 'pending';

export type ProductLifecycleStep = {
  key: string;
  label: string;
  state: ProductLifecycleStepState;
  title?: string;
};

type ProductLifecycleLineProps = {
  steps: ProductLifecycleStep[];
  compact?: boolean;
  className?: string;
};

function nodeClass(state: ProductLifecycleStepState): string {
  if (state === 'done') return 'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-200/40 dark:shadow-emerald-900/30';
  if (state === 'active') return 'border-cyan-400 bg-cyan-400 text-slate-950 shadow-sm shadow-cyan-200/50 dark:shadow-cyan-900/40 animate-pulse';
  if (state === 'blocked') return 'border-rose-400 bg-rose-500 text-white shadow-sm shadow-rose-200/40 dark:shadow-rose-900/30';
  return 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500';
}

function connectorClass(left: ProductLifecycleStep, right: ProductLifecycleStep): string {
  if (right.state === 'blocked') return 'bg-rose-500/60';
  if (left.state === 'done') return 'bg-emerald-500';
  if (left.state === 'active' || right.state === 'active') return 'bg-cyan-400/60';
  return 'bg-slate-200 dark:bg-slate-700';
}

export function ProductLifecycleLine({ steps, compact = false, className = '' }: ProductLifecycleLineProps) {
  if (!steps.length) return null;

  const nodeSize = compact ? 'h-5 w-5' : 'h-6 w-6';
  const iconSize = compact ? 'w-2.5 h-2.5' : 'w-3 h-3';
  const connectorWidth = compact ? 'w-6' : 'w-8';
  const labelClass = compact ? 'max-w-12 text-[10px]' : 'max-w-14 text-[11px]';

  return (
    <div className={className}>
      <div className="flex items-center">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center" title={step.title ?? `${step.label}: ${step.state}`}>
              <span
                className={`flex ${nodeSize} items-center justify-center rounded-full border-2 font-bold transition-all duration-300 motion-safe:hover:scale-125 cursor-default ${nodeClass(step.state)}`}
              >
                {step.state === 'done' ? (
                  <Check className={iconSize} strokeWidth={3} />
                ) : step.state === 'blocked' ? (
                  <AlertTriangle className={iconSize} strokeWidth={3} />
                ) : (
                  <span className={compact ? 'text-[9px]' : 'text-[10px]'}>{index + 1}</span>
                )}
              </span>
              <span className={`mt-1.5 truncate font-semibold text-slate-500 dark:text-slate-400 leading-none ${labelClass}`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span className={`mb-5 h-[3px] ${connectorWidth} overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800`}>
                <span
                  className={`block h-full rounded-full transition-all duration-700 ease-out ${
                    step.state === 'active' || steps[index + 1].state === 'active'
                      ? 'w-2/3 motion-safe:animate-pulse'
                      : step.state === 'done'
                        ? 'w-full'
                        : 'w-1/4'
                  } ${connectorClass(step, steps[index + 1])}`}
                />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
