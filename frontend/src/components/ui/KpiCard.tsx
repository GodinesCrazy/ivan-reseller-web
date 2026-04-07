import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  onClick?: () => void;
  className?: string;
}

const toneStyles = {
  default: {
    card: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
    icon: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
    value: 'text-slate-900 dark:text-white',
    label: 'text-slate-500 dark:text-slate-400',
  },
  success: {
    card: 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20',
    icon: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
    value: 'text-emerald-700 dark:text-emerald-300',
    label: 'text-emerald-600 dark:text-emerald-500',
  },
  warning: {
    card: 'border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20',
    icon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
    value: 'text-amber-700 dark:text-amber-300',
    label: 'text-amber-600 dark:text-amber-500',
  },
  danger: {
    card: 'border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20',
    icon: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
    value: 'text-red-700 dark:text-red-300',
    label: 'text-red-600 dark:text-red-500',
  },
  info: {
    card: 'border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20',
    icon: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
    value: 'text-blue-700 dark:text-blue-300',
    label: 'text-blue-600 dark:text-blue-500',
  },
};

export default function KpiCard({ icon: Icon, label, value, subtitle, tone = 'default', onClick, className = '' }: KpiCardProps) {
  const s = toneStyles[tone];
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-xl border p-4 shadow-card transition-all ${onClick ? 'cursor-pointer hover:shadow-card-hover' : ''} ${s.card} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        {Icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.icon}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
        <span className={`text-[11px] font-medium text-right leading-tight ${s.label}`}>{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums tracking-tight ${s.value}`}>{value}</p>
      {subtitle && <p className={`text-[11px] mt-0.5 ${s.label}`}>{subtitle}</p>}
    </Tag>
  );
}
