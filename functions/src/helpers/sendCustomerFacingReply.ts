import { notifyCustomer } from './email'
import { appendHistory, rebuildProjection } from './projection'
import { db } from './admin'
import type { Ticket } from '../types'

/** Shared outbound staff→customer send. Never changes ticket status / never marks solved. */
export async function sendCustomerFacingReply(input: {
  ticket: Ticket
  message: string
  actorName: string
  auditNote: string
  customerNextStep?: string | null
}): Promise<{ channel: 'sms' | 'email'; status: 'sent' | 'skipped' | 'failed' }> {
  const trimmed = input.message.trim()
  const now = new Date().toISOString()
  const ticketRef = db
    .collection('tenants')
    .doc(input.ticket.tenantId)
    .collection('tickets')
    .doc(input.ticket.id)

  const notify = await notifyCustomer({
    ticket: input.ticket,
    message: trimmed,
    emailSubject: `Update on ${input.ticket.displayId}`,
  })

  await appendHistory(input.ticket.tenantId, input.ticket.id, {
    action: 'message',
    actor: input.actorName,
    note: trimmed,
    visibleToCustomer: true,
    timestamp: now,
  })

  await appendHistory(input.ticket.tenantId, input.ticket.id, {
    action: 'note',
    actor: input.actorName,
    note: input.auditNote,
    visibleToCustomer: false,
    timestamp: now,
  })

  const update: Record<string, unknown> = {
    updatedAt: now,
    waitingForCustomer: true,
    hasUnreadCustomerReply: false,
    pendingAiReplyId: null,
    pendingAiReplyStatus: null,
    pendingAiReplyConfidence: null,
    pendingAiReplyPreview: null,
  }
  if (input.customerNextStep) {
    update.customerNextStep = input.customerNextStep
  }

  await ticketRef.update(update)
  await rebuildProjection(input.ticket.tenantId, input.ticket.id)

  return { channel: notify.channel, status: notify.status }
}
