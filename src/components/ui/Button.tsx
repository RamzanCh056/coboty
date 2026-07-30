import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger-outline'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent text-text-inverse hover:bg-accent-hover active:opacity-90 disabled:opacity-40 disabled:hover:bg-accent',
  outline:
    'bg-surface text-text-primary border border-border hover:border-border-strong hover:bg-page active:bg-page disabled:opacity-40',
  ghost:
    'bg-transparent text-text-secondary hover:bg-page hover:text-text-primary active:bg-page disabled:opacity-40',
  'danger-outline':
    'bg-surface text-status-stuck-text border border-status-stuck-bg hover:bg-status-stuck-bg active:opacity-90 disabled:opacity-40',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-base gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'outline', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'focus-ring inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap',
          'transition-colors duration-150 ease-out disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
