import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import type { Ticket } from '../types'

const claimSchema = z.object({
  displayId: z.string().trim().min(3).max(32),
  customerPhone: z.string().trim().min(10).max(32),
})

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').slice(-10)
}

export const claimTicket = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  if (request.auth.token.role) {
    throw new HttpsError('permission-denied', 'Staff accounts cannot claim customer tickets.')
  }

  const parsed = claimSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid input')
  }

  const { displayId, customerPhone } = parsed.data
  const tracking = await db.collection('publicTracking').doc(displayId).get()
  if (!tracking.exists) {
    throw new HttpsError('not-found', 'Ticket not found.')
  }

  const trackingData = tracking.data()!
  const tenantId = trackingData.tenantId as string
  const ticketId = trackingData.ticketId as string
  const ticketRef = db.collection('tenants').doc(tenantId).collection('tickets').doc(ticketId)
  const ticketSnap = await ticketRef.get()
  if (!ticketSnap.exists) {
    throw new HttpsError('not-found', 'Ticket not found.')
  }

  const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket
  if (ticket.customerUid && ticket.customerUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'This ticket is already linked to another account.')
  }

  if (normalizePhone(ticket.customerPhone) !== normalizePhone(customerPhone)) {
    throw new HttpsError('permission-denied', 'Phone number does not match this ticket.')
  }

  const email = request.auth.token.email ?? null
  await ticketRef.update({
    customerUid: request.auth.uid,
    customerEmail: email,
    updatedAt: new Date().toISOString(),
  })

  return {
    ok: true,
    displayId: ticket.displayId,
    tenantSlug: (trackingData.tenantSlug as string) ?? 'fenwick',
  }
})
