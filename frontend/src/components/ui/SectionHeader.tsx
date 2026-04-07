import type { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export default function SectionHeader({ icon: Icon, title, description, badge, actions, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</h3>
          {badge}
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
