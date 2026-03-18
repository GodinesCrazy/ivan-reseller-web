import * as React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
}

function Badge({ className = "", variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-primary-600 text-white dark:bg-primary-600',
    secondary:
      'bg-gray-200 text-gray-900 dark:bg-slate-600 dark:text-slate-100',
    destructive: 'bg-red-600 text-white',
    outline:
      'border-2 border-gray-400 bg-transparent text-gray-800 dark:border-slate-500 dark:text-slate-200',
    success: 'bg-emerald-600 text-white dark:bg-emerald-600',
    warning: 'bg-amber-500 text-gray-950 font-bold dark:bg-amber-500 dark:text-gray-950',
  }

  return (
    <div
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:focus:ring-offset-slate-900 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export { Badge }
