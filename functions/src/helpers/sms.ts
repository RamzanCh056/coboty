import Twilio from 'twilio'
import { db } from './admin'
import {
  getTwilioAccountSid,
  getTwilioAuthToken,
  getTwilioFromNumber,
} from './templates'

export async function sendCustomerSms(input: {
  tenantId: string
  ticketId: string
  toPhone: string
  message: string
}): Promise<{ status: 'sent' | 'skipped' | 'failed'; notificationId: string }> {
  const notifications = db
    .collection('tenants')
    .doc(input.tenantId)
    .collection('tickets')
    .doc(input.ticketId)
    .collection('notifications')

  const ref = notifications.doc()
  const sentAt = new Date().toISOString()

  const sid = getTwilioAccountSid()
  const token = getTwilioAuthToken()
  const from = getTwilioFromNumber()

  if (!sid || !token || !from || sid.startsWith('unset') || token.startsWith('unset')) {
    console.warn('[sms] TWILIO secrets not configured — skipping send', {
      ticketId: input.ticketId,
      to: input.toPhone,
    })
    await ref.set({
      id: ref.id,
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      channel: 'sms',
      message: input.message,
      sentAt,
      status: 'skipped',
    })
    return { status: 'skipped', notificationId: ref.id }
  }

  try {
    const client = Twilio(sid, token)
    await client.messages.create({
      to: input.toPhone,
      from,
      body: input.message,
    })
    await ref.set({
      id: ref.id,
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      channel: 'sms',
      message: input.message,
      sentAt,
      status: 'sent',
    })
    await db
      .collection('tenants')
      .doc(input.tenantId)
      .collection('billingEvents')
      .add({
        tenantId: input.tenantId,
        eventType: 'sms_sent',
        quantity: 1,
        timestamp: sentAt,
      })
    return { status: 'sent', notificationId: ref.id }
  } catch (err) {
    console.error('[sms] Twilio send failed', err)
    await ref.set({
      id: ref.id,
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      channel: 'sms',
      message: input.message,
      sentAt,
      status: 'failed',
    })
    return { status: 'failed', notificationId: ref.id }
  }
}

/** Lightweight in-memory rate limiter for public callables (per instance). */
const buckets = new Map<string, { count: number; resetAt: number }>()

export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  if (current.count >= limit) {
    throw new Error('RATE_LIMIT')
  }
  current.count += 1
}
