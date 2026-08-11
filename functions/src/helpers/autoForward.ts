import { db } from './admin'
import { appendHistory, rebuildProjection } from './projection'
import type { ManagerAlert, StaffUser, Ticket } from '../types'

export const DEFAULT_UNOPENED_SLA_HOURS = 3

export function unopenedSlaHoursFromTenant(tenant: { config?: { unopenedSlaHours?: number } }): number {
  const hours = tenant.config?.unopenedSlaHours
  if (typeof hours === 'number' && hours >= 1 && hours <= 72) return Math.round(hours)
  return DEFAULT_UNOPENED_SLA_HOURS
}

export function pickNextAssignee(
  staff: StaffUser[],
  ticket: Ticket,
  openCounts: Map<string, number>,
): StaffUser | null {
  const candidates = staff.filter((member) => {
    if (member.id === ticket.assignedTo) return false
    if (member.role === 'readonly') return false
    if (ticket.departmentId && member.departmentId && member.departmentId !== ticket.departmentId) {
      return false
    }
    return member.role === 'agent' || member.role === 'manager' || member.role === 'admin'
  })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => (openCounts.get(a.id) ?? 0) - (openCounts.get(b.id) ?? 0))
  return candidates[0] ?? null
}

export async function writeManagerAlert(
  tenantId: string,
  alert: Omit<ManagerAlert, 'id'>,
): Promise<void> {
  const ref = db.collection('tenants').doc(tenantId).collection('managerAlerts').doc()
  await ref.set({ ...alert, id: ref.id })
}

export async function autoForwardUnopenedTicket(input: {
  tenantId: string
  ticket: Ticket
  staff: StaffUser[]
  tickets: Ticket[]
  slaHours: number
}): Promise<{ forwarded: boolean; toName: string | null }> {
  const { tenantId, ticket, staff, tickets, slaHours } = input
  const openCounts = new Map<string, number>()
  for (const row of tickets) {
    if (!row.assignedTo || row.status === 'solved') continue
    openCounts.set(row.assignedTo, (openCounts.get(row.assignedTo) ?? 0) + 1)
  }

  const previous = staff.find((s) => s.id === ticket.assignedTo) ?? null
  const next = pickNextAssignee(staff, ticket, openCounts)
  const now = new Date().toISOString()
  const ticketRef = db.collection('tenants').doc(tenantId).collection('tickets').doc(ticket.id)

  if (next) {
    await ticketRef.update({
      assignedTo: next.id,
      assignedAt: now,
      status: 'assigned',
      updatedAt: now,
      isStuck: true,
      stuckSinceHours: slaHours,
    })
    await appendHistory(tenantId, ticket.id, {
      action: 'assigned',
      actor: 'System',
      note: `Not opened in ${slaHours}h. Auto-forwarded from ${previous?.name ?? 'assignee'} to ${next.name}.`,
      visibleToCustomer: true,
      timestamp: now,
      previousActor: previous?.name,
    })
  } else {
    await ticketRef.update({
      isStuck: true,
      stuckSinceHours: slaHours,
      updatedAt: now,
      lastUnopenedSlaAt: now,
    })
    await appendHistory(tenantId, ticket.id, {
      action: 'note',
      actor: 'System',
      note: `Not opened in ${slaHours}h. No other teammate available to auto-forward.`,
      visibleToCustomer: false,
      timestamp: now,
    })
  }

  await writeManagerAlert(tenantId, {
    tenantId,
    ticketId: ticket.id,
    displayId: ticket.displayId,
    type: 'unopened_sla',
    message: next
      ? `${ticket.displayId} was not opened in ${slaHours}h. Auto-forwarded from ${previous?.name ?? 'assignee'} to ${next.name}.`
      : `${ticket.displayId} was not opened in ${slaHours}h by ${previous?.name ?? 'the assignee'}. No other teammate available.`,
    fromName: previous?.name ?? 'Unknown',
    toName: next?.name ?? null,
    hours: slaHours,
    createdAt: now,
    read: false,
  })

  await rebuildProjection(tenantId, ticket.id)
  return { forwarded: Boolean(next), toName: next?.name ?? null }
}
