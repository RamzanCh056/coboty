import { AlertTriangle, MessageSquare } from 'lucide-react'
import type { Department, StaffUser, Ticket } from '../../data/types'
import { DepartmentPill, StatusPill } from '../ui/Pill'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { relativeTime } from '../../lib/format'
import { cn } from '../../lib/cn'
import { getPrimaryAction, isActiveAttention } from '../../lib/ticketFlow'

interface TicketRowProps {
  ticket: Ticket
  department: Department
  assignee: StaffUser | null
  currentUserId?: string | null
  onOpen: (ticket: Ticket) => void
  onPrimaryAction: (ticket: Ticket) => void
}

export function TicketRow({
  ticket,
  department,
  assignee,
  currentUserId,
  onOpen,
  onPrimaryAction,
}: TicketRowProps) {
  const action = getPrimaryAction(ticket, currentUserId)
  const needsAttention = isActiveAttention(ticket)
  const claim = ticket.summary || ticket.claimText

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 border-b border-border px-4 py-3.5 transition-colors duration-150 ease-out last:border-b-0 hover:bg-page/80 sm:flex-row sm:items-center sm:gap-5 sm:px-5',
        ticket.hasUnreadCustomerReply && 'bg-status-new-bg/35',
        needsAttention && 'bg-status-stuck-bg/20',
      )}
    >
      <span
        className={cn(
          'absolute inset-y-0 left-0 w-1 rounded-r-full',
          needsAttention
            ? 'bg-status-stuck-text'
            : ticket.hasUnreadCustomerReply
              ? 'bg-status-new-text'
              : ticket.status === 'solved'
                ? 'bg-status-solved-text/50'
                : 'bg-transparent group-hover:bg-border-strong',
        )}
        aria-hidden="true"
      />

      <button
        onClick={() => onOpen(ticket)}
        className="focus-ring flex min-w-0 flex-1 flex-col gap-2 rounded-control text-left sm:flex-row sm:items-center sm:gap-5"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-none">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium tracking-wide text-text-tertiary">
              {ticket.displayId}
            </span>
            {needsAttention && (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-stuck-bg px-2 py-0.5 text-[11px] font-medium text-status-stuck-text">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {ticket.stuckSinceHours ?? 24}h overdue
              </span>
            )}
            {ticket.hasUnreadCustomerReply && (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-new-bg px-2 py-0.5 text-[11px] font-medium text-status-new-text">
                <MessageSquare className="h-3 w-3" aria-hidden="true" />
                Customer replied
              </span>
            )}
          </div>
          <p className="truncate text-md font-medium text-text-primary">{claim}</p>
          <p className="truncate text-sm text-text-secondary">
            {ticket.customerName}
            <span className="text-text-tertiary">
              {' '}
              · {needsAttention ? 'Needs attention' : relativeTime(ticket.updatedAt || ticket.createdAt)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:w-[13.5rem] sm:shrink-0 sm:justify-end">
          <DepartmentPill name={department.name} slug={department.slug} />
          <StatusPill status={ticket.status} />
          {assignee ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
              <Avatar initials={assignee.avatarInitials} size="sm" />
              <span className="hidden max-w-[4.5rem] truncate lg:inline">{assignee.name.split(' ')[0]}</span>
            </span>
          ) : (
            <span className="text-xs text-text-tertiary">Unassigned</span>
          )}
        </div>
      </button>

      <div className="flex w-full gap-2 sm:w-[9.5rem] sm:shrink-0 sm:flex-col sm:items-stretch lg:w-40">
        {action ? (
          <Button
            size="sm"
            className="w-full"
            variant={action.kind === 'takeover' ? 'danger-outline' : 'primary'}
            onClick={(e) => {
              e.stopPropagation()
              onPrimaryAction(ticket)
            }}
          >
            <action.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {action.label}
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="w-full" onClick={() => onOpen(ticket)}>
            View case
          </Button>
        )}
      </div>
    </div>
  )
}
