import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input, Textarea } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import { useAppData } from '../context/AppData'
import type { PreferredChannel } from '../data/types'
import { cn } from '../lib/cn'

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function Submit() {
  const { tenantSlug } = useParams()
  const { submitTicket, customerAccount, currentTenant } = useAppData()
  const navigate = useNavigate()
  const companyName = currentTenant?.name ?? tenantSlug?.replace(/-/g, ' ') ?? 'CoBotty'
  const logoInitial =
    currentTenant?.config.logoInitial ??
    (companyName.trim().charAt(0).toUpperCase() || 'C')

  const [customerName, setCustomerName] = useState(customerAccount?.name ?? '')
  const [customerPhone, setCustomerPhone] = useState('')
  const [preferredChannel, setPreferredChannel] = useState<PreferredChannel>('sms')
  const [customerEmail, setCustomerEmail] = useState(customerAccount?.email ?? '')
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

  const emailOk = preferredChannel !== 'email' || isValidEmail(customerEmail)
  const canSubmit =
    customerName.trim().length > 1 &&
    isValidPhone(customerPhone) &&
    claimText.trim().length > 0 &&
    emailOk

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
    if (preferredChannel === 'email' && !isValidEmail(customerEmail)) {
      setError('Enter a valid email address for updates.')
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
        preferredChannel,
        customerEmail:
          preferredChannel === 'email' ? customerEmail.trim() : customerEmail.trim() || undefined,
      })
      const trackId = result.trackingToken || result.displayId
      navigate(`/${result.tenantSlug}/track/${trackId}`, {
        state: { justSubmitted: true, displayId: result.displayId },
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
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-12">
        {submitting ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <LoadingDots />
            <p className="text-lg font-medium text-text-primary">Got it — creating your ticket…</p>
            <p className="text-sm text-text-secondary">
              {preferredChannel === 'email'
                ? `We'll email updates to ${customerEmail.trim()}.`
                : `We'll text updates to ${customerPhone.trim()}.`}
            </p>
          </Card>
        ) : (
          <Card className="px-5 py-6 sm:px-7 sm:py-8">
            <div className="mb-6 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-sm font-medium text-text-inverse">
                {logoInitial}
              </div>
              <div>
                <p className="text-sm font-medium capitalize text-text-primary">{companyName}</p>
                <p className="text-xs text-text-tertiary">Submit a case · about 30 seconds</p>
              </div>
            </div>

            <h1 className="text-2xl font-medium tracking-tight text-text-primary">What's going on?</h1>
            <p className="mt-2 text-base text-text-secondary">
              Describe the problem clearly. We'll assign a named owner and keep this case updated
              until it's resolved.
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
                  You'll need this number to look up your case.
                </span>
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text-secondary">Preferred updates</span>
                <div className="flex gap-2">
                  {(
                    [
                      { value: 'sms', label: 'Text' },
                      { value: 'email', label: 'Email' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setPreferredChannel(opt.value)
                        setError('')
                      }}
                      className={cn(
                        'focus-ring h-9 flex-1 rounded-control border text-sm font-medium transition-colors duration-150 ease-out',
                        preferredChannel === opt.value
                          ? 'border-accent bg-accent text-text-inverse'
                          : 'border-border bg-surface text-text-secondary hover:border-border-strong hover:bg-page',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {preferredChannel === 'email' && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-text-secondary">Email address</span>
                  <Input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => {
                      setCustomerEmail(e.target.value)
                      setError('')
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </label>
              )}

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
                <p className="text-xs text-text-tertiary">
                  Include what went wrong, when it started, and any reference numbers you already have.
                  You can add photos on the tracking page.
                </p>
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-status-stuck-text">{error}</p>}

            <Button
              variant="primary"
              className="mt-6 h-11 w-full"
              disabled={!canSubmit || submitting}
              onClick={() => void handleSubmit()}
            >
              Submit case
            </Button>

            <p className="mt-5 text-center text-xs text-text-tertiary">
              After you submit, a specialist owns your case. Track progress anytime with your ticket
              number and phone.
            </p>
          </Card>
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
