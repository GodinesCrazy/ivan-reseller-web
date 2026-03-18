import * as React from "react"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = 'default', ...props }, ref) => {
    const variants = {
      default:
        'bg-primary-600 text-white hover:bg-primary-700 shadow-sm dark:bg-primary-600 dark:hover:bg-primary-500',
      outline:
        'border-2 border-gray-300 bg-white text-gray-900 hover:bg-gray-50 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
      ghost:
        'text-gray-800 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800',
      destructive:
        'bg-red-600 text-white hover:bg-red-700 shadow-sm dark:bg-red-600 dark:hover:bg-red-500',
      secondary:
        'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600',
    }

    return (
      <button
        className={`inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 min-h-[40px] dark:focus-visible:ring-offset-slate-950 ${variants[variant]} ${className}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
