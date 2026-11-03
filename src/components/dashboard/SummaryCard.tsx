import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

export function SummaryCard({
  label,
  count,
  icon: Icon,
  tone = 'neutral',
  active,
  onClick,
}: {
  label: string
  count: number
  icon: LucideIcon
  tone?: 'neutral' | 'warning'
  active: boolean
  onClick: () => void
}) {
  const hasItems = count > 0

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring group relative flex flex-1 items-start justify-between overflow-hidden rounded-card-lg border px-4 py-3.5 text-left transition-all duration-150 ease-out sm:px-5 sm:py-4',
        active
          ? 'border-border-strong bg-surface shadow-[0_10px_30px_-18px_rgba(24,24,27,0.45)]'
          : 'border-border bg-surface hover:border-border-strong hover:bg-surface-raised',
        tone === 'warning' && hasItems && !active && 'border-status-stuck-bg',
      )}
    >
      <span
        className={cn(
          'absolute inset-x-0 top-0 h-0.5 origin-left transition-transform duration-200 ease-out',
          tone === 'warning' ? 'bg-status-stuck-text' : 'bg-accent',
          active || (tone === 'warning' && hasItems) ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
        )}
        aria-hidden="true"
      />

      <div className="flex flex-col gap-1">
        <span
          className={cn(
            'text-sm font-medium',
            tone === 'warning' && hasItems ? 'text-status-stuck-text' : 'text-text-secondary',
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            'text-3xl font-medium tracking-tight tabular-nums',
            tone === 'warning' && hasItems ? 'text-status-stuck-text' : 'text-text-primary',
            !hasItems && 'text-text-tertiary',
          )}
        >
          {count}
        </span>
      </div>

      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-control transition-colors duration-150 ease-out',
          tone === 'warning' && hasItems
            ? 'bg-status-stuck-bg text-status-stuck-text'
            : 'bg-page text-text-tertiary group-hover:text-text-secondary',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>
  )
}
