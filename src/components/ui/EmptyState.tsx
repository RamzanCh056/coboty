import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center animate-[fade-in_200ms_ease-out]">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-page ring-1 ring-border">
        <Icon className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
      </div>
      <p className="text-base font-medium text-text-primary">{title}</p>
      <p className="max-w-sm text-sm text-text-secondary">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
