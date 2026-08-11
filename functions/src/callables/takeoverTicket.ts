import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertCanMutate, assertSameTenant, requireStaffActor } from '../helpers/auth'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import { sendCustomerSms } from '../helpers/sms'
import {
  takeoverHistoryNote,
  takeoverSmsPreview,
} from '../helpers/templates'
import { TAKEOVER_REASONS, type Ticket, type TakeoverReason } from '../types'

const schema = z.object({
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
  sessionId: z.string().min(16).max(128).optional(),
  reason: z.enum(TAKEOVER_REASONS as [TakeoverReason, ...TakeoverReason[]]),
  note: z.string().max(2000).optional(),
})

export const takeoverTicket = onCall(
  {
    cors: true,
  },
  async (request) => {
    const claims = await requireStaffActor(request)
    assertCanMutate(claims.role)
    const parsed = schema.safeParse(request.data)
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Takeover requires a valid reason.')
    const { tenantId, ticketId, reason, note } = parsed.data
    assertSameTenant(claims, tenantId)

    const ticketRef = db.collection('tenants').doc(tenantId).collection('tickets').doc(ticketId)
    const ticketSnap = await ticketRef.get()
    if (!ticketSnap.exists) throw new HttpsError('not-found', 'Ticket not found.')
    const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket

    if (claims.role === 'agent' && ticket.departmentId && ticket.departmentId !== claims.departmentId) {
      throw new HttpsError('permission-denied', 'Agents can only take over tickets in their department.')
    }

    const actorSnap = await db.collection('tenants').doc(tenantId).collection('users').doc(claims.uid).get()
    const actorName = (actorSnap.data()?.name as string | undefined) ?? 'Staff'
    const actorFirst = actorName.split(' ')[0] ?? 'Staff'

    let previousName: string | null = null
    if (ticket.assignedTo) {
      const prevSnap = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('users')
        .doc(ticket.assignedTo)
        .get()
      previousName = (prevSnap.data()?.name as string | undefined) ?? null
    }

    const now = new Date().toISOString()
    const nextStatus = ticket.status === 'new' ? 'assigned' : ticket.status

    await ticketRef.update({
      assignedTo: claims.uid,
      assignedAt: now,
      status: nextStatus,
      updatedAt: now,
      isStuck: false,
      stuckSinceHours: null,
    })

    const historyNote = takeoverHistoryNote(actorName, previousName, reason)
    await appendHistory(tenantId, ticketId, {
      action: 'takeover',
      actor: actorName,
      note: historyNote,
      visibleToCustomer: true,
      timestamp: now,
      previousActor: previousName ?? undefined,
      reason,
    })

    if (note?.trim()) {
      await appendHistory(tenantId, ticketId, {
        action: 'note',
        actor: actorName,
        note: note.trim(),
        visibleToCustomer: false,
        timestamp: now,
      })
    }

    const sms = takeoverSmsPreview({
      customerFirstName: ticket.customerName.split(' ')[0] ?? 'there',
      displayId: ticket.displayId,
      actorFirstName: actorFirst,
      previousFirstName: previousName?.split(' ')[0] ?? null,
      reason,
    })
    await sendCustomerSms({
      tenantId,
      ticketId,
      toPhone: ticket.customerPhone,
      message: sms,
    })

    await rebuildProjection(tenantId, ticketId)
    return { ok: true, smsPreview: sms, status: nextStatus }
  },
)
