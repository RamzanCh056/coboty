import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { MessageSquare, Smartphone, Check } from 'lucide-react'
import type { PublicTracking, TicketStatus } from '../data/types'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Timeline, type TimelineStep } from '../components/ui/Timeline'
import { Modal } from '../components/ui/Modal'
import { Textarea } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { Toast } from '../components/ui/Toast'
import { StatusPill } from '../components/ui/Pill'
import { callSendCustomerMessage, subscribePublicTracking } from '../lib/firebase/data'
import { expectedTiming } from '../lib/ticketFlow'

const stepOrder: TimelineStep['label'][] = ['Received', 'Assigned', 'In progress', 'Solved']

const statusToIndex: Record<TicketStatus, number> = {
  new: 0,
  assigned: 1,
  opened: 2,
  calling: 2,
  solved: 3,
}

export function Tracking() {
  const { tenantSlug, ticketId } = useParams()
  const location = useLocation()
  const justSubmitted = Boolean((location.state as { justSubmitted?: boolean } | null)?.justSubmitted)

  const [tracking, setTracking] = useState<PublicTracking | null | undefined>(undefined)
  const [messageOpen, setMessageOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messageSent, setMessageSent] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState("We'll text you as soon as there's an update.")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!ticketId) return
    return subscribePublicTracking(ticketId, (row) => setTracking(row))
  }, [ticketId])

  useEffect(() => {
    if (!justSubmitted || tracking === undefined) return
    setToastMessage("We've texted your ticket number and will send updates here.")
    setToastVisible(true)
    const t = setTimeout(() => setToastVisible(false), 3500)
    return () => clearTimeout(t)
  }, [justSubmitted, tracking])

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
          description="Double-check the ticket number from your text message and try again."
        />
      </div>
    )
  }

  const currentIndex = statusToIndex[tracking.status]
  const firstName = tracking.assigneeName?.split(' ')[0]
  const timing = tracking.expectedTiming ?? expectedTiming(tracking.status)
  const takeover = tracking.history.find((h) => h.action === 'takeover')

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
            ? `${firstName ?? 'Your specialist'} will call you shortly.`
            : 'Actively being worked on.',
      }
    }
    return { label, detail: 'Confirmed resolved and closed out.' }
  })

  async function handleSendMessage() {
    if (!tracking || !message.trim()) return
    setSending(true)
    try {
      await callSendCustomerMessage({
        displayId: tracking.displayId,
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

  function handleSmsClick() {
    setToastMessage("We'll text you as soon as there's an update.")
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 3000)
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
        </div>

        {tracking.assigneeName && (
          <div className="mt-4 flex items-center gap-3 rounded-card-lg border border-border bg-surface px-4 py-3">
            <Avatar initials={tracking.assigneeInitials ?? '??'} size="lg" />
            <div>
              <p className="text-base font-medium text-text-primary">
                {tracking.assigneeName.split(' ')[0]} · {tracking.departmentName} team
              </p>
              <p className="text-sm text-text-secondary">is handling your request</p>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-card-lg border border-border bg-surface px-5 py-5">
          <Timeline steps={steps} currentIndex={currentIndex} />
        </div>

        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setMessageOpen(true)}>
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Add a message
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleSmsClick}>
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            Update via SMS
          </Button>
        </div>

        <p className="mt-8 text-center text-xs text-text-tertiary">
          No account needed. Track anytime with your ticket number.
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
              {firstName ?? 'Your specialist'} will see this on your case.
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
