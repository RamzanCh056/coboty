import type { TicketStatus } from '../types'

/** Legal staff-driven transitions (opened is set when agent opens a ticket). */
export const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
  new: ['assigned'],
  assigned: ['opened', 'calling'],
  opened: ['calling', 'awaiting_confirmation'],
  calling: ['awaiting_confirmation'],
  awaiting_confirmation: ['solved', 'opened', 'calling'],
  solved: ['opened'], // reopen
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return allowedTransitions[from].includes(to)
}

export function expectedTiming(status: TicketStatus): string | null {
  switch (status) {
    case 'new':
      return 'Usually assigned within an hour'
    case 'assigned':
    case 'opened':
      return 'Typically updated today'
    case 'calling':
      return 'Today, before 17:00'
    case 'awaiting_confirmation':
      return 'Please confirm resolution'
    case 'solved':
      return null
  }
}

export function statusSentence(status: TicketStatus, firstName: string | null): string {
  switch (status) {
    case 'new':
      return "We've received your case and are finding the right specialist."
    case 'assigned':
      return `${firstName ?? 'A specialist'} has been assigned to your case.`
    case 'opened':
      return `${firstName ?? 'A specialist'} is working on your case.`
    case 'calling':
      return `${firstName ?? 'A specialist'} is contacting you.`
    case 'awaiting_confirmation':
      return 'We believe your case is resolved. Please confirm or let us know if you need more help.'
    case 'solved':
      return 'Your case has been resolved.'
  }
}

export function generateDisplayNumber(): number {
  return 10000 + Math.floor(Math.random() * 89999)
}
