import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import { assertRateLimit } from '../helpers/sms'
import type { PublicTracking, ManagerAlert } from '../types'

const schema = z.object({
  trackingToken: z.string().regex(/^[a-f0-9]{48}$/i, 'Invalid tracking token'),
})

export const reopenTicket = onCall({ cors: true }, async (request) => {
  try {
    assertRateLimit(`reopen:${request.rawRequest.ip ?? 'unknown'}`, 3, 60_000)
  } catch {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Try again shortly.')
  }

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid input')
  }
  const { trackingToken } = parsed.data

  const projectionSnap = await db.collection('publicTracking').doc(trackingToken).get()
  if (!projectionSnap.exists) {
    throw new HttpsError('not-found', 'Ticket not found.')
  }
  const projection = projectionSnap.data() as PublicTracking

  if (projection.status !== 'solved') {
    throw new HttpsError('failed-precondition', 'Only solved tickets can be reopened.')
  }

  const now = new Date().toISOString()

  // Add reopened history entry
  await appendHistory(projection.tenantId, projection.ticketId, {
    action: 'reopened',
    actor: 'Customer',
    note: 'Customer reopened this case.',
    visibleToCustomer: true,
    timestamp: now,
  })

  // Create manager alert
  const alertRef = db
    .collection('tenants')
    .doc(projection.tenantId)
    .collection('managerAlerts')
    .doc()

  const alert: Omit<ManagerAlert, 'id'> = {
    tenantId: projection.tenantId,
    ticketId: projection.ticketId,
    displayId: projection.displayId,
    type: 'customer_escalation',
    message: `Customer reopened solved case ${projection.displayId}`,
    fromName: 'Customer',
    toName: projection.assigneeName,
    hours: 0,
    createdAt: now,
    read: false,
  }

  await alertRef.set({ id: alertRef.id, ...alert })

  // Update ticket status
  await db
    .collection('tenants')
    .doc(projection.tenantId)
    .collection('tickets')
    .doc(projection.ticketId)
    .update({
      status: 'opened',
      priority: 'high',
      hasUnreadCustomerReply: true,
      updatedAt: now,
    })

  await rebuildProjection(projection.tenantId, projection.ticketId)
  return { ok: true }
})