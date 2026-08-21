import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { DepartmentSlug, TicketStatus } from '../../data/types'

const statusLabels: Record<TicketStatus, string> = {
  new: 'New',
  assigned: 'Assigned',
  opened: 'In progress',
  calling: 'Contacting',
  awaiting_confirmation: 'Confirm close',
  solved: 'Resolved',
}

const statusClasses: Record<TicketStatus, string> = {
  new: 'bg-status-new-bg text-status-new-text',
  assigned: 'bg-status-assigned-bg text-status-assigned-text',
  opened: 'bg-status-opened-bg text-status-opened-text',
  calling: 'bg-status-calling-bg text-status-calling-text',
  awaiting_confirmation: 'bg-status-calling-bg text-status-calling-text',
  solved: 'bg-status-solved-bg text-status-solved-text',
}

export function StatusPill({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none',
        statusClasses[status],
        className,
      )}
    >
      {statusLabels[status]}
    </span>
  )
}

const deptClasses: Record<DepartmentSlug, string> = {
  repair: 'bg-dept-repair-bg text-dept-repair-text',
  finance: 'bg-dept-finance-bg text-dept-finance-text',
  sales: 'bg-dept-sales-bg text-dept-sales-text',
  logistics: 'bg-dept-logistics-bg text-dept-logistics-text',
}

export function DepartmentPill({
  name,
  slug,
  className,
}: {
  name: string
  slug: DepartmentSlug
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none',
        deptClasses[slug],
        className,
      )}
    >
      {name}
    </span>
  )
}

export function WarningChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-status-stuck-bg px-2.5 py-1 text-xs font-medium leading-none text-status-stuck-text',
        className,
      )}
    >
      {children}
    </span>
  )
}
