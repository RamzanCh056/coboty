import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import { assertRateLimit } from '../helpers/sms'
import { isTrackingToken } from '../helpers/trackingToken'
import type { PublicTracking, Ticket } from '../types'

const schema = z.object({
  trackingToken: z.string().regex(/^[a-f0-9]{48}$/i, 'Invalid tracking token'),
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
})

export const submitTicketCsat = onCall({ cors: true }, async (request) => {
  try {
    assertRateLimit(`csat:${request.rawRequest.ip ?? 'unknown'}`, 5, 60_000)
  } catch {
    throw new HttpsError('resource-exhausted', 'Too many submissions. Try again shortly.')
  }

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid CSAT payload.')
  }
  const { trackingToken, score, comment } = parsed.data

  if (!isTrackingToken(trackingToken)) {
    throw new HttpsError('invalid-argument', 'Invalid tracking token.')
  }

  const projectionSnap = await db.collection('publicTracking').doc(trackingToken).get()
  if (!projectionSnap.exists) {
    throw new HttpsError('not-found', 'Ticket not found.')
  }
  const projection = projectionSnap.data() as PublicTracking

  const ticketRef = db
    .collection('tenants')
    .doc(projection.tenantId)
    .collection('tickets')
    .doc(projection.ticketId)
  const ticketSnap = await ticketRef.get()
  if (!ticketSnap.exists) {
    throw new HttpsError('not-found', 'Ticket not found.')
  }
  const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket

  if (ticket.status !== 'solved') {
    throw new HttpsError('failed-precondition', 'CSAT is only available for solved tickets.')
  }
  if (ticket.csatScore != null) {
    throw new HttpsError('failed-precondition', 'Feedback was already submitted for this ticket.')
  }

  const now = new Date().toISOString()
  await ticketRef.update({
    csatScore: score,
    csatComment: comment?.trim() || null,
    csatAt: now,
    updatedAt: now,
  })

  await appendHistory(projection.tenantId, projection.ticketId, {
    action: 'csat',
    actor: 'Customer',
    note: comment?.trim()
      ? `Customer rated ${score}/5: ${comment.trim()}`
      : `Customer rated ${score}/5.`,
    visibleToCustomer: true,
    timestamp: now,
  })

  await rebuildProjection(projection.tenantId, projection.ticketId)
  return { ok: true, score }
})
