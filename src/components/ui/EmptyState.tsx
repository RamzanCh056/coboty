import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-page">
        <Icon className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
      </div>
      <p className="text-base font-medium text-text-primary">{title}</p>
      <p className="max-w-xs text-sm text-text-secondary">{description}</p>
    </div>
  )
}
