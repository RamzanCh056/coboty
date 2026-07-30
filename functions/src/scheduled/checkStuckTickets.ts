import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db } from '../helpers/admin'
import { rebuildProjection } from '../helpers/projection'
import type { Ticket } from '../types'

const STUCK_MS = 24 * 60 * 60 * 1000

export const checkStuckTickets = onSchedule('every 15 minutes', async () => {
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
      await ticketDoc.ref.collection('history').add({
        ticketId: ticket.id,
        tenantId: tenantDoc.id,
        action: 'note',
        actor: 'System',
        note: `No update in 24+ hours — flagged as stuck.`,
        visibleToCustomer: false,
        timestamp: new Date().toISOString(),
      })
      await rebuildProjection(tenantDoc.id, ticket.id)
    }
  }
})
