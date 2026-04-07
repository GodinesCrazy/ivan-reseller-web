const toneMap = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-slate-400',
  pulse: 'bg-emerald-500 animate-pulse',
} as const;

interface StatusDotProps {
  tone: keyof typeof toneMap;
  label?: string;
  className?: string;
}

export default function StatusDot({ tone, label, className = '' }: StatusDotProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${toneMap[tone]}`} />
      {label && <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>}
    </span>
  );
}
