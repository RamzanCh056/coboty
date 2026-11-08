import Anthropic from '@anthropic-ai/sdk'
import type { Ticket, TicketHistoryEntry } from '../types'
import { getAnthropicApiKey } from './templates'

const HARD_RISK = ['pricing', 'legal', 'refund', 'promises', 'commitment', 'escalation'] as const

export type AiDraftResult = {
  draftMessage: string
  missingInfo: string[]
  usedAi: boolean
  confidence: number
  riskFlags: string[]
  suggestedNextStep: string | null
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
  if (
    /(address|location|where|unit|apartment)/.test(claim) === false &&
    /(repair|visit|come|door|window|plumb|heat)/.test(claim)
  ) {
    missing.push('Service address / unit details')
  }
  if (
    /(when|time|schedule|available|appointment)/.test(claim) === false &&
    /(repair|call|visit)/.test(claim)
  ) {
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

function heuristicRiskFlags(text: string): string[] {
  const lower = text.toLowerCase()
  const flags: string[] = []
  if (/(refund|chargeback|money back)/.test(lower)) flags.push('refund')
  if (/(lawyer|legal|sue|court|gdpr)/.test(lower)) flags.push('legal')
  if (/(price|quote|\$|cost|fee|discount)/.test(lower)) flags.push('pricing')
  if (/(tomorrow|guarantee|promise|by friday|definitely)/.test(lower)) flags.push('promises')
  if (/(escalate|supervisor|manager|complaint)/.test(lower)) flags.push('escalation')
  return flags
}

function fallbackDraft(ticket: Ticket, missingInfo: string[]): string {
  const firstName = (ticket.customerName || 'there').split(' ')[0]
  const lines = [
    `Hi ${firstName},`,
    '',
    `Thanks for your message on case ${ticket.displayId}. We're on it.`,
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

export function isLowRiskAutoSendCandidate(result: AiDraftResult): boolean {
  if (!result.usedAi) return false
  if (result.confidence < 0.85) return false
  if (result.riskFlags.some((f) => HARD_RISK.includes(f as (typeof HARD_RISK)[number]))) {
    return false
  }
  // Prefer info-gathering or short acknowledgements — never dense commitments.
  if (result.draftMessage.length > 700) return false
  return true
}

export async function draftCustomerReplyAi(input: {
  ticket: Ticket
  history: TicketHistoryEntry[]
  staffName: string
  triggerMessage?: string
}): Promise<AiDraftResult> {
  const missingHeuristic = heuristicMissingInfo(input.ticket, input.history)
  const apiKey = getAnthropicApiKey()
  const riskSeed = `${input.ticket.claimText}\n${input.triggerMessage || ''}`

  if (!apiKey || apiKey.startsWith('unset')) {
    return {
      draftMessage: fallbackDraft(input.ticket, missingHeuristic),
      missingInfo: missingHeuristic,
      usedAi: false,
      confidence: 0.35,
      riskFlags: heuristicRiskFlags(riskSeed),
      suggestedNextStep:
        missingHeuristic[0] != null
          ? `Waiting on customer for: ${missingHeuristic[0]}`
          : 'Follow up after reviewing the latest customer message.',
    }
  }

  const recentHistory = input.history
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-12)
    .map(
      (h) =>
        `[${h.timestamp}] ${h.actor} (${h.action}${h.visibleToCustomer ? ', customer-visible' : ', internal'}): ${h.note}`,
    )
    .join('\n')

  const prompt = `You are CoBotty's case conversation agent helping staff reply to a customer.
Write a short, professional customer-facing reply (SMS/email friendly, under 600 characters when possible).
Also list missing information, a confidence score, risk flags, and a short internal next-step note.

Rules:
- Do NOT invent facts, prices, timelines, guarantees, or promises the ticket does not support.
- Ask only for information that is actually missing or unclear.
- Prefer clarifying questions over commitments.
- Be warm and clear. Sign as "${input.staffName.split(' ')[0]} · Support" if natural.
- confidence is 0 to 1 (how safe this draft is to send with little editing).
- riskFlags: subset of ["pricing","legal","refund","promises","commitment","escalation"] — empty if none.
- Respond ONLY as JSON:
{"draftMessage":"...","missingInfo":["..."],"confidence":0.0,"riskFlags":[],"suggestedNextStep":"..."}

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
- Latest customer message: ${input.triggerMessage || '(see history)'}

Recent history:
${recentHistory || '(none)'}`

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      draftMessage?: string
      missingInfo?: string[]
      confidence?: number
      riskFlags?: string[]
      suggestedNextStep?: string
    }
    const draftMessage = (parsed.draftMessage || '').trim()
    const missingInfo = Array.isArray(parsed.missingInfo)
      ? parsed.missingInfo.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
      : missingHeuristic
    const confidenceRaw = typeof parsed.confidence === 'number' ? parsed.confidence : 0.55
    const confidence = Math.max(0, Math.min(1, confidenceRaw))
    const riskFlags = Array.isArray(parsed.riskFlags)
      ? [
          ...new Set(
            [
              ...parsed.riskFlags.map((s) => String(s).trim().toLowerCase()).filter(Boolean),
              ...heuristicRiskFlags(`${draftMessage}\n${riskSeed}`),
            ],
          ),
        ].slice(0, 6)
      : heuristicRiskFlags(`${draftMessage}\n${riskSeed}`)
    const suggestedNextStep =
      (parsed.suggestedNextStep || '').trim() ||
      (missingInfo[0] != null
        ? `Waiting on customer for: ${missingInfo[0]}`
        : 'Review customer reply and confirm next step.')

    if (!draftMessage) {
      return {
        draftMessage: fallbackDraft(input.ticket, missingInfo.length ? missingInfo : missingHeuristic),
        missingInfo: missingInfo.length ? missingInfo : missingHeuristic,
        usedAi: false,
        confidence: 0.35,
        riskFlags,
        suggestedNextStep,
      }
    }

    return {
      draftMessage,
      missingInfo,
      usedAi: true,
      confidence,
      riskFlags,
      suggestedNextStep,
    }
  } catch (err) {
    console.error('[draftReply] Claude failed', err)
    return {
      draftMessage: fallbackDraft(input.ticket, missingHeuristic),
      missingInfo: missingHeuristic,
      usedAi: false,
      confidence: 0.3,
      riskFlags: heuristicRiskFlags(riskSeed),
      suggestedNextStep:
        missingHeuristic[0] != null
          ? `Waiting on customer for: ${missingHeuristic[0]}`
          : 'Follow up after reviewing the latest customer message.',
    }
  }
}
