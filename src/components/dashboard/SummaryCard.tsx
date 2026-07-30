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
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring group relative flex flex-1 items-start justify-between overflow-hidden rounded-card-lg border bg-surface px-5 py-4 text-left transition-colors duration-150 ease-out',
        active ? 'border-border-strong' : 'border-border hover:border-border-strong',
      )}
    >
      <span
        className={cn(
          'absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 transition-transform duration-200 ease-out',
          tone === 'warning' ? 'bg-status-stuck-text' : 'bg-accent',
          active && 'scale-x-100',
        )}
        aria-hidden="true"
      />

      <div className="flex flex-col gap-1">
        <span
          className={cn(
            'text-sm font-medium',
            tone === 'warning' ? 'text-status-stuck-text' : 'text-text-secondary',
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            'text-2xl font-medium tabular-nums',
            tone === 'warning' ? 'text-status-stuck-text' : 'text-text-primary',
          )}
        >
          {count}
        </span>
      </div>

      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors duration-150 ease-out',
          tone === 'warning'
            ? 'bg-status-stuck-bg text-status-stuck-text'
            : 'bg-page text-text-tertiary group-hover:text-text-secondary',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>
  )
}
