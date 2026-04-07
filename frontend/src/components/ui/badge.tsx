import * as React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
}

function Badge({ className = "", variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-primary-600 text-white dark:bg-primary-600',
    secondary:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    destructive: 'bg-red-600 text-white',
    outline:
      'border border-slate-300 bg-transparent text-slate-700 dark:border-slate-600 dark:text-slate-300',
    success: 'bg-emerald-600 text-white dark:bg-emerald-600',
    warning: 'bg-amber-500 text-slate-950 font-bold dark:bg-amber-500 dark:text-slate-950',
  }

  return (
    <div
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:focus:ring-offset-slate-900 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export { Badge }
