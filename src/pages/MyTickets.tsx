import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, LogOut, Plus, Ticket as TicketIcon } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusPill } from '../components/ui/Pill'
import { useAppData } from '../context/AppData'
import type { CustomerTicketSummary } from '../data/types'

const DEFAULT_TENANT_SLUG = 'fenwick'

export function MyTickets() {
  const { customerAccount, logout, listMyTickets, claimTicket } = useAppData()
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<CustomerTicketSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claimId, setClaimId] = useState('')
  const [claimPhone, setClaimPhone] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimMessage, setClaimMessage] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const rows = await listMyTickets()
      setTickets(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tickets.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function handleClaim(e: FormEvent) {
    e.preventDefault()
    setClaimBusy(true)
    setClaimMessage('')
    setError('')
    try {
      const result = await claimTicket(claimId.trim(), claimPhone.trim())
      setClaimMessage(`Linked ${result.displayId}.`)
      setClaimId('')
      setClaimPhone('')
      await refresh()
    } catch (err) {
      const message =
        (err as { message?: string }).message ??
        (err instanceof Error ? err.message : 'Could not link ticket.')
      setError(message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)$/, ''))
    } finally {
      setClaimBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-text-primary">My tickets</p>
            <p className="text-xs text-text-tertiary">{customerAccount?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => navigate(`/${DEFAULT_TENANT_SLUG}/submit`)}
            >
              <Plus className="h-4 w-4" />
              New case
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                void logout().then(() => navigate('/login'))
              }}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8">
        {loading ? (
          <p className="text-sm text-text-secondary">Loading your tickets…</p>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={TicketIcon}
            title="No tickets linked yet"
            description="Submit a new case while signed in, or link an existing ticket with your phone number."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {tickets.map((ticket) => (
              <Link
                key={ticket.ticketId}
                to={`/${ticket.tenantSlug}/track/${ticket.trackingToken || ticket.displayId}`}
                className="focus-ring block rounded-card-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{ticket.displayId}</p>
                    <p className="mt-1 text-sm text-text-secondary line-clamp-2">{ticket.summary}</p>
                    <p className="mt-2 text-xs text-text-tertiary">{ticket.tenantName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={ticket.status} />
                    <ArrowRight className="h-4 w-4 text-text-tertiary" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-status-stuck-text">{error}</p>}

        <Card className="p-5">
          <h2 className="text-base font-medium text-text-primary">Link an existing ticket</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Use the ticket number and the phone you submitted with.
          </p>
          <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => void handleClaim(e)}>
            <Input
              placeholder="Ticket number (e.g. CB-10466)"
              value={claimId}
              onChange={(e) => setClaimId(e.target.value)}
              required
            />
            <Input
              placeholder="Phone number on the ticket"
              value={claimPhone}
              onChange={(e) => setClaimPhone(e.target.value)}
              required
            />
            <Button type="submit" variant="outline" disabled={claimBusy}>
              {claimBusy ? 'Linking…' : 'Link ticket to my account'}
            </Button>
            {claimMessage && <p className="text-sm text-status-solved-text">{claimMessage}</p>}
          </form>
        </Card>
      </main>
    </div>
  )
}
