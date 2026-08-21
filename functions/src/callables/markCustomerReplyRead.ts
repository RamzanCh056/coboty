import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertSameTenant, requireStaffActor } from '../helpers/auth'
import { rebuildProjection } from '../helpers/projection'
import type { Ticket } from '../types'

const schema = z.object({
  sessionId: z.string().min(16).max(128),
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
})

export const markCustomerReplyRead = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  
  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid request.')
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

  await ticketRef.update({
    hasUnreadCustomerReply: false,
    updatedAt: new Date().toISOString(),
  })

  await rebuildProjection(tenantId, ticketId)
  return { ok: true }
})