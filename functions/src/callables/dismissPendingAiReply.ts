import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertCanMutate, assertSameTenant, requireStaffActor } from '../helpers/auth'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import type { PendingAiReply, Ticket } from '../types'

const schema = z.object({
  sessionId: z.string().min(16).max(128),
  tenantId: z.string().min(1),
  draftId: z.string().min(1),
})

export const dismissPendingAiReply = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  assertCanMutate(claims.role)

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid dismiss request.')
  const { tenantId, draftId } = parsed.data
  assertSameTenant(claims, tenantId)

  const draftRef = db.collection('tenants').doc(tenantId).collection('pendingAiReplies').doc(draftId)
  const draftSnap = await draftRef.get()
  if (!draftSnap.exists) throw new HttpsError('not-found', 'Draft not found.')
  const draft = { id: draftSnap.id, ...draftSnap.data() } as PendingAiReply
  if (draft.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'This draft is no longer pending.')
  }

  const ticketRef = db.collection('tenants').doc(tenantId).collection('tickets').doc(draft.ticketId)
  const ticketSnap = await ticketRef.get()
  if (!ticketSnap.exists) throw new HttpsError('not-found', 'Ticket not found.')
  const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket

  if (claims.role === 'agent' && ticket.departmentId && ticket.departmentId !== claims.departmentId) {
    throw new HttpsError('permission-denied', 'Agents can only act on tickets in their department.')
  }

  const userSnap = await db.collection('tenants').doc(tenantId).collection('users').doc(claims.uid).get()
  const actorName = (userSnap.data()?.name as string | undefined) ?? 'Staff'
  const now = new Date().toISOString()

  await draftRef.update({
    status: 'dismissed',
    updatedAt: now,
    decidedAt: now,
    decidedBy: actorName,
  })

  await ticketRef.update({
    pendingAiReplyId: null,
    pendingAiReplyStatus: null,
    pendingAiReplyConfidence: null,
    pendingAiReplyPreview: null,
    updatedAt: now,
  })

  await appendHistory(tenantId, draft.ticketId, {
    action: 'note',
    actor: actorName,
    note: 'AI draft dismissed by staff.',
    visibleToCustomer: false,
    timestamp: now,
  })

  await rebuildProjection(tenantId, draft.ticketId)
  return { ok: true }
})
