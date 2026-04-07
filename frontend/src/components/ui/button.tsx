import * as React from "react"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary'
  size?: 'sm' | 'md' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = 'default', size = 'md', ...props }, ref) => {
    const variants = {
      default:
        'bg-primary-600 text-white hover:bg-primary-700 shadow-sm dark:bg-primary-600 dark:hover:bg-primary-500',
      outline:
        'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
      ghost:
        'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
      destructive:
        'bg-red-600 text-white hover:bg-red-700 shadow-sm dark:bg-red-600 dark:hover:bg-red-500',
      secondary:
        'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
    }
    const sizes = {
      sm: 'h-8 px-3 py-1.5 text-xs min-h-[32px]',
      md: 'h-9 px-3.5 py-2 text-sm min-h-[36px]',
      lg: 'h-10 px-4 py-2.5 text-sm min-h-[40px]',
      icon: 'h-9 w-9 p-0 min-h-[36px]',
    }

    return (
      <button
        className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-offset-slate-950 ${sizes[size]} ${variants[variant]} ${className}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
