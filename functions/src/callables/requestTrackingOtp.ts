import { randomBytes } from 'node:crypto'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { generateOtp, hashOtp } from '../helpers/otp'
import { assertRateLimit, sendCustomerSms } from '../helpers/sms'
import { normalizePhone, phonesMatch } from '../helpers/trackingToken'
import type { Tenant, Ticket } from '../types'

const schema = z.object({
  displayId: z.string().min(3).max(32),
  customerPhone: z.string().trim().min(10).max(32),
  tenantSlug: z.string().min(1).max(64).optional(),
})

const OTP_TTL_MS = 10 * 60 * 1000

async function findTicketByPhone(input: {
  displayId: string
  customerPhone: string
  tenantSlug?: string
}): Promise<Ticket | null> {
  const { displayId, customerPhone, tenantSlug } = input

  if (tenantSlug) {
    const tenantQuery = await db.collection('tenants').where('subdomain', '==', tenantSlug).limit(1).get()
    if (tenantQuery.empty) return null
    const tenantDoc = tenantQuery.docs[0]!
    const tenant = { id: tenantDoc.id, ...tenantDoc.data() } as Tenant

    const ticketQuery = await db
      .collection('tenants')
      .doc(tenant.id)
      .collection('tickets')
      .where('displayId', '==', displayId)
      .limit(1)
      .get()

    if (ticketQuery.empty) return null
    const ticketDoc = ticketQuery.docs[0]!
    const candidate = { id: ticketDoc.id, ...ticketDoc.data() } as Ticket
    return phonesMatch(candidate.customerPhone, customerPhone) ? candidate : null
  }

  const ticketQuery = await db.collectionGroup('tickets').where('displayId', '==', displayId).limit(1).get()
  if (ticketQuery.empty) return null
  const ticketDoc = ticketQuery.docs[0]!
  const candidate = { id: ticketDoc.id, ...ticketDoc.data() } as Ticket
  return phonesMatch(candidate.customerPhone, customerPhone) ? candidate : null
}

export const requestTrackingOtp = onCall({ cors: true }, async (request) => {
  try {
    assertRateLimit(`otp-req:${request.rawRequest.ip ?? 'unknown'}`, 5, 60_000)
  } catch {
    throw new HttpsError('resource-exhausted', 'Too many OTP requests. Try again shortly.')
  }

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Display ID and phone number are required.')
  }
  const { displayId, customerPhone, tenantSlug } = parsed.data

  const ticket = await findTicketByPhone({ displayId, customerPhone, tenantSlug })

  // Always succeed to resist enumeration; only send SMS when matched.
  if (ticket) {
    const code = generateOtp()
    const now = Date.now()
    const phoneLast10 = normalizePhone(customerPhone).slice(-10)
    const otpRef = db.collection('trackingOtps').doc(randomBytes(16).toString('hex'))
    await otpRef.set({
      id: otpRef.id,
      displayId: ticket.displayId,
      phoneLast10,
      codeHash: hashOtp(code),
      expiresAt: new Date(now + OTP_TTL_MS).toISOString(),
      createdAt: new Date(now).toISOString(),
      attempts: 0,
      ticketId: ticket.id,
      tenantId: ticket.tenantId,
    })

    await sendCustomerSms({
      tenantId: ticket.tenantId,
      ticketId: ticket.id,
      toPhone: ticket.customerPhone,
      message: `Your Cobotty verification code for ${ticket.displayId} is ${code}. It expires in 10 minutes.`,
    })
  }

  return { ok: true }
})
