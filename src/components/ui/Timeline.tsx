import { Check } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface TimelineStep {
  label: string
  detail?: string
  annotation?: string
}

export function Timeline({ steps, currentIndex }: { steps: TimelineStep[]; currentIndex: number }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const isComplete = i < currentIndex
        const isCurrent = i === currentIndex
        const isLast = i === steps.length - 1

        return (
          <li key={step.label} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                className={cn(
                  'absolute left-[11px] top-6 h-[calc(100%-8px)] w-px transition-colors duration-200 ease-out',
                  isComplete ? 'bg-status-solved-text' : 'bg-border',
                )}
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center">
              {isCurrent && (
                <span
                  className="absolute inset-0 rounded-full bg-accent"
                  style={{ animation: 'timeline-pulse 2.2s ease-out infinite' }}
                  aria-hidden="true"
                />
              )}
              <span
                className={cn(
                  'relative flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors duration-200 ease-out',
                  isComplete && 'border-status-solved-text bg-status-solved-text text-text-inverse',
                  isCurrent && 'border-accent bg-accent text-text-inverse',
                  !isComplete && !isCurrent && 'border-border bg-surface',
                )}
              >
                {isComplete && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                {isCurrent && <span className="h-2 w-2 rounded-full bg-text-inverse" />}
              </span>
            </span>
            <div className="flex-1 pt-0.5">
              <p
                className={cn(
                  'text-base font-medium transition-colors duration-200 ease-out',
                  isComplete || isCurrent ? 'text-text-primary' : 'text-text-tertiary',
                )}
              >
                {step.label}
              </p>
              {step.detail && (isComplete || isCurrent) && (
                <p className="mt-0.5 text-sm text-text-secondary">{step.detail}</p>
              )}
              {step.annotation && (
                <p className="mt-1 text-xs text-text-tertiary">{step.annotation}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
