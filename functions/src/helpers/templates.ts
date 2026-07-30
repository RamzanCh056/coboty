import type { TakeoverReason } from '../types'
import { reasonLabels } from '../types'

export function getAnthropicApiKey(): string {
  return process.env.ANTHROPIC_API_KEY ?? ''
}

export function getTwilioAccountSid(): string {
  return process.env.TWILIO_ACCOUNT_SID ?? ''
}

export function getTwilioAuthToken(): string {
  return process.env.TWILIO_AUTH_TOKEN ?? ''
}

export function getTwilioFromNumber(): string {
  return process.env.TWILIO_FROM_NUMBER ?? ''
}

export function takeoverSmsPreview(input: {
  customerFirstName: string
  displayId: string
  actorFirstName: string
  previousFirstName: string | null
  reason: TakeoverReason
}): string {
  const from = input.previousFirstName ? ` from ${input.previousFirstName}` : ''
  switch (input.reason) {
    case 'wrong_department':
      return `Hi ${input.customerFirstName}, your case ${input.displayId} has been reassigned to ${input.actorFirstName} on our team who specializes in this. You're in good hands.`
    case 'customer_escalated':
      return `Hi ${input.customerFirstName}, ${input.actorFirstName} is now personally handling your case ${input.displayId} to get this resolved quickly.`
    case 'shift_change':
      return `Hi ${input.customerFirstName}, ${input.actorFirstName} is continuing your case ${input.displayId}${from} after a shift handoff. No action needed from you.`
    case 'colleague_unavailable':
    default:
      return `Hi ${input.customerFirstName}, ${input.actorFirstName} has taken over your case ${input.displayId}${from} today. You're in good hands.`
  }
}

export function receivedSms(customerFirstName: string, displayId: string, departmentName: string): string {
  return `Hi ${customerFirstName}, your case ${displayId} has been received and routed to our ${departmentName} team. Track anytime with your ticket number.`
}

export function assignedSms(customerFirstName: string, displayId: string, agentFirstName: string): string {
  return `Hi ${customerFirstName}, ${agentFirstName} has been assigned to your case ${displayId} and will be in touch soon.`
}

export function callingSms(customerFirstName: string, displayId: string, agentFirstName: string): string {
  return `Hi ${customerFirstName}, ${agentFirstName} will call you about case ${displayId}.`
}

export function solvedSms(customerFirstName: string, displayId: string): string {
  return `Hi ${customerFirstName}, your case ${displayId} has been marked solved. Reply if you still need help.`
}

export function takeoverHistoryNote(actorName: string, previousName: string | null, reason: TakeoverReason): string {
  return previousName
    ? `Took over from ${previousName} — ${reasonLabels[reason]}.`
    : `Took over — ${reasonLabels[reason]}.`
}
