import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertRateLimit } from '../helpers/sms'
import { phonesMatch, ensureTicketTrackingToken } from '../helpers/trackingToken'
import { rebuildProjection } from '../helpers/projection'
import type { Ticket, Tenant } from '../types'

const schema = z.object({
  displayId: z.string().min(3).max(32),
  customerPhone: z.string().trim().min(10).max(32),
  tenantSlug: z.string().min(1).max(64).optional(),
})

export const lookupTicketByPhone = onCall({ cors: true }, async (request) => {
  try {
    assertRateLimit(`lookup:${request.rawRequest.ip ?? 'unknown'}`, 5, 60_000)
  } catch {
    throw new HttpsError('resource-exhausted', 'Too many lookup attempts. Try again shortly.')
  }

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Display ID and phone number are required.')
  }
  const { displayId, customerPhone, tenantSlug } = parsed.data

  let ticket: Ticket | null = null
  let tenantInfo: { id: string; subdomain: string } | null = null

  if (tenantSlug) {
    // Look up in specific tenant
    const tenantQuery = await db.collection('tenants').where('subdomain', '==', tenantSlug).limit(1).get()
    if (tenantQuery.empty) {
      throw new HttpsError('not-found', 'Company not found.')
    }
    const tenantDoc = tenantQuery.docs[0]!
    const tenant = { id: tenantDoc.id, ...tenantDoc.data() } as Tenant
    tenantInfo = { id: tenant.id, subdomain: tenant.subdomain }

    const ticketQuery = await db
      .collection('tenants')
      .doc(tenant.id)
      .collection('tickets')
      .where('displayId', '==', displayId)
      .limit(1)
      .get()

    if (!ticketQuery.empty) {
      const ticketDoc = ticketQuery.docs[0]!
      const candidateTicket = { id: ticketDoc.id, ...ticketDoc.data() } as Ticket
      if (phonesMatch(candidateTicket.customerPhone, customerPhone)) {
        ticket = candidateTicket
      }
    }
  } else {
    // Search across all tenants using collection group
    const ticketQuery = await db
      .collectionGroup('tickets')
      .where('displayId', '==', displayId)
      .limit(1)
      .get()

    if (!ticketQuery.empty) {
      const ticketDoc = ticketQuery.docs[0]!
      const candidateTicket = { id: ticketDoc.id, ...ticketDoc.data() } as Ticket
      if (phonesMatch(candidateTicket.customerPhone, customerPhone)) {
        ticket = candidateTicket
        // Get tenant info
        const tenantDoc = await db.collection('tenants').doc(ticket.tenantId).get()
        if (tenantDoc.exists) {
          const tenant = { id: tenantDoc.id, ...tenantDoc.data() } as Tenant
          tenantInfo = { id: tenant.id, subdomain: tenant.subdomain }
        }
      }
    }
  }

  if (!ticket || !tenantInfo) {
    throw new HttpsError('not-found', 'No matching ticket found with that phone number.')
  }

  // Ensure ticket has tracking token
  const trackingToken = await ensureTicketTrackingToken(ticket)
  
  // Rebuild projection to ensure it's up to date
  await rebuildProjection(ticket.tenantId, ticket.id)

  return {
    trackingToken,
    tenantSlug: tenantInfo.subdomain,
    displayId: ticket.displayId,
    ticketId: ticket.id,
  }
})