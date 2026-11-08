import { db } from './admin'
import { draftCustomerReplyAi, isLowRiskAutoSendCandidate } from './draftReply'
import { appendHistory } from './projection'
import { sendCustomerFacingReply } from './sendCustomerFacingReply'
import type { PendingAiReply, Tenant, Ticket, TicketHistoryEntry } from '../types'

export async function createPendingAiReplyForTicket(input: {
  tenantId: string
  ticketId: string
  sourceCustomerMessage: string
}): Promise<{ draftId: string; status: PendingAiReply['status']; autoSent: boolean }> {
  const tenantSnap = await db.collection('tenants').doc(input.tenantId).get()
  const ticketRef = db.collection('tenants').doc(input.tenantId).collection('tickets').doc(input.ticketId)
  const ticketSnap = await ticketRef.get()
  if (!ticketSnap.exists) {
    return { draftId: '', status: 'dismissed', autoSent: false }
  }

  const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket
  if (ticket.status === 'solved') {
    return { draftId: '', status: 'dismissed', autoSent: false }
  }

  const historySnap = await ticketRef.collection('history').orderBy('timestamp', 'desc').limit(20).get()
  const history = historySnap.docs.map((d) => ({ id: d.id, ...d.data() }) as TicketHistoryEntry)
  const tenant = tenantSnap.exists
    ? ({ id: tenantSnap.id, ...tenantSnap.data() } as Tenant)
    : null

  const draft = await draftCustomerReplyAi({
    ticket,
    history,
    staffName: 'Support',
    triggerMessage: input.sourceCustomerMessage,
  })

  const now = new Date().toISOString()
  const pendingCol = db.collection('tenants').doc(input.tenantId).collection('pendingAiReplies')

  // Supersede any open drafts for this ticket (avoid composite index requirement)
  const existing = await pendingCol.where('ticketId', '==', input.ticketId).limit(10).get()
  const batch = db.batch()
  for (const doc of existing.docs) {
    if (doc.data().status === 'pending') {
      batch.update(doc.ref, { status: 'superseded', updatedAt: now })
    }
  }

  const ref = pendingCol.doc()
  const channel = ticket.preferredChannel === 'email' ? 'email' : 'sms'
  const pending: PendingAiReply = {
    id: ref.id,
    tenantId: input.tenantId,
    ticketId: input.ticketId,
    displayId: ticket.displayId,
    departmentId: ticket.departmentId ?? null,
    status: 'pending',
    draftMessage: draft.draftMessage,
    missingInfo: draft.missingInfo,
    confidence: draft.confidence,
    usedAi: draft.usedAi,
    riskFlags: draft.riskFlags,
    suggestedNextStep: draft.suggestedNextStep,
    sourceCustomerMessage: input.sourceCustomerMessage,
    preferredChannel: channel,
    createdAt: now,
    updatedAt: now,
  }
  batch.set(ref, pending)
  batch.update(ticketRef, {
    pendingAiReplyId: ref.id,
    pendingAiReplyStatus: 'pending',
    pendingAiReplyConfidence: draft.confidence,
    pendingAiReplyPreview: draft.draftMessage.slice(0, 140),
    updatedAt: now,
  })
  await batch.commit()

  await appendHistory(input.tenantId, input.ticketId, {
    action: 'note',
    actor: 'CoBotty AI',
    note: `AI draft created (confidence=${draft.confidence.toFixed(2)}, usedAi=${draft.usedAi}).`,
    visibleToCustomer: false,
    timestamp: now,
  })

  const minConfidence = tenant?.config?.aiAutoSendMinConfidence ?? 0.85
  const autoEnabled = Boolean(tenant?.config?.aiAutoSendEnabled)
  const canAuto =
    autoEnabled &&
    draft.confidence >= minConfidence &&
    isLowRiskAutoSendCandidate(draft)

  if (!canAuto) {
    return { draftId: ref.id, status: 'pending', autoSent: false }
  }

  // Low-risk auto-send
  const freshTicketSnap = await ticketRef.get()
  const freshTicket = { id: freshTicketSnap.id, ...freshTicketSnap.data() } as Ticket
  const notify = await sendCustomerFacingReply({
    ticket: freshTicket,
    message: draft.draftMessage,
    actorName: 'CoBotty AI',
    auditNote: `AI auto-sent reply (confidence=${draft.confidence.toFixed(2)}) via preferred channel.`,
    customerNextStep: draft.suggestedNextStep,
  })

  await ref.update({
    status: 'auto_sent',
    updatedAt: new Date().toISOString(),
    decidedAt: new Date().toISOString(),
    decidedBy: 'system',
    finalMessage: draft.draftMessage,
    sendChannel: notify.channel,
    sendStatus: notify.status,
  })

  return { draftId: ref.id, status: 'auto_sent', autoSent: true }
}
