import { db } from './admin'
import type { Ticket } from '../types'

function getSendgridApiKey(): string | undefined {
  return process.env.SENDGRID_API_KEY
}

function getEmailFrom(): string | undefined {
  return process.env.EMAIL_FROM || process.env.SENDGRID_FROM
}

export async function sendCustomerEmail(input: {
  tenantId: string
  ticketId: string
  toEmail: string
  subject: string
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
  const apiKey = getSendgridApiKey()
  const from = getEmailFrom()

  if (!apiKey || !from || !input.toEmail.includes('@')) {
    console.warn('[email] SENDGRID secrets not configured — skipping send', {
      ticketId: input.ticketId,
      to: input.toEmail,
    })
    await ref.set({
      id: ref.id,
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      channel: 'email',
      message: input.message,
      sentAt,
      status: 'skipped',
    })
    return { status: 'skipped', notificationId: ref.id }
  }

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.toEmail }] }],
        from: { email: from },
        subject: input.subject,
        content: [{ type: 'text/plain', value: input.message }],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`SendGrid ${res.status}: ${body.slice(0, 200)}`)
    }
    await ref.set({
      id: ref.id,
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      channel: 'email',
      message: input.message,
      sentAt,
      status: 'sent',
    })
    await db.collection('tenants').doc(input.tenantId).collection('billingEvents').add({
      tenantId: input.tenantId,
      eventType: 'email_sent',
      quantity: 1,
      timestamp: sentAt,
    })
    return { status: 'sent', notificationId: ref.id }
  } catch (err) {
    console.error('[email] send failed', err)
    await ref.set({
      id: ref.id,
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      channel: 'email',
      message: input.message,
      sentAt,
      status: 'failed',
    })
    return { status: 'failed', notificationId: ref.id }
  }
}

export async function notifyCustomer(input: {
  ticket: Ticket
  message: string
  emailSubject?: string
}): Promise<{ status: 'sent' | 'skipped' | 'failed'; channel: 'sms' | 'email' }> {
  const { sendCustomerSms } = await import('./sms')
  const channel = input.ticket.preferredChannel === 'email' ? 'email' : 'sms'

  if (channel === 'email') {
    const email = input.ticket.customerEmail?.trim()
    if (!email) {
      // Fall back to SMS if email requested but missing
      const sms = await sendCustomerSms({
        tenantId: input.ticket.tenantId,
        ticketId: input.ticket.id,
        toPhone: input.ticket.customerPhone,
        message: input.message,
      })
      return { status: sms.status, channel: 'sms' }
    }
    const result = await sendCustomerEmail({
      tenantId: input.ticket.tenantId,
      ticketId: input.ticket.id,
      toEmail: email,
      subject: input.emailSubject ?? `Update on ${input.ticket.displayId}`,
      message: input.message,
    })
    return { status: result.status, channel: 'email' }
  }

  const sms = await sendCustomerSms({
    tenantId: input.ticket.tenantId,
    ticketId: input.ticket.id,
    toPhone: input.ticket.customerPhone,
    message: input.message,
  })
  return { status: sms.status, channel: 'sms' }
}
