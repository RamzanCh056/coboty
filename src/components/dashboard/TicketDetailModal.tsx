import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { DepartmentPill, StatusPill, WarningChip } from '../ui/Pill'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Input, Select, Textarea } from '../ui/Input'
import type {
  Department,
  StaffUser,
  Ticket,
  TakeoverReason,
  TicketHistoryEntry,
} from '../../data/types'
import { getPrimaryAction } from '../../lib/ticketFlow'
import { fullTimestamp } from '../../lib/format'
import { cn } from '../../lib/cn'
import { AlertTriangle, Lock, MessageSquare, Users } from 'lucide-react'

const reasonOptions: { value: TakeoverReason; label: string }[] = [
  { value: 'colleague_unavailable', label: 'Colleague unavailable' },
  { value: 'wrong_department', label: 'Wrong department' },
  { value: 'customer_escalated', label: 'Customer escalated' },
  { value: 'shift_change', label: 'Shift change' },
]

function buildSmsPreview(
  ticket: Ticket,
  reason: TakeoverReason,
  currentUser: StaffUser,
  previousAgent: StaffUser | null,
) {
  const firstName = ticket.customerName.split(' ')[0]
  const from = previousAgent ? ` from ${previousAgent.name.split(' ')[0]}` : ''
  switch (reason) {
    case 'wrong_department':
      return `Hi ${firstName}, your case ${ticket.displayId} has been reassigned to ${currentUser.name.split(' ')[0]} on our team who specializes in this. You're in good hands.`
    case 'customer_escalated':
      return `Hi ${firstName}, ${currentUser.name.split(' ')[0]} is now personally handling your case ${ticket.displayId} to get this resolved quickly.`
    case 'shift_change':
      return `Hi ${firstName}, ${currentUser.name.split(' ')[0]} is continuing your case ${ticket.displayId}${from} after a shift handoff. No action needed from you.`
    case 'colleague_unavailable':
    default:
      return `Hi ${firstName}, ${currentUser.name.split(' ')[0]} has taken over your case ${ticket.displayId}${from} today. You're in good hands.`
  }
}

