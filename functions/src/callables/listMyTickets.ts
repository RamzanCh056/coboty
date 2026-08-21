import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { db } from '../helpers/admin'
import { ensureTicketTrackingToken } from '../helpers/trackingToken'
import type { Ticket } from '../types'

export const listMyTickets = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  if (request.auth.token.role) {
    throw new HttpsError('permission-denied', 'Staff accounts use the dashboard, not My tickets.')
  }

  const uid = request.auth.uid
  const snap = await db
    .collectionGroup('tickets')
    .where('customerUid', '==', uid)
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get()

  const tenantCache = new Map<string, { subdomain: string; name: string }>()

  const tickets = []
  for (const doc of snap.docs) {
    const ticket = { id: doc.id, ...doc.data() } as Ticket
    let tenant = tenantCache.get(ticket.tenantId)
    if (!tenant) {
      const tenantSnap = await db.collection('tenants').doc(ticket.tenantId).get()
      const data = tenantSnap.data()
      tenant = {
        subdomain: (data?.subdomain as string) ?? 'fenwick',
        name: (data?.name as string) ?? 'Company',
      }
      tenantCache.set(ticket.tenantId, tenant)
    }
    const trackingToken = await ensureTicketTrackingToken(ticket)
    tickets.push({
      ticketId: ticket.id,
      tenantId: ticket.tenantId,
      tenantSlug: tenant.subdomain,
      tenantName: tenant.name,
      displayId: ticket.displayId,
      trackingToken,
      status: ticket.status,
      summary: ticket.summary,
      updatedAt: ticket.updatedAt,
      createdAt: ticket.createdAt,
      isStuck: ticket.isStuck,
    })
  }

  return { tickets }
})
