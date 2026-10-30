import Anthropic from '@anthropic-ai/sdk'
import type { Ticket, TicketHistoryEntry } from '../types'
import { getAnthropicApiKey } from './templates'

export type AiDraftResult = {
  draftMessage: string
  missingInfo: string[]
  usedAi: boolean
}

function heuristicMissingInfo(ticket: Ticket, history: TicketHistoryEntry[]): string[] {
  const missing: string[] = []
  const claim = (ticket.claimText || '').toLowerCase()
  const hasCustomerMsg = history.some((h) => h.action === 'message' && h.visibleToCustomer)

  if (!ticket.customerEmail && ticket.preferredChannel === 'email') {
    missing.push('Customer email address (preferred channel is email)')
  }
  if (/(photo|picture|image|attach|damage)/.test(claim) && !hasCustomerMsg) {
    missing.push('Photos or attachments of the issue')
  }
  if (/(address|location|where|unit|apartment)/.test(claim) === false && /(repair|visit|come|door|window|plumb|heat)/.test(claim)) {
    missing.push('Service address / unit details')
  }
  if (/(when|time|schedule|available|appointment)/.test(claim) === false && /(repair|call|visit)/.test(claim)) {
    missing.push('Preferred contact or visit time window')
  }
  if ((ticket.claimText || '').trim().length < 40) {
    missing.push('Clearer description of the problem and what outcome they want')
  }
  if (!ticket.customerNextStep) {
    missing.push('Confirmed next step with the customer')
  }
  return missing.slice(0, 6)
}

function fallbackDraft(ticket: Ticket, missingInfo: string[]): string {
  const firstName = (ticket.customerName || 'there').split(' ')[0]
  const lines = [
    `Hi ${firstName},`,
    '',
    `Thanks for contacting us about case ${ticket.displayId}. We're reviewing: "${(ticket.summary || ticket.claimText || '').slice(0, 120)}".`,
  ]
  if (missingInfo.length > 0) {
    lines.push('', 'To move this forward, could you please share:')
    for (const item of missingInfo) {
      lines.push(`- ${item}`)
    }
  } else {
    lines.push('', "We'll update you as soon as we have the next step confirmed.")
  }
  lines.push('', 'Thank you,', 'CoBotty Support')
  return lines.join('\n')
}

export async function draftCustomerReplyAi(input: {
  ticket: Ticket
  history: TicketHistoryEntry[]
  staffName: string
}): Promise<AiDraftResult> {
  const missingHeuristic = heuristicMissingInfo(input.ticket, input.history)
  const apiKey = getAnthropicApiKey()

  if (!apiKey || apiKey.startsWith('unset')) {
    return {
      draftMessage: fallbackDraft(input.ticket, missingHeuristic),
      missingInfo: missingHeuristic,
      usedAi: false,
    }
  }

  const recentHistory = input.history
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-12)
    .map((h) => `[${h.timestamp}] ${h.actor} (${h.action}${h.visibleToCustomer ? ', customer-visible' : ', internal'}): ${h.note}`)
    .join('\n')

  const prompt = `You help a claims/support staff member reply to a customer.
Write a short, professional customer-facing reply (SMS/email friendly, under 600 characters when possible).
Also list missing information the customer should provide so the case can progress.

Rules:
- Do NOT invent facts, prices, timelines, or promises the ticket does not support.
- Ask only for information that is actually missing or unclear.
- Be warm and clear. Sign as "${input.staffName.split(' ')[0]} · Support" if natural.
- Respond ONLY as JSON: {"draftMessage":"...","missingInfo":["..."]}

Ticket:
- ID: ${input.ticket.displayId}
- Status: ${input.ticket.status}
- Customer: ${input.ticket.customerName} · ${input.ticket.customerPhone}${input.ticket.customerEmail ? ` · ${input.ticket.customerEmail}` : ''}
- Preferred channel: ${input.ticket.preferredChannel || 'sms'}
- Claim: ${input.ticket.claimText}
- Summary: ${input.ticket.summary || ''}
- Next step on file: ${input.ticket.customerNextStep || '(none)'}
- Promised response: ${input.ticket.promisedResponseAt || '(none)'}
- Waiting for customer: ${Boolean(input.ticket.waitingForCustomer)}
- Waiting for internal: ${Boolean(input.ticket.waitingForInternal)}
- Resolution evidence: ${input.ticket.resolutionEvidence || '(none)'}

Recent history:
${recentHistory || '(none)'}`

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      draftMessage?: string
      missingInfo?: string[]
    }
    const draftMessage = (parsed.draftMessage || '').trim()
    const missingInfo = Array.isArray(parsed.missingInfo)
      ? parsed.missingInfo.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
      : missingHeuristic

    if (!draftMessage) {
      return {
        draftMessage: fallbackDraft(input.ticket, missingInfo.length ? missingInfo : missingHeuristic),
        missingInfo: missingInfo.length ? missingInfo : missingHeuristic,
        usedAi: false,
      }
    }

    return { draftMessage, missingInfo, usedAi: true }
  } catch (err) {
    console.error('[draftReply] Claude failed', err)
    return {
      draftMessage: fallbackDraft(input.ticket, missingHeuristic),
      missingInfo: missingHeuristic,
      usedAi: false,
    }
  }
}
