import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertCanMutate, assertSameTenant, requireStaffActor } from '../helpers/auth'
import { sendCustomerFacingReply } from '../helpers/sendCustomerFacingReply'
import type { PendingAiReply, Ticket } from '../types'

const schema = z.object({
  sessionId: z.string().min(16).max(128),
  tenantId: z.string().min(1),
  draftId: z.string().min(1),
  message: z.string().min(8).max(2000).optional(),
})

export const approvePendingAiReply = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  assertCanMutate(claims.role)

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid approve request.')
  const { tenantId, draftId, message } = parsed.data
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
  if (ticket.status === 'solved') {
    throw new HttpsError('failed-precondition', 'Cannot message a solved ticket.')
  }

  const userSnap = await db.collection('tenants').doc(tenantId).collection('users').doc(claims.uid).get()
  const actorName = (userSnap.data()?.name as string | undefined) ?? 'Staff'
  const finalMessage = (message ?? draft.draftMessage).trim()
  const now = new Date().toISOString()

  const notify = await sendCustomerFacingReply({
    ticket,
    message: finalMessage,
    actorName,
    auditNote: `AI draft approved and sent via preferred channel (confidence=${draft.confidence.toFixed(2)}).`,
    customerNextStep: draft.suggestedNextStep ?? null,
  })

  await draftRef.update({
    status: 'approved',
    updatedAt: now,
    decidedAt: now,
    decidedBy: actorName,
    finalMessage,
    sendChannel: notify.channel,
    sendStatus: notify.status,
  })

  return { ok: true, channel: notify.channel, status: notify.status }
})
