import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertCanMutate, assertSameTenant, requireStaffActor } from '../helpers/auth'
import { notifyCustomer } from '../helpers/email'
import { rebuildProjection, appendHistory } from '../helpers/projection'
import { canTransition } from '../helpers/status'
import { assignedSms, callingSms } from '../helpers/templates'
import type { Ticket } from '../types'

const schema = z.object({
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
  sessionId: z.string().min(16).max(128).optional(),
  /** Optional next action intent inferred from current primary button. */
  action: z.enum(['assign_to_me', 'will_call', 'mark_solved', 'mark_opened']).optional(),
  resolutionEvidence: z.string().trim().min(20).max(2000).optional(),
})

export const assignTicket = onCall(
  {
    cors: true,
  },
  async (request) => {
    const claims = await requireStaffActor(request)
    assertCanMutate(claims.role)
    const parsed = schema.safeParse(request.data)
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid ticket action payload.')
    const { tenantId, ticketId, action, resolutionEvidence } = parsed.data
    assertSameTenant(claims, tenantId)

    const ticketRef = db.collection('tenants').doc(tenantId).collection('tickets').doc(ticketId)
    const ticketSnap = await ticketRef.get()
    if (!ticketSnap.exists) throw new HttpsError('not-found', 'Ticket not found.')
    const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket

    if (claims.role === 'agent' && ticket.departmentId && ticket.departmentId !== claims.departmentId) {
      throw new HttpsError('permission-denied', 'Agents can only act on tickets in their department.')
    }

    const userSnap = await db.collection('tenants').doc(tenantId).collection('users').doc(claims.uid).get()
    const actorName = (userSnap.data()?.name as string | undefined) ?? 'Staff'
    const actorFirst = actorName.split(' ')[0] ?? 'Staff'
    const customerFirst = ticket.customerName.split(' ')[0] ?? 'there'
    const now = new Date().toISOString()

    let nextStatus = ticket.status
    let assignedTo = ticket.assignedTo
    let historyAction: 'assigned' | 'opened' | 'calling' | 'solved' | 'awaiting_confirmation' = 'assigned'
    let note = ''
    let sms: string | null = null

    const intent =
      action ??
      (ticket.status === 'new'
        ? 'assign_to_me'
        : ticket.status === 'assigned'
          ? 'mark_opened'
          : ticket.status === 'opened'
            ? 'will_call'
            : ticket.status === 'calling'
              ? 'mark_solved'
              : null)

    if (!intent) throw new HttpsError('failed-precondition', 'No further action available.')

    if (intent === 'assign_to_me') {
      if (ticket.status !== 'new' && ticket.assignedTo && ticket.assignedTo !== claims.uid) {
        throw new HttpsError('failed-precondition', 'Ticket is already assigned. Use takeover or reassign.')
      }
      if (!canTransition(ticket.status, 'assigned') && ticket.status !== 'assigned') {
        throw new HttpsError('failed-precondition', `Cannot assign from status ${ticket.status}.`)
      }
      nextStatus = 'assigned'
      assignedTo = claims.uid
      historyAction = 'assigned'
      note = `Self-assigned by ${actorName}.`
      sms = assignedSms(customerFirst, ticket.displayId, actorFirst)
    } else if (intent === 'mark_opened') {
      if (ticket.assignedTo !== claims.uid && claims.role === 'agent') {
        throw new HttpsError('permission-denied', 'Only the assignee can open this ticket.')
      }
      if (!canTransition(ticket.status, 'opened') && ticket.status !== 'opened') {
        throw new HttpsError('failed-precondition', `Cannot open from status ${ticket.status}.`)
      }
      nextStatus = 'opened'
      historyAction = 'opened'
      note = `${actorName} opened the case.`
    } else if (intent === 'will_call') {
      if (ticket.status !== 'assigned' && ticket.status !== 'opened') {
        throw new HttpsError('failed-precondition', `Cannot mark calling from status ${ticket.status}.`)
      }
      nextStatus = 'calling'
      historyAction = 'calling'
      note = `Contacting customer — ${actorName}.`
      sms = callingSms(customerFirst, ticket.displayId, actorFirst)
    } else if (intent === 'mark_solved') {
      if (!resolutionEvidence || resolutionEvidence.trim().length < 20) {
        throw new HttpsError(
          'invalid-argument',
          'Resolution evidence is required (at least 20 characters).',
        )
      }
      if (!canTransition(ticket.status, 'awaiting_confirmation')) {
        throw new HttpsError('failed-precondition', `Cannot resolve from status ${ticket.status}.`)
      }
      nextStatus = 'awaiting_confirmation'
      historyAction = 'awaiting_confirmation'
      note = `Marked resolved — waiting for customer confirmation. ${resolutionEvidence.trim()}`
      sms = `Hi ${customerFirst}, we believe your case ${ticket.displayId} is resolved. Please confirm on your tracking page or let us know if you need more help.`
    }

    const patch: Record<string, unknown> = {
      status: nextStatus,
      assignedTo,
      updatedAt: now,
      isStuck: false,
      stuckSinceHours: null,
    }
    if (intent === 'assign_to_me') {
      patch.assignedAt = now
    }
    if (intent === 'mark_solved' && resolutionEvidence) {
      patch.resolutionEvidence = resolutionEvidence.trim()
    }
    await ticketRef.update(patch)

    await appendHistory(tenantId, ticketId, {
      action: historyAction,
      actor: actorName,
      note,
      visibleToCustomer: true,
      timestamp: now,
    })

    if (sms) {
      const notifyTicket = { ...ticket, ...patch } as Ticket
      await notifyCustomer({
        ticket: notifyTicket,
        message: sms,
      })
    }

    await rebuildProjection(tenantId, ticketId)
    return { ok: true, status: nextStatus, assignedTo }
  },
)
