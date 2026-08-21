import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import { assertRateLimit } from '../helpers/sms'
import type { PublicTracking, ManagerAlert } from '../types'

const schema = z.object({
  trackingToken: z.string().regex(/^[a-f0-9]{48}$/i, 'Invalid tracking token'),
  confirm: z.boolean(),
})

export const confirmTicketResolution = onCall({ cors: true }, async (request) => {
  try {
    assertRateLimit(`confirm:${request.rawRequest.ip ?? 'unknown'}`, 5, 60_000)
  } catch {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Try again shortly.')
  }

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid input')
  }
  const { trackingToken, confirm } = parsed.data

  const projectionSnap = await db.collection('publicTracking').doc(trackingToken).get()
  if (!projectionSnap.exists) {
    throw new HttpsError('not-found', 'Ticket not found.')
  }
  const projection = projectionSnap.data() as PublicTracking

  if (projection.status !== 'awaiting_confirmation') {
    throw new HttpsError('failed-precondition', 'Ticket is not awaiting confirmation.')
  }

  const now = new Date().toISOString()

  if (confirm) {
    // Customer confirmed resolution
    await appendHistory(projection.tenantId, projection.ticketId, {
      action: 'confirmed_closed',
      actor: 'Customer',
      note: 'Customer confirmed the case is resolved.',
      visibleToCustomer: true,
      timestamp: now,
    })

    await db
      .collection('tenants')
      .doc(projection.tenantId)
      .collection('tickets')
      .doc(projection.ticketId)
      .update({
        status: 'solved',
        updatedAt: now,
      })
  } else {
    // Customer rejected resolution
    await appendHistory(projection.tenantId, projection.ticketId, {
      action: 'resolution_rejected',
      actor: 'Customer',
      note: 'Customer indicated the case is not resolved and needs more attention.',
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
      type: 'resolution_rejected',
      message: `Customer rejected resolution for ${projection.displayId}`,
      fromName: 'Customer',
      toName: projection.assigneeName,
      hours: 0,
      createdAt: now,
      read: false,
    }

    await alertRef.set({ id: alertRef.id, ...alert })

    await db
      .collection('tenants')
      .doc(projection.tenantId)
      .collection('tickets')
      .doc(projection.ticketId)
      .update({
        status: 'opened', // or 'calling' depending on previous state
        priority: 'high',
        hasUnreadCustomerReply: true,
        updatedAt: now,
      })
  }

  await rebuildProjection(projection.tenantId, projection.ticketId)
  return { ok: true }
})