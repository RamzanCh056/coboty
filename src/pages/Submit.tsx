import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Mic, MessageSquare } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import { useAppData } from '../context/AppData'

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10
}

export function Submit() {
  const { tenantSlug } = useParams()
  const { submitTicket, customerAccount } = useAppData()
  const navigate = useNavigate()

  const [customerName, setCustomerName] = useState(customerAccount?.name ?? '')
  const [customerPhone, setCustomerPhone] = useState('')
  const [claimText, setClaimText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!tenantSlug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-4">
        <EmptyState
          icon={MessageSquare}
          title="We couldn't find this company"
          description="Double-check the link you followed and try again."
        />
      </div>
    )
  }

  const canSubmit =
    customerName.trim().length > 1 && isValidPhone(customerPhone) && claimText.trim().length > 0

  async function handleSubmit() {
    if (!tenantSlug) return
    if (!customerName.trim() || !claimText.trim()) {
      setError('Please fill in your name and describe what happened.')
      return
    }
    if (!isValidPhone(customerPhone)) {
      setError('Enter a phone number so we can text you updates.')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      const result = await submitTicket({
        tenantSlug,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        claimText: claimText.trim(),
      })
      navigate(`/${result.tenantSlug}/track/${result.displayId}`, {
        state: { justSubmitted: true },
      })
    } catch (err) {
      setSubmitting(false)
      const message =
        (err as { message?: string }).message ??
        (err instanceof Error ? err.message : 'Could not create ticket.')
      setError(message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)$/, ''))
    }
  }

  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-12">
        {submitting ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <LoadingDots />
            <p className="text-lg font-medium text-text-primary">Got it — creating your ticket…</p>
            <p className="text-sm text-text-secondary">We'll text updates to {customerPhone.trim()}.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-control bg-accent text-xs font-medium text-text-inverse">
                C
              </div>
              <span className="text-sm font-medium text-text-secondary capitalize">{tenantSlug}</span>
            </div>

            <h1 className="text-2xl font-medium tracking-tight text-text-primary">What's going on?</h1>
            <p className="mt-2 text-base text-text-secondary">
              Tell us what happened — we'll get the right person on it. No account needed, takes about
              30 seconds.
            </p>

            <div className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text-secondary">Your name</span>
                <Input
                  autoFocus
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value)
                    setError('')
                  }}
                  placeholder="Jordan Lee"
                  autoComplete="name"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text-secondary">Mobile number</span>
                <Input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value)
                    setError('')
                  }}
                  placeholder="+1 (555) 000-0000"
                  autoComplete="tel"
                />
                <span className="text-xs text-text-tertiary">
                  We'll text your ticket number and status updates here.
                </span>
              </label>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-secondary">What happened?</span>
                <Textarea
                  value={claimText}
                  onChange={(e) => {
                    setClaimText(e.target.value)
                    setError('')
                  }}
                  placeholder="e.g. My washing machine started leaking again two days after the repair visit..."
                  className="min-h-40"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Add a voice message"
                    className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-border text-text-secondary opacity-40"
                    disabled
                  >
                    <Mic className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-status-stuck-text">{error}</p>}

            <Button
              variant="primary"
              className="mt-5 w-full"
              disabled={!canSubmit || submitting}
              onClick={() => void handleSubmit()}
            >
              Submit
            </Button>

            <p className="mt-6 text-center text-xs text-text-tertiary">
              No account needed. You'll get a ticket number and text updates as things progress.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function LoadingDots() {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-accent"
          style={{ animation: `loading-dot 1.1s ease-in-out ${i * 0.15}s infinite` }}
        />
      ))}
    </div>
  )
}
