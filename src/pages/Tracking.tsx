import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Check, MessageSquare, Smartphone } from 'lucide-react'
import type { PublicTracking, TicketStatus } from '../data/types'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Timeline, type TimelineStep } from '../components/ui/Timeline'
import { Modal } from '../components/ui/Modal'
import { Input, Textarea } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { Toast } from '../components/ui/Toast'
import { StatusPill } from '../components/ui/Pill'
import {
  callConfirmTicketResolution,
  callLookupTicketByPhone,
  callReopenTicket,
  callRequestTicketUpdate,
  callSendCustomerMessage,
  subscribePublicTracking,
} from '../lib/firebase/data'
import { expectedTiming, isTrackingToken } from '../lib/ticketFlow'
import { fullTimestamp, relativeTime } from '../lib/format'

const stepOrder: TimelineStep['label'][] = ['Received', 'Assigned', 'In progress', 'Solved']

const statusToIndex: Record<TicketStatus, number> = {
  new: 0,
  assigned: 1,
  opened: 2,
  calling: 2,
  awaiting_confirmation: 2,
  solved: 3,
}

export function Tracking() {
  const { tenantSlug, ticketId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const justSubmitted = Boolean((location.state as { justSubmitted?: boolean } | null)?.justSubmitted)

  const tokenFromRoute = ticketId && isTrackingToken(ticketId) ? ticketId : null
  const showLookup = !tokenFromRoute

  const [lookupDisplayId, setLookupDisplayId] = useState(
    ticketId && !isTrackingToken(ticketId) ? ticketId : '',
  )
  const [lookupPhone, setLookupPhone] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)

  const [tracking, setTracking] = useState<PublicTracking | null | undefined>(
    tokenFromRoute ? undefined : null,
  )
  const [messageOpen, setMessageOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messageSent, setMessageSent] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState("We'll text you as soon as there's an update.")
  const [sending, setSending] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)

  useEffect(() => {
    if (!tokenFromRoute) {
      setTracking(null)
      return
    }
    setTracking(undefined)
    return subscribePublicTracking(tokenFromRoute, (row) => setTracking(row))
  }, [tokenFromRoute])

  useEffect(() => {
    if (!justSubmitted || tracking === undefined || !tracking) return
    setToastMessage("We've texted your ticket number and will send updates here.")
    setToastVisible(true)
    const t = setTimeout(() => setToastVisible(false), 3500)
    return () => clearTimeout(t)
  }, [justSubmitted, tracking])

  async function handleLookup(e: FormEvent) {
    e.preventDefault()
    if (!lookupDisplayId.trim() || lookupPhone.replace(/\D/g, '').length < 10) {
      setLookupError('Enter your ticket number and the phone used on the case.')
      return
    }
    setLookupBusy(true)
    setLookupError('')
    try {
      const result = await callLookupTicketByPhone({
        displayId: lookupDisplayId.trim().toUpperCase(),
        customerPhone: lookupPhone.trim(),
        tenantSlug,
      })
      navigate(`/${result.tenantSlug}/track/${result.trackingToken}`, { replace: true })
    } catch (err) {
      setLookupError(
        err instanceof Error
          ? err.message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)$/, '')
          : 'Could not find a matching ticket.',
      )
    } finally {
      setLookupBusy(false)
    }
  }

  if (showLookup) {
    return (
      <div className="min-h-screen bg-page">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-12">
          <h1 className="text-2xl font-medium tracking-tight text-text-primary">Track your case</h1>
          <p className="mt-2 text-base text-text-secondary">
            Enter your ticket number and the mobile number you used when submitting. Private tracking
            links stay tied to your case.
          </p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void handleLookup(e)}>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">Ticket number</span>
              <Input
                autoFocus
                value={lookupDisplayId}
                onChange={(e) => {
                  setLookupDisplayId(e.target.value)
                  setLookupError('')
                }}
                placeholder="CB-10466"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">Mobile number</span>
              <Input
                type="tel"
                value={lookupPhone}
                onChange={(e) => {
                  setLookupPhone(e.target.value)
                  setLookupError('')
                }}
                placeholder="+1 (555) 000-0000"
              />
            </label>
            {lookupError && <p className="text-sm text-status-stuck-text">{lookupError}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={lookupBusy}>
              {lookupBusy ? 'Looking up…' : 'Find my case'}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-text-tertiary">
            Messages you send stay attached to this case for your specialist.
          </p>
        </div>
      </div>
    )
  }

  if (tracking === undefined) {
    return (
      <div className="min-h-screen bg-page">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8 sm:py-12">
          <TrackingSkeleton />
        </div>
      </div>
    )
  }

  if (!tracking || (tenantSlug && tracking.tenantSlug !== tenantSlug)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-4">
        <EmptyState
          icon={MessageSquare}
          title="We couldn't find that ticket"
          description="Use Find my case with your ticket number and phone, or open the private link from your text."
        />
      </div>
    )
  }

  const currentIndex = statusToIndex[tracking.status]
  const firstName = tracking.assigneeName?.split(' ')[0]
  const timing =
    tracking.promisedResponseAt
      ? `Promised by ${fullTimestamp(tracking.promisedResponseAt)}`
      : (tracking.expectedTiming ?? expectedTiming(tracking.status))
  const takeover = tracking.history.find((h) => h.action === 'takeover')
  const whatNext =
    tracking.whatHappensNext ||
    tracking.customerNextStep ||
    tracking.statusSentence

  const steps: TimelineStep[] = stepOrder.map((label, i) => {
    if (label === 'Received') {
      return { label, detail: 'Your case was logged and classified.' }
    }
    if (label === 'Assigned') {
      return {
        label,
        detail: tracking.assigneeName
          ? `${tracking.assigneeName} · ${tracking.departmentName} team`
          : undefined,
        annotation:
          takeover && i <= currentIndex
            ? `${takeover.actor.split(' ')[0]} took over your file · from ${takeover.previousActor?.split(' ')[0] ?? 'a teammate'}`
            : undefined,
      }
    }
    if (label === 'In progress') {
      return {
        label,
        detail:
          tracking.status === 'calling'
            ? `${firstName ?? 'Your specialist'} will contact you shortly.`
            : tracking.status === 'awaiting_confirmation'
              ? 'Waiting for you to confirm the resolution.'
              : 'Actively being worked on.',
      }
    }
    return { label, detail: 'Confirmed resolved and closed out.' }
  })

  const activity = [...tracking.history]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8)

  async function handleSendMessage() {
    if (!tracking?.trackingToken || !message.trim()) return
    setSending(true)
    try {
      await callSendCustomerMessage({
        trackingToken: tracking.trackingToken,
        message: message.trim(),
        customerName: 'Customer',
      })
      setMessageSent(true)
      setTimeout(() => {
        setMessageOpen(false)
        setMessageSent(false)
        setMessage('')
      }, 1100)
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Could not send message.')
      setToastVisible(true)
      setTimeout(() => setToastVisible(false), 3000)
    } finally {
      setSending(false)
    }
  }

  async function runCustomerAction(fn: () => Promise<unknown>, okMessage: string) {
    if (!tracking?.trackingToken) return
    setActionBusy(true)
    try {
      await fn()
      setToastMessage(okMessage)
      setToastVisible(true)
      setTimeout(() => setToastVisible(false), 3000)
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Action failed.')
      setToastVisible(true)
      setTimeout(() => setToastVisible(false), 3000)
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-control bg-accent text-xs font-medium text-text-inverse">
            {tracking.logoInitial}
          </div>
          <span className="text-sm font-medium text-text-secondary">{tracking.tenantName}</span>
        </div>

        <div className="rounded-card-lg border border-border bg-surface px-5 py-7">
          <p className="text-sm text-text-tertiary">Ticket number</p>
          <p className="mt-1.5 text-4xl font-medium tracking-tight text-text-primary">
            {tracking.displayId}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusPill status={tracking.status} />
            {timing && <span className="text-sm text-text-secondary">{timing}</span>}
          </div>
          <p className="mt-3 text-lg text-text-primary">{tracking.statusSentence}</p>
          <p className="mt-2 text-xs text-text-tertiary">
            Last update {relativeTime(tracking.updatedAt)} · {fullTimestamp(tracking.updatedAt)}
          </p>
        </div>

        <div className="mt-4 rounded-card-lg border border-border bg-surface px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            What happens next
          </p>
          <p className="mt-1.5 text-base text-text-primary">{whatNext}</p>
          {tracking.waitingForCustomer && (
            <p className="mt-2 text-sm text-status-stuck-text">We're waiting on a reply from you.</p>
          )}
          {tracking.waitingForInternal && (
            <p className="mt-2 text-sm text-text-secondary">Waiting on an internal team update.</p>
          )}
        </div>

        {tracking.assigneeName && (
          <div className="mt-4 flex items-center gap-3 rounded-card-lg border border-border bg-surface px-4 py-3">
            <Avatar initials={tracking.assigneeInitials ?? '??'} size="lg" />
            <div>
              <p className="text-base font-medium text-text-primary">
                {tracking.assigneeName} · {tracking.departmentName} team
              </p>
              <p className="text-sm text-text-secondary">named owner for your case</p>
            </div>
          </div>
        )}

        {(tracking.pendingCustomerConfirmation || tracking.status === 'awaiting_confirmation') && (
          <div className="mt-4 rounded-card-lg border border-border bg-surface px-4 py-4">
            <p className="text-base font-medium text-text-primary">Is this resolved?</p>
            <p className="mt-1 text-sm text-text-secondary">
              Your specialist marked the case ready to close. Confirm so we know you're set.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                variant="primary"
                disabled={actionBusy}
                onClick={() =>
                  void runCustomerAction(
                    () =>
                      callConfirmTicketResolution({
                        trackingToken: tracking.trackingToken,
                        confirm: true,
                      }),
                    'Case closed. Thank you.',
                  )
                }
              >
                Yes, close my case
              </Button>
              <Button
                variant="outline"
                disabled={actionBusy}
                onClick={() =>
                  void runCustomerAction(
                    () =>
                      callConfirmTicketResolution({
                        trackingToken: tracking.trackingToken,
                        confirm: false,
                      }),
                    'Got it — we reopened your case as high priority.',
                  )
                }
              >
                No, I still need help
              </Button>
            </div>
          </div>
        )}

        {tracking.status === 'solved' && (
          <div className="mt-4 rounded-card-lg border border-border bg-surface px-4 py-4">
            <p className="text-sm text-text-secondary">
              Problem returned? You can reopen this case and we'll prioritize it.
            </p>
            <Button
              variant="outline"
              className="mt-3"
              disabled={actionBusy}
              onClick={() =>
                void runCustomerAction(
                  () => callReopenTicket({ trackingToken: tracking.trackingToken }),
                  'Case reopened. The team has been alerted.',
                )
              }
            >
              Reopen case
            </Button>
          </div>
        )}

        <div className="mt-6 rounded-card-lg border border-border bg-surface px-5 py-5">
          <Timeline steps={steps} currentIndex={currentIndex} />
        </div>

        <div className="mt-4 rounded-card-lg border border-border bg-surface px-4 py-4">
          <p className="text-sm font-medium text-text-secondary">Recent activity</p>
          {activity.length === 0 ? (
            <p className="mt-2 text-sm text-text-tertiary">No updates yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {activity.map((entry) => (
                <li key={entry.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <p className="text-sm text-text-primary">{entry.note}</p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {entry.actor} · {fullTimestamp(entry.timestamp)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={() => setMessageOpen(true)}>
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Add a message
          </Button>
          {(tracking.isStuck || tracking.status === 'assigned' || tracking.status === 'opened') && (
            <Button
              variant="outline"
              className="flex-1"
              disabled={actionBusy}
              onClick={() =>
                void runCustomerAction(
                  () =>
                    callRequestTicketUpdate({
                      trackingToken: tracking.trackingToken,
                      message: 'Customer requested an update on this case.',
                    }),
                  'Update requested. A manager has been notified.',
                )
              }
            >
              Request an update
            </Button>
          )}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-card border border-border bg-surface px-3 py-3 text-sm text-text-secondary">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <p>
            Status texts are sent automatically when your case changes. We don't offer a separate SMS
            control here — keep this page bookmarked for the latest detail.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-text-tertiary">
          Messages stay attached to this case. Track anytime with your ticket number and phone.
        </p>
      </div>

      <Modal open={messageOpen} onClose={() => setMessageOpen(false)} title="Add a message">
        {messageSent ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-solved-bg text-status-solved-text">
              <Check className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-base font-medium text-text-primary">Message sent</p>
            <p className="text-sm text-text-secondary">
              {firstName ?? 'Your specialist'} will see this on your case. It stays attached to this
              ticket.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add any extra detail about your case..."
            />
            <p className="text-xs text-text-tertiary">
              Your message remains on this case for the assigned specialist.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setMessageOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!message.trim() || sending}
                onClick={() => void handleSendMessage()}
              >
                {sending ? 'Sending…' : 'Send message'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Toast visible={toastVisible}>{toastMessage}</Toast>
    </div>
  )
}

function TrackingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-40 rounded-card-lg" />
      <Skeleton className="h-16 rounded-card-lg" />
      <Skeleton className="h-64 rounded-card-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 flex-1" />
      </div>
    </div>
  )
}