export function TicketDetailModal({
  ticket,
  department,
  assignee,
  currentUser,
  tenantStaff,
  history,
  open,
  onClose,
  onPrimaryAction,
  onReassign,
  onTakeover,
  onUpdateOps,
}: {
  ticket: Ticket | null
  department: Department | null
  assignee: StaffUser | null
  currentUser: StaffUser
  tenantStaff: StaffUser[]
  history: TicketHistoryEntry[]
  open: boolean
  onClose: () => void
  onPrimaryAction: (ticket: Ticket) => void
  onReassign: (ticket: Ticket, staffId: string) => void
  onTakeover: (ticket: Ticket, reason: TakeoverReason, note: string) => void
  onUpdateOps?: (
    ticket: Ticket,
    patch: {
      waitingForCustomer?: boolean
      waitingForInternal?: boolean
      customerNextStep?: string
      promisedResponseAt?: string
    },
  ) => void
}) {
  const [reason, setReason] = useState<TakeoverReason>('colleague_unavailable')
  const [note, setNote] = useState('')
  const [reassignTo, setReassignTo] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [promisedAt, setPromisedAt] = useState('')
  const [waitingCustomer, setWaitingCustomer] = useState(false)
  const [waitingInternal, setWaitingInternal] = useState(false)

  useEffect(() => {
    if (!ticket) return
    setNextStep(ticket.customerNextStep ?? '')
    setPromisedAt(ticket.promisedResponseAt ? ticket.promisedResponseAt.slice(0, 16) : '')
    setWaitingCustomer(Boolean(ticket.waitingForCustomer))
    setWaitingInternal(Boolean(ticket.waitingForInternal))
  }, [
    ticket?.id,
    ticket?.customerNextStep,
    ticket?.promisedResponseAt,
    ticket?.waitingForCustomer,
    ticket?.waitingForInternal,
  ])

  if (!ticket || !department) return null

  const smsPreview = buildSmsPreview(ticket, reason, currentUser, assignee)
  const primaryAction = !ticket.isStuck ? getPrimaryAction(ticket) : null
  const canReassign = currentUser.role === 'manager' || currentUser.role === 'admin'
  const reassignOptions = tenantStaff.filter((s) => s.id !== ticket.assignedTo)

  return (
    <Modal open={open} onClose={onClose} title={ticket.displayId}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <DepartmentPill name={department.name} slug={department.slug} />
          <StatusPill status={ticket.status} />
          {ticket.hasUnreadCustomerReply && (
            <WarningChip>
              <MessageSquare className="h-3 w-3" aria-hidden="true" />
              Customer reply
            </WarningChip>
          )}
          {ticket.isStuck && (
            <WarningChip>
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Needs attention · {ticket.stuckSinceHours}h
            </WarningChip>
          )}
        </div>

        <div className="rounded-card border border-border bg-page px-4 py-3">
          <p className="text-base text-text-primary">{ticket.claimText}</p>
          <div className="mt-3 flex flex-col gap-0.5 border-t border-border pt-3">
            <p className="text-xs font-medium text-text-tertiary">Customer</p>
            <p className="text-sm font-medium text-text-primary">{ticket.customerName}</p>
            <p className="text-sm text-text-secondary">{ticket.customerPhone}</p>
          </div>
        </div>

        {primaryAction && (
          <Button variant="outline" className="self-start" onClick={() => onPrimaryAction(ticket)}>
            <primaryAction.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {primaryAction.label}
          </Button>
        )}

        {onUpdateOps && ticket.status !== 'solved' && (
          <div className="flex flex-col gap-3 rounded-card border border-border bg-page px-3.5 py-3">
            <p className="text-sm font-medium text-text-secondary">Case operations</p>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={waitingCustomer}
                onChange={(e) => setWaitingCustomer(e.target.checked)}
              />
              Waiting for customer
            </label>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={waitingInternal}
                onChange={(e) => setWaitingInternal(e.target.checked)}
              />
              Waiting for internal team
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-tertiary">Customer-facing next step</span>
              <Textarea
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder="e.g. We'll confirm parts availability and call you tomorrow."
                className="min-h-20"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-tertiary">Promised response</span>
              <Input
                type="datetime-local"
                value={promisedAt}
                onChange={(e) => setPromisedAt(e.target.value)}
              />
            </label>
            <Button
              variant="outline"
              className="self-start"
              onClick={() =>
                onUpdateOps(ticket, {
                  waitingForCustomer: waitingCustomer,
                  waitingForInternal: waitingInternal,
                  customerNextStep: nextStep.trim(),
                  promisedResponseAt: promisedAt ? new Date(promisedAt).toISOString() : '',
                })
              }
            >
              Save case update
            </Button>
          </div>
        )}

        {canReassign && ticket.status !== 'solved' && reassignOptions.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-card border border-border bg-page px-3.5 py-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {ticket.status === 'new' || !ticket.assignedTo
                ? 'Manager: assign to a teammate'
                : 'Manager: reassign to a specific teammate'}
            </span>
            <div className="flex gap-2">
              <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} className="flex-1">
                <option value="">Choose teammate…</option>
                {reassignOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.team}
                  </option>
                ))}
              </Select>
              <Button
                variant="outline"
                disabled={!reassignTo}
                onClick={() => {
                  onReassign(ticket, reassignTo)
                  setReassignTo('')
                }}
              >
                {ticket.status === 'new' || !ticket.assignedTo ? 'Assign' : 'Reassign'}
              </Button>
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-medium text-text-secondary">History</h3>
          {history.length === 0 ? (
            <p className="text-sm text-text-tertiary">No activity recorded yet.</p>
          ) : (
            <ol className="flex flex-col gap-3 border-l border-border pl-4">
              {history.map((entry) => (
                <li key={entry.id} className="relative">
                  <span
                    className={cn(
                      'absolute -left-[21px] top-1 h-2 w-2 rounded-full',
                      entry.visibleToCustomer ? 'bg-text-tertiary' : 'bg-status-assigned-text',
                    )}
                    aria-hidden="true"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{entry.actor}</span>
                    <span className="text-xs text-text-tertiary">{fullTimestamp(entry.timestamp)}</span>
                  </div>
                  <p
                    className={cn(
                      'mt-0.5 text-sm',
                      entry.visibleToCustomer
                        ? 'text-text-secondary'
                        : 'flex items-start gap-1.5 rounded-control bg-status-assigned-bg px-2 py-1.5 text-status-assigned-text',
                    )}
                  >
                    {!entry.visibleToCustomer && (
                      <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    )}
                    {entry.note}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        {ticket.isStuck && (
          <div className="flex flex-col gap-4 rounded-card border border-status-stuck-bg bg-status-stuck-bg/40 p-4">
            <div className="flex items-center gap-2">
              <Avatar initials={currentUser.avatarInitials} size="sm" />
              <p className="text-sm font-medium text-text-primary">Take over this case</p>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">Reason</span>
              <Select value={reason} onChange={(e) => setReason(e.target.value as TakeoverReason)}>
                {reasonOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Internal note — not visible to customer
              </span>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add context for the team..."
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">Customer will receive</span>
              <div className="rounded-card border border-border bg-surface px-3 py-2.5 text-sm text-text-primary">
                {smsPreview}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onTakeover(ticket, reason, note)
                  setNote('')
                }}
              >
                Take over and notify customer
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
