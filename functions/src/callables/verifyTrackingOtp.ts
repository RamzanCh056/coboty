import type { DocumentReference } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { verifyOtpHash } from '../helpers/otp'
import { rebuildProjection } from '../helpers/projection'
import { assertRateLimit } from '../helpers/sms'
import { ensureTicketTrackingToken, normalizePhone, phonesMatch } from '../helpers/trackingToken'
import type { Tenant, Ticket } from '../types'

const schema = z.object({
  displayId: z.string().min(3).max(32),
  customerPhone: z.string().trim().min(10).max(32),
  code: z.string().trim().min(4).max(8),
  tenantSlug: z.string().min(1).max(64).optional(),
})

interface TrackingOtpDoc {
  id: string
  displayId: string
  phoneLast10: string
  codeHash: string
  expiresAt: string
  createdAt: string
  attempts: number
  ticketId: string
  tenantId: string
}

export const verifyTrackingOtp = onCall({ cors: true }, async (request) => {
  try {
    assertRateLimit(`otp-verify:${request.rawRequest.ip ?? 'unknown'}`, 10, 60_000)
  } catch {
    throw new HttpsError('resource-exhausted', 'Too many verification attempts. Try again shortly.')
  }

  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Display ID, phone, and code are required.')
  }
  const { displayId, customerPhone, code } = parsed.data
  const phoneLast10 = normalizePhone(customerPhone).slice(-10)

  const otpSnap = await db
    .collection('trackingOtps')
    .where('displayId', '==', displayId)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get()

  if (otpSnap.empty) {
    throw new HttpsError('not-found', 'No verification code found. Request a new code.')
  }

  const now = Date.now()
  let matched: { ref: DocumentReference; data: TrackingOtpDoc } | null = null

  for (const doc of otpSnap.docs) {
    const data = { id: doc.id, ...doc.data() } as TrackingOtpDoc
    if (data.phoneLast10 !== phoneLast10) continue
    matched = { ref: doc.ref, data }
    break
  }

  if (!matched) {
    throw new HttpsError('not-found', 'No verification code found. Request a new code.')
  }

  const { ref, data } = matched

  if (new Date(data.expiresAt).getTime() < now) {
    throw new HttpsError('failed-precondition', 'Verification code expired. Request a new code.')
  }

  if (data.attempts >= 5) {
    throw new HttpsError('resource-exhausted', 'Too many failed attempts. Request a new code.')
  }

  if (!verifyOtpHash(code, data.codeHash)) {
    await ref.update({ attempts: data.attempts + 1 })
    throw new HttpsError('invalid-argument', 'Invalid verification code.')
  }

  const ticketSnap = await db
    .collection('tenants')
    .doc(data.tenantId)
    .collection('tickets')
    .doc(data.ticketId)
    .get()

  if (!ticketSnap.exists) {
    throw new HttpsError('not-found', 'Ticket not found.')
  }

  const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket
  if (!phonesMatch(ticket.customerPhone, customerPhone) || ticket.displayId !== displayId) {
    throw new HttpsError('not-found', 'Ticket not found.')
  }

  const tenantSnap = await db.collection('tenants').doc(ticket.tenantId).get()
  if (!tenantSnap.exists) {
    throw new HttpsError('not-found', 'Company not found.')
  }
  const tenant = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant

  const trackingToken = await ensureTicketTrackingToken(ticket)
  await rebuildProjection(ticket.tenantId, ticket.id)

  const allOtps = await db.collection('trackingOtps').where('displayId', '==', displayId).get()
  const batch = db.batch()
  for (const doc of allOtps.docs) {
    batch.delete(doc.ref)
  }
  await batch.commit()

  return {
    trackingToken,
    tenantSlug: tenant.subdomain,
    displayId: ticket.displayId,
    ticketId: ticket.id,
  }
})
