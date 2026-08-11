import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall } from 'firebase-functions/v2/https'
import { db } from '../helpers/admin'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import {
  autoForwardUnopenedTicket,
  unopenedSlaHoursFromTenant,
} from '../helpers/autoForward'
import { assertManagerOrAdmin, requireStaffActor } from '../helpers/auth'
import type { StaffUser, Tenant, Ticket } from '../types'

const STUCK_MS = 24 * 60 * 60 * 1000

async function processTenantSla(tenantId: string) {
  const tenantSnap = await db.collection('tenants').doc(tenantId).get()
  if (!tenantSnap.exists) return { forwarded: 0, warned: 0 }
  const tenant = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant
  const slaHours = unopenedSlaHoursFromTenant(tenant)
  const cutoffMs = Date.now() - slaHours * 60 * 60 * 1000

  const [usersSnap, ticketsSnap] = await Promise.all([
    db.collection('tenants').doc(tenantId).collection('users').get(),
    db.collection('tenants').doc(tenantId).collection('tickets').get(),
  ])
  const staff = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as StaffUser)
  const tickets = ticketsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Ticket)

  let forwarded = 0
  let warned = 0

  for (const ticket of tickets) {
    if (ticket.status !== 'assigned' || !ticket.assignedTo) continue
    const assignedAt = ticket.assignedAt || ticket.updatedAt
    if (new Date(assignedAt).getTime() > cutoffMs) continue
    if (
      ticket.lastUnopenedSlaAt &&
      new Date(ticket.lastUnopenedSlaAt).getTime() >= new Date(assignedAt).getTime()
    ) {
      continue
    }

    const result = await autoForwardUnopenedTicket({
      tenantId,
      ticket,
      staff,
      tickets,
      slaHours,
    })
    warned += 1
    if (result.forwarded) forwarded += 1
    if (result.toName) {
      ticket.assignedTo = staff.find((s) => s.name === result.toName)?.id ?? ticket.assignedTo
    }
  }

  return { forwarded, warned, slaHours }
}

async function flagLongStuckTickets() {
  const cutoff = new Date(Date.now() - STUCK_MS).toISOString()
  const tenants = await db.collection('tenants').get()

  for (const tenantDoc of tenants.docs) {
    const ticketsSnap = await db
      .collection('tenants')
      .doc(tenantDoc.id)
      .collection('tickets')
      .where('status', 'in', ['assigned', 'opened', 'calling'])
      .where('updatedAt', '<', cutoff)
      .get()

    for (const ticketDoc of ticketsSnap.docs) {
      const ticket = { id: ticketDoc.id, ...ticketDoc.data() } as Ticket
      if (ticket.isStuck) continue

      const hours = Math.round((Date.now() - new Date(ticket.updatedAt).getTime()) / 3_600_000)
      await ticketDoc.ref.update({
        isStuck: true,
        stuckSinceHours: hours,
      })
      await appendHistory(tenantDoc.id, ticket.id, {
        action: 'note',
        actor: 'System',
        note: `No update in 24+ hours — flagged as stuck.`,
        visibleToCustomer: false,
        timestamp: new Date().toISOString(),
      })
      await rebuildProjection(tenantDoc.id, ticket.id)
    }
  }
}

export async function runUnopenedSlaForAllTenants() {
  const tenants = await db.collection('tenants').get()
  let forwarded = 0
  let warned = 0
  for (const tenantDoc of tenants.docs) {
    const result = await processTenantSla(tenantDoc.id)
    forwarded += result.forwarded
    warned += result.warned
  }
  return { forwarded, warned }
}

export const checkStuckTickets = onSchedule('every 5 minutes', async () => {
  await runUnopenedSlaForAllTenants()
  await flagLongStuckTickets()
})

export const runUnopenedSlaCheck = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  assertManagerOrAdmin(claims.role)
  const result = await processTenantSla(claims.tenantId)
  return { ok: true, ...result }
})
