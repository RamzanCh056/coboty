import { UserPlus, PhoneCall, Check, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { catalogDepartment, catalogStaffForTenant } from '../data/catalog'
import type { Ticket, TicketStatus } from '../data/types'

export const nextStatusMap: Record<TicketStatus, TicketStatus | null> = {
  new: 'assigned',
  assigned: 'opened',
  opened: 'calling',
  calling: 'awaiting_confirmation',
  awaiting_confirmation: 'solved',
  solved: null,
}

export interface TicketAction {
  label: string
  icon: LucideIcon
  kind: 'workflow' | 'takeover'
}

export function isActiveAttention(ticket: Ticket): boolean {
  return Boolean(ticket.isStuck) && ticket.status !== 'solved' && ticket.status !== 'awaiting_confirmation'
}

function workflowAction(ticket: Ticket): TicketAction | null {
  switch (ticket.status) {
    case 'new':
      return { label: 'Assign to me', icon: UserPlus, kind: 'workflow' }
    case 'assigned':
    case 'opened':
      return { label: 'Contact customer', icon: PhoneCall, kind: 'workflow' }
    case 'calling':
      return { label: 'Mark resolved', icon: Check, kind: 'workflow' }
    case 'awaiting_confirmation':
    case 'solved':
      return null
  }
}

export function getPrimaryAction(
  ticket: Ticket,
  currentUserId?: string | null,
): TicketAction | null {
  if (ticket.status === 'solved' || ticket.status === 'awaiting_confirmation') {
    return null
  }

  const mine = Boolean(currentUserId && ticket.assignedTo === currentUserId)
  const stuck = isActiveAttention(ticket)

  // Stuck cases owned by someone else → take over
  if (stuck && ticket.assignedTo && !mine) {
    return { label: 'Take over', icon: ArrowUpRight, kind: 'takeover' }
  }

  // Otherwise advance the case (even if stuck and mine)
  return workflowAction(ticket)
}

export function expectedTiming(status: TicketStatus): string | null {
  switch (status) {
    case 'new':
      return 'Usually assigned within an hour'
    case 'assigned':
    case 'opened':
      return 'Typically updated today'
    case 'calling':
      return 'Today, before 17:00'
    case 'awaiting_confirmation':
      return 'Waiting for your confirmation'
    case 'solved':
      return null
  }
}

export function pickAutoAssignee(ticket: Ticket) {
  const tenantStaff = catalogStaffForTenant(ticket.tenantId)
  const dept = catalogDepartment(ticket.departmentId)
  if (!dept) return tenantStaff[0] ?? null
  return (
    tenantStaff.find((s) => s.departmentId === dept.id || s.team === dept.name) ??
    tenantStaff[0] ??
    null
  )
}

export function isTrackingToken(value: string): boolean {
  return /^[a-f0-9]{48}$/i.test(value)
}
