import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertCanMutate, assertSameTenant, requireStaffActor } from '../helpers/auth'
import { sendCustomerFacingReply } from '../helpers/sendCustomerFacingReply'
import type { Ticket } from '../types'

const schema = z.object({
  sessionId: z.string().min(16).max(128),
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
  message: z.string().min(8).max(2000),
  usedAiDraft: z.boolean().optional(),
})

export const sendStaffCustomerReply = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  assertCanMutate(claims.role)

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid send request.')
  }
  const { tenantId, ticketId, message, usedAiDraft } = parsed.data
  assertSameTenant(claims, tenantId)

  const ticketRef = db.collection('tenants').doc(tenantId).collection('tickets').doc(ticketId)
  const ticketSnap = await ticketRef.get()
  if (!ticketSnap.exists) {
    throw new HttpsError('not-found', 'Ticket not found.')
  }

  const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket
  if (ticket.status === 'solved') {
    throw new HttpsError('failed-precondition', 'Cannot message a solved ticket.')
  }
  if (claims.role === 'agent' && ticket.departmentId && ticket.departmentId !== claims.departmentId) {
    throw new HttpsError('permission-denied', 'Agents can only act on tickets in their department.')
  }

  const userSnap = await db.collection('tenants').doc(tenantId).collection('users').doc(claims.uid).get()
  const actorName = (userSnap.data()?.name as string | undefined) ?? 'Staff'

  const notify = await sendCustomerFacingReply({
    ticket,
    message: message.trim(),
    actorName,
    auditNote: usedAiDraft
      ? `AI-assisted reply approved and sent via preferred channel.`
      : `Staff reply sent via preferred channel.`,
  })

  // If a pending draft exists for this ticket, mark it approved/superseded
  if (ticket.pendingAiReplyId) {
    const draftRef = db
      .collection('tenants')
      .doc(tenantId)
      .collection('pendingAiReplies')
      .doc(ticket.pendingAiReplyId)
    const draftSnap = await draftRef.get()
    if (draftSnap.exists && draftSnap.data()?.status === 'pending') {
      await draftRef.update({
        status: 'approved',
        updatedAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        decidedBy: actorName,
        finalMessage: message.trim(),
        sendChannel: notify.channel,
        sendStatus: notify.status,
      })
    }
  }

  return {
    ok: true,
    channel: notify.channel,
    status: notify.status,
  }
})
