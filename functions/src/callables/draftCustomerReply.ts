import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertCanMutate, assertSameTenant, requireStaffActor } from '../helpers/auth'
import { draftCustomerReplyAi } from '../helpers/draftReply'
import type { Ticket, TicketHistoryEntry } from '../types'

const schema = z.object({
  sessionId: z.string().min(16).max(128),
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
})

export const draftCustomerReply = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  assertCanMutate(claims.role)

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid draft request.')
  }
  const { tenantId, ticketId } = parsed.data
  assertSameTenant(claims, tenantId)

  const ticketRef = db.collection('tenants').doc(tenantId).collection('tickets').doc(ticketId)
  const ticketSnap = await ticketRef.get()
  if (!ticketSnap.exists) {
    throw new HttpsError('not-found', 'Ticket not found.')
  }

  const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket
  if (claims.role === 'agent' && ticket.departmentId && ticket.departmentId !== claims.departmentId) {
    throw new HttpsError('permission-denied', 'Agents can only act on tickets in their department.')
  }

  const [userSnap, historySnap] = await Promise.all([
    db.collection('tenants').doc(tenantId).collection('users').doc(claims.uid).get(),
    ticketRef.collection('history').orderBy('timestamp', 'desc').limit(20).get(),
  ])
  const staffName = (userSnap.data()?.name as string | undefined) ?? 'Staff'
  const history = historySnap.docs.map((d) => ({ id: d.id, ...d.data() }) as TicketHistoryEntry)

  const result = await draftCustomerReplyAi({ ticket, history, staffName })
  const channel = ticket.preferredChannel === 'email' ? 'email' : 'sms'

  return {
    draftMessage: result.draftMessage,
    missingInfo: result.missingInfo,
    usedAi: result.usedAi,
    preferredChannel: channel,
    displayId: ticket.displayId,
  }
})
