import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertCanMutate, assertSameTenant, requireStaffActor } from '../helpers/auth'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import type { Ticket } from '../types'

const schema = z.object({
  sessionId: z.string().min(16).max(128),
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
  waitingForCustomer: z.boolean().optional(),
  waitingForInternal: z.boolean().optional(),
  customerNextStep: z.string().max(500).optional(),
  promisedResponseAt: z.string().optional(),
})

export const updateTicketOps = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  assertCanMutate(claims.role)
  
  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid update data.')
  }
  const { tenantId, ticketId, waitingForCustomer, waitingForInternal, customerNextStep, promisedResponseAt } = parsed.data
  
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

  const userSnap = await db.collection('tenants').doc(tenantId).collection('users').doc(claims.uid).get()
  const actorName = (userSnap.data()?.name as string | undefined) ?? 'Staff'

  const now = new Date().toISOString()
  const updateFields: Record<string, any> = { updatedAt: now }

  if (waitingForCustomer !== undefined) updateFields.waitingForCustomer = waitingForCustomer
  if (waitingForInternal !== undefined) updateFields.waitingForInternal = waitingForInternal
  if (customerNextStep !== undefined) updateFields.customerNextStep = customerNextStep || null
  if (promisedResponseAt !== undefined) updateFields.promisedResponseAt = promisedResponseAt || null

  await ticketRef.update(updateFields)

  // Add ops update history if customer next step is set
  if (customerNextStep) {
    await appendHistory(tenantId, ticketId, {
      action: 'ops_update',
      actor: actorName,
      note: `Next step: ${customerNextStep}`,
      visibleToCustomer: true,
      timestamp: now,
    })
  } else {
    // Internal ops update
    await appendHistory(tenantId, ticketId, {
      action: 'ops_update',
      actor: actorName,
      note: 'Updated ticket operations status.',
      visibleToCustomer: false,
      timestamp: now,
    })
  }

  await rebuildProjection(tenantId, ticketId)
  return { ok: true }
})