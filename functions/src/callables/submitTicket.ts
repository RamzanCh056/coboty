import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertRateLimit } from '../helpers/sms'
import { generateDisplayNumber } from '../helpers/status'
import { generateTrackingToken } from '../helpers/trackingToken'
import type { Tenant, Ticket } from '../types'

const submitSchema = z.object({
  tenantSlug: z.string().min(1).max(64),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(10).max(32),
  claimText: z.string().trim().min(5).max(4000),
})

export const submitTicket = onCall({ cors: true }, async (request) => {
  try {
    assertRateLimit(`submit:${request.rawRequest.ip ?? 'unknown'}`, 10, 60_000)
  } catch {
    throw new HttpsError('resource-exhausted', 'Too many submissions. Try again shortly.')
  }

  const parsed = submitSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid input')
  }
  const { tenantSlug, customerName, customerPhone, claimText } = parsed.data

  const digits = customerPhone.replace(/\D/g, '')
  if (digits.length < 10) {
    throw new HttpsError('invalid-argument', 'Enter a valid phone number.')
  }

  const tenantQuery = await db.collection('tenants').where('subdomain', '==', tenantSlug).limit(1).get()
  if (tenantQuery.empty) {
    throw new HttpsError('not-found', 'We could not find this company.')
  }
  const tenantDoc = tenantQuery.docs[0]!
  const tenant = { id: tenantDoc.id, ...tenantDoc.data() } as Tenant
  const prefix = tenant.config?.ticketPrefix ?? 'CB'

  let displayId = `${prefix}-${generateDisplayNumber()}`
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.collection('publicTracking').doc(displayId).get()
    if (!existing.exists) break
    displayId = `${prefix}-${generateDisplayNumber()}`
  }

  const now = new Date().toISOString()
  const ticketRef = db.collection('tenants').doc(tenant.id).collection('tickets').doc()
  const trackingToken = generateTrackingToken()
  const customerUid =
    request.auth?.uid && !request.auth.token.role ? request.auth.uid : null
  const customerEmail =
    customerUid && typeof request.auth?.token.email === 'string'
      ? request.auth.token.email.toLowerCase()
      : null
  const ticket: Ticket = {
    id: ticketRef.id,
    tenantId: tenant.id,
    displayId,
    customerName,
    customerPhone,
    customerUid,
    customerEmail,
    claimText,
    summary: claimText.slice(0, 80),
    departmentId: '',
    status: 'new',
    assignedTo: null,
    priority: 'medium',
    createdAt: now,
    updatedAt: now,
    isStuck: false,
    stuckSinceHours: null,
    trackingToken,
  }

  await ticketRef.set(ticket)
  const historyRef = ticketRef.collection('history').doc()
  await historyRef.set({
    id: historyRef.id,
    ticketId: ticket.id,
    tenantId: tenant.id,
    action: 'created',
    actor: customerName,
    note: 'Case submitted via web portal.',
    visibleToCustomer: true,
    timestamp: now,
  })

  await db.collection('tenants').doc(tenant.id).collection('billingEvents').add({
    tenantId: tenant.id,
    eventType: 'ticket_created',
    quantity: 1,
    timestamp: now,
  })

  // Temporary projection so tracking works before onTicketCreated finishes.
  await db.collection('publicTracking').doc(trackingToken).set({
    displayId,
    tenantId: tenant.id,
    tenantSlug: tenant.subdomain,
    tenantName: tenant.name,
    logoInitial: tenant.config.logoInitial,
    ticketId: ticket.id,
    status: 'new',
    summary: ticket.summary,
    departmentName: 'Routing…',
    assigneeName: null,
    assigneeInitials: null,
    isStuck: false,
    statusSentence: "We've received your case and are finding the right specialist.",
    expectedTiming: 'Usually assigned within an hour',
    updatedAt: now,
    createdAt: now,
    history: [
      {
        id: 'created',
        action: 'created',
        actor: customerName,
        note: 'Case submitted via web portal.',
        timestamp: now,
      },
    ],
    trackingToken,
    pendingCustomerConfirmation: false,
  })

  return { displayId, ticketId: ticket.id, tenantSlug: tenant.subdomain, trackingToken }
})
