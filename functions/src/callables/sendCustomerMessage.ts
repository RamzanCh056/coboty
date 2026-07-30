import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import { assertRateLimit } from '../helpers/sms'
import type { PublicTracking } from '../types'

const schema = z.object({
  displayId: z.string().min(3).max(32),
  message: z.string().trim().min(1).max(2000),
  customerName: z.string().trim().min(1).max(120).optional(),
})

export const sendCustomerMessage = onCall({ cors: true }, async (request) => {
  try {
    assertRateLimit(`msg:${request.rawRequest.ip ?? 'unknown'}`, 20, 60_000)
  } catch {
    throw new HttpsError('resource-exhausted', 'Too many messages. Try again shortly.')
  }

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Message is required.')
  const { displayId, message, customerName } = parsed.data

  const projectionSnap = await db.collection('publicTracking').doc(displayId).get()
  if (!projectionSnap.exists) throw new HttpsError('not-found', 'Ticket not found.')
  const projection = projectionSnap.data() as PublicTracking

  const now = new Date().toISOString()
  await appendHistory(projection.tenantId, projection.ticketId, {
    action: 'message',
    actor: customerName ?? 'Customer',
    note: message,
    visibleToCustomer: true,
    timestamp: now,
  })

  await db
    .collection('tenants')
    .doc(projection.tenantId)
    .collection('tickets')
    .doc(projection.ticketId)
    .update({ updatedAt: now })

  await rebuildProjection(projection.tenantId, projection.ticketId)
  return { ok: true }
})
