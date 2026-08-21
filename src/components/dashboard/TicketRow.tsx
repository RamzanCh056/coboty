import { AlertTriangle, MessageSquare } from 'lucide-react'
import type { Department, StaffUser, Ticket } from '../../data/types'
import { DepartmentPill, StatusPill } from '../ui/Pill'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { relativeTime } from '../../lib/format'
import { cn } from '../../lib/cn'
import { getPrimaryAction } from '../../lib/ticketFlow'

interface TicketRowProps {
  ticket: Ticket
  department: Department
  assignee: StaffUser | null
  onOpen: (ticket: Ticket) => void
  onPrimaryAction: (ticket: Ticket) => void
}

export function TicketRow({ ticket, department, assignee, onOpen, onPrimaryAction }: TicketRowProps) {
  const resolvedAction = getPrimaryAction(ticket)

  return (
    <div
      className={cn(
        'group flex flex-col gap-3 border-b border-border px-4 py-3 transition-colors duration-150 ease-out last:border-b-0 hover:bg-page sm:flex-row sm:items-center sm:gap-4',
        ticket.isStuck && 'border-l-2 border-l-status-stuck-text',
        ticket.hasUnreadCustomerReply && 'bg-status-new-bg/40',
      )}
    >
      <button
        onClick={() => onOpen(ticket)}
        className="focus-ring flex min-w-0 flex-1 flex-col gap-2 rounded-control text-left sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="flex items-start justify-between gap-3 sm:w-28 sm:shrink-0 sm:flex-col sm:justify-start">
          <div>
            <div className="text-sm font-medium text-text-primary">{ticket.displayId}</div>
            <div
              className={cn(
                'mt-0.5 flex items-center gap-1 text-xs',
                ticket.isStuck ? 'text-status-stuck-text' : 'text-text-tertiary',
              )}
            >
              {ticket.isStuck && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
              {ticket.isStuck
                ? `${ticket.stuckSinceHours}h — needs attention`
                : relativeTime(ticket.createdAt)}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:hidden">
            <StatusPill status={ticket.status} />
            {ticket.hasUnreadCustomerReply && (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-new-bg px-2 py-0.5 text-[10px] font-medium text-status-new-text">
                <MessageSquare className="h-3 w-3" aria-hidden="true" />
                Reply
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 sm:flex-[2]">
          <div className="truncate text-base text-text-primary">{ticket.summary}</div>
          <div className="truncate text-xs text-text-tertiary">{ticket.customerName}</div>
        </div>

        <div className="hidden w-24 shrink-0 sm:block">
          <DepartmentPill name={department.name} slug={department.slug} />
        </div>

        <div className="hidden w-44 shrink-0 items-center gap-2 sm:flex">
          <StatusPill status={ticket.status} />
          {ticket.hasUnreadCustomerReply && (
            <span className="inline-flex items-center gap-1 rounded-full bg-status-new-bg px-2 py-0.5 text-[10px] font-medium text-status-new-text">
              <MessageSquare className="h-3 w-3" aria-hidden="true" />
              Reply
            </span>
          )}
          {assignee && <Avatar initials={assignee.avatarInitials} size="sm" />}
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          <DepartmentPill name={department.name} slug={department.slug} />
          {assignee && <Avatar initials={assignee.avatarInitials} size="sm" />}
        </div>
      </button>

      <div className="w-full sm:w-40 sm:shrink-0 sm:text-right">
        {resolvedAction && (
          <Button
            size="sm"
            className="w-full sm:w-auto"
            variant={ticket.isStuck ? 'danger-outline' : 'outline'}
            onClick={(e) => {
              e.stopPropagation()
              onPrimaryAction(ticket)
            }}
          >
            <resolvedAction.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {resolvedAction.label}
          </Button>
        )}
      </div>
    </div>
  )
}
