import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional extra row below subtitle (e.g. CycleStepsBreadcrumb) */
  below?: React.ReactNode;
  className?: string;
}

/**
 * Unified page-level header component.
 * Enforces consistent title/subtitle/badge/actions layout across all pages.
 */
export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  badge,
  actions,
  below,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex items-start gap-2.5">
          {Icon && (
            <div className="mt-0.5 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {title}
              </h1>
              {badge}
            </div>
            {subtitle && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
            {actions}
          </div>
        )}
      </div>
      {below && <div className="mt-1">{below}</div>}
    </div>
  );
}
