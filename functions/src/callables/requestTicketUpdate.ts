import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import { assertRateLimit } from '../helpers/sms'
import type { PublicTracking, ManagerAlert } from '../types'

const schema = z.object({
  trackingToken: z.string().regex(/^[a-f0-9]{48}$/i, 'Invalid tracking token'),
  message: z.string().trim().min(1).max(2000).optional(),
})

export const requestTicketUpdate = onCall({ cors: true }, async (request) => {
  try {
    assertRateLimit(`escalate:${request.rawRequest.ip ?? 'unknown'}`, 3, 60_000)
  } catch {
    throw new HttpsError('resource-exhausted', 'Too many requests. Try again shortly.')
  }

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid input')
  }
  const { trackingToken, message } = parsed.data

  const projectionSnap = await db.collection('publicTracking').doc(trackingToken).get()
  if (!projectionSnap.exists) {
    throw new HttpsError('not-found', 'Ticket not found.')
  }
  const projection = projectionSnap.data() as PublicTracking

  const now = new Date().toISOString()

  // Add escalation history entry
  await appendHistory(projection.tenantId, projection.ticketId, {
    action: 'escalated',
    actor: 'Customer',
    note: message || 'Customer requested an update on this case.',
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
    message: `Customer has requested an update on ${projection.displayId}`,
    fromName: 'Customer',
    toName: projection.assigneeName,
    hours: 0,
    createdAt: now,
    read: false,
  }

  await alertRef.set({ id: alertRef.id, ...alert })

  // Update ticket
  await db
    .collection('tenants')
    .doc(projection.tenantId)
    .collection('tickets')
    .doc(projection.ticketId)
    .update({
      updatedAt: now,
      isStuck: true,
    })

  await rebuildProjection(projection.tenantId, projection.ticketId)
  return { ok: true }
})