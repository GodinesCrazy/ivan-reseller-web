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
  if (state === 'done') return 'border-emerald-500 bg-emerald-500 text-slate-950';
  if (state === 'active') return 'border-cyan-400 bg-cyan-400 text-slate-950 animate-pulse';
  if (state === 'blocked') return 'border-rose-400 bg-rose-500 text-white';
  return 'border-slate-600 bg-slate-900 text-slate-500';
}

function connectorClass(left: ProductLifecycleStep, right: ProductLifecycleStep): string {
  if (right.state === 'blocked') return 'bg-rose-500/70';
  if (left.state === 'done') return 'bg-emerald-500';
  if (left.state === 'active' || right.state === 'active') return 'bg-cyan-500/70';
  return 'bg-slate-700';
}

export function ProductLifecycleLine({ steps, compact = false, className = '' }: ProductLifecycleLineProps) {
  if (!steps.length) return null;

  const nodeSize = compact ? 'h-4 w-4 text-[9px]' : 'h-5 w-5 text-[10px]';
  const connectorWidth = compact ? 'w-5' : 'w-7';
  const labelClass = compact ? 'max-w-10 text-[9px]' : 'max-w-12 text-[10px]';

  return (
    <div className={className}>
      <div className="flex items-center">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center" title={step.title ?? `${step.label}: ${step.state}`}>
              <span className={`flex ${nodeSize} items-center justify-center rounded-full border font-black shadow-sm transition duration-200 motion-safe:hover:scale-110 ${nodeClass(step.state)}`}>
                {step.state === 'done' ? 'OK' : step.state === 'blocked' ? '!' : index + 1}
              </span>
              <span className={`mt-1 truncate font-medium text-slate-500 dark:text-slate-400 ${labelClass}`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span className={`mb-5 h-0.5 ${connectorWidth} overflow-hidden rounded-full bg-slate-800`}>
                <span
                  className={`block h-full rounded-full transition-all duration-500 ${
                    step.state === 'active' || steps[index + 1].state === 'active'
                      ? 'w-2/3 motion-safe:animate-pulse'
                      : step.state === 'done'
                        ? 'w-full'
                        : 'w-1/3'
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
