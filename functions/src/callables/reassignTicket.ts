import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import {
  assertCanMutate,
  assertManagerOrAdmin,
  assertSameTenant,
  requireStaffActor,
} from '../helpers/auth'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import { sendCustomerSms } from '../helpers/sms'
import { assignedSms } from '../helpers/templates'
import type { Ticket } from '../types'

const schema = z.object({
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
  assigneeId: z.string().min(1),
  sessionId: z.string().min(16).max(128).optional(),
})

export const reassignTicket = onCall(
  {
    cors: true,
  },
  async (request) => {
    const claims = await requireStaffActor(request)
    assertCanMutate(claims.role)
    assertManagerOrAdmin(claims.role)
    const parsed = schema.safeParse(request.data)
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid reassignment payload.')
    const { tenantId, ticketId, assigneeId } = parsed.data
    assertSameTenant(claims, tenantId)

    const ticketRef = db.collection('tenants').doc(tenantId).collection('tickets').doc(ticketId)
    const ticketSnap = await ticketRef.get()
    if (!ticketSnap.exists) throw new HttpsError('not-found', 'Ticket not found.')
    const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket
    if (ticket.status === 'solved') {
      throw new HttpsError('failed-precondition', 'Cannot reassign a solved ticket.')
    }

    const assigneeSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('users')
      .doc(assigneeId)
      .get()
    if (!assigneeSnap.exists) throw new HttpsError('not-found', 'Assignee not found in this tenant.')
    const assigneeName = (assigneeSnap.data()?.name as string | undefined) ?? 'Teammate'
    const assigneeFirst = assigneeName.split(' ')[0] ?? 'Teammate'

    const actorSnap = await db.collection('tenants').doc(tenantId).collection('users').doc(claims.uid).get()
    const actorName = (actorSnap.data()?.name as string | undefined) ?? 'Manager'

    const now = new Date().toISOString()
    const nextStatus = ticket.status === 'new' ? 'assigned' : ticket.status

    await ticketRef.update({
      assignedTo: assigneeId,
      status: nextStatus,
      updatedAt: now,
      isStuck: false,
      stuckSinceHours: null,
    })

    await appendHistory(tenantId, ticketId, {
      action: 'assigned',
      actor: actorName,
      note: `Reassigned to ${assigneeName} by manager ${actorName}.`,
      visibleToCustomer: true,
      timestamp: now,
    })

    await sendCustomerSms({
      tenantId,
      ticketId,
      toPhone: ticket.customerPhone,
      message: assignedSms(ticket.customerName.split(' ')[0] ?? 'there', ticket.displayId, assigneeFirst),
    })

    await rebuildProjection(tenantId, ticketId)
    return { ok: true, assignedTo: assigneeId, status: nextStatus }
  },
)
