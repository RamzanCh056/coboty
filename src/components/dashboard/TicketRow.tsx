import { AlertTriangle } from 'lucide-react'
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
        'group flex items-center gap-4 border-b border-border px-4 py-3 transition-colors duration-150 ease-out last:border-b-0 hover:bg-page',
        ticket.isStuck && 'border-l-2 border-l-status-stuck-text',
      )}
    >
      <button
        onClick={() => onOpen(ticket)}
        className="focus-ring flex min-w-0 flex-1 items-center gap-4 rounded-control text-left"
      >
        <div className="w-24 shrink-0">
          <div className="text-sm font-medium text-text-primary">{ticket.displayId}</div>
          <div
            className={cn(
              'flex items-center gap-1 text-xs',
              ticket.isStuck ? 'text-status-stuck-text' : 'text-text-tertiary',
            )}
          >
            {ticket.isStuck && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
            {ticket.isStuck ? `${ticket.stuckSinceHours}h — stuck` : relativeTime(ticket.createdAt)}
          </div>
        </div>

        <div className="min-w-0 flex-[2]">
          <div className="truncate text-base text-text-primary">{ticket.summary}</div>
          <div className="truncate text-xs text-text-tertiary">{ticket.customerName}</div>
        </div>

        <div className="w-24 shrink-0">
          <DepartmentPill name={department.name} slug={department.slug} />
        </div>

        <div className="flex w-40 shrink-0 items-center gap-2">
          <StatusPill status={ticket.status} />
          {assignee && <Avatar initials={assignee.avatarInitials} size="sm" />}
        </div>
      </button>

      <div className="w-32 shrink-0 text-right">
        {resolvedAction && (
          <Button
            size="sm"
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
