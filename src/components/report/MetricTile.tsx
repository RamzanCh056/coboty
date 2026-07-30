import { ArrowDown, ArrowUp } from 'lucide-react'
import type { MetricCard } from '../../data/report'
import { cn } from '../../lib/cn'

export function MetricTile({ metric }: { metric: MetricCard }) {
  const Icon = metric.trend === 'up' ? ArrowUp : ArrowDown

  return (
    <div className="flex flex-col gap-2 rounded-card-lg border border-border bg-surface px-5 py-4">
      <span className="text-sm font-medium text-text-secondary">{metric.label}</span>
      <span className="text-2xl font-medium text-text-primary">{metric.value}</span>
      <span
        className={cn(
          'flex items-center gap-1 text-xs font-medium',
          metric.isGoodTrend ? 'text-status-solved-text' : 'text-status-stuck-text',
        )}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {metric.delta}
      </span>
    </div>
  )
}
