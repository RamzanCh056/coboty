import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Inbox, MessageSquare, UserCheck } from 'lucide-react'
import { TopBar } from '../components/dashboard/TopBar'
import { SummaryCard } from '../components/dashboard/SummaryCard'
import { DepartmentFilters } from '../components/dashboard/DepartmentFilters'
import { TicketRow } from '../components/dashboard/TicketRow'
import { TicketDetailModal } from '../components/dashboard/TicketDetailModal'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { getStaffDepartment, catalogDepartment, catalogStaffMember } from '../data/catalog'
import type { Ticket, TakeoverReason } from '../data/types'
import { useAppData } from '../context/AppData'
import { subscribeTicketHistory } from '../lib/firebase/data'
import { Select } from '../components/ui/Input'

type SummaryFilter = 'new' | 'mine' | 'stuck' | 'replies' | null
type SortMode = 'needs_attention' | 'oldest' | 'newest' | 'recently_updated'

export function Dashboard() {
  const {
    currentTenantId,
    currentTenant,
    currentUser,
    role,
    departments,
    staff,
    tickets: allTickets,
    managerAlerts,
    assignTicket,
    takeoverTicket,
    reassignTicket,
    updateTicketOps,
    markCustomerReplyRead,
    setTicketHistory,
    historyForTicket,
    staffSessionId,
    loadTicketHistory,
  } = useAppData()

  const isManager = role === 'manager' || role === 'admin'
  const homeDepartment = currentUser ? getStaffDepartment(currentUser) : null
  const allowedDepartmentIds = isManager ? null : homeDepartment ? [homeDepartment.id] : []

  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>(null)
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('needs_attention')
  const [query, setQuery] = useState('')
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null)

  useEffect(() => {
    setDepartmentFilter(isManager ? null : (homeDepartment?.id ?? null))
  }, [currentUser?.id, isManager, homeDepartment?.id])

  useEffect(() => {
    if (!currentTenantId || !activeTicketId) return
    if (staffSessionId) {
      void loadTicketHistory(activeTicketId)
      return
    }
    return subscribeTicketHistory(currentTenantId, activeTicketId, (rows) => {
      setTicketHistory(activeTicketId, rows)
    })
  }, [currentTenantId, activeTicketId, setTicketHistory, staffSessionId, loadTicketHistory])

  const tickets = useMemo(() => {
    return allTickets.filter((t) => {
      if (!t.departmentId) return !allowedDepartmentIds
      return !allowedDepartmentIds || allowedDepartmentIds.includes(t.departmentId)
    })
  }, [allTickets, allowedDepartmentIds])

  const counts = useMemo(
    () => ({
      new: tickets.filter((t) => t.status === 'new').length,
      mine: tickets.filter(
        (t) => currentUser && t.assignedTo === currentUser.id && t.status !== 'solved',
      ).length,
      stuck: tickets.filter((t) => t.isStuck).length,
      replies: tickets.filter((t) => t.hasUnreadCustomerReply).length,
    }),
    [tickets, currentUser],
  )

  const filteredTickets = useMemo(() => {
    const rows = tickets
      .filter((t) => {
        if (summaryFilter === 'new') return t.status === 'new'
        if (summaryFilter === 'mine')
          return Boolean(currentUser && t.assignedTo === currentUser.id && t.status !== 'solved')
        if (summaryFilter === 'stuck') return t.isStuck
        if (summaryFilter === 'replies') return Boolean(t.hasUnreadCustomerReply)
        return true
      })
      .filter((t) => (departmentFilter ? t.departmentId === departmentFilter : true))
      .filter((t) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return (
          t.displayId.toLowerCase().includes(q) ||
          t.customerName.toLowerCase().includes(q) ||
          t.summary.toLowerCase().includes(q)
        )
      })

    const sorted = [...rows]
    sorted.sort((a, b) => {
      switch (sortMode) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'recently_updated':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        case 'needs_attention':
        default: {
          const score = (t: Ticket) =>
            (t.hasUnreadCustomerReply ? 4 : 0) +
            (t.isStuck ? 3 : 0) +
            (t.status === 'new' ? 2 : 0) +
            (t.status === 'awaiting_confirmation' ? 1 : 0)
          const diff = score(b) - score(a)
          if (diff !== 0) return diff
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        }
      }
    })
    return sorted
  }, [tickets, summaryFilter, departmentFilter, query, currentUser, sortMode])

  if (!currentUser || !currentTenant || !currentTenantId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page px-6 text-center">
        <p className="text-base font-medium text-text-primary">Setting up your workspace…</p>
        <p className="max-w-sm text-sm text-text-secondary">
          Your company data is still loading. If this stays here, log out and log in again.
        </p>
        <Link to="/login" className="focus-ring text-sm font-medium text-text-primary underline">
          Back to login
        </Link>
      </div>
    )
  }

  const activeTicket = tickets.find((t) => t.id === activeTicketId) ?? null
  const solvedThisWeek = tickets.filter((t) => t.status === 'solved').length

  async function runAction(ticketId: string, fn: () => Promise<void>) {
    setActionError('')
    setBusyTicketId(ticketId)
    try {
      await fn()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusyTicketId(null)
    }
  }

  function openTicket(ticket: Ticket) {
    setActiveTicketId(ticket.id)
    if (ticket.hasUnreadCustomerReply) {
      void markCustomerReplyRead(ticket.id)
    }
  }

  function handlePrimaryAction(ticket: Ticket) {
    if (ticket.isStuck) {
      openTicket(ticket)
      return
    }
    if (ticket.status === 'new') {
      void runAction(ticket.id, () => assignTicket(ticket.id, 'assign_to_me'))
    } else if (ticket.status === 'assigned' || ticket.status === 'opened') {
      void runAction(ticket.id, () => assignTicket(ticket.id, 'will_call'))
    } else if (ticket.status === 'calling') {
      void runAction(ticket.id, () => assignTicket(ticket.id, 'mark_solved'))
    }
  }

  function handleReassign(ticket: Ticket, staffId: string) {
    void runAction(ticket.id, () => reassignTicket(ticket.id, staffId))
  }

  function handleTakeover(ticket: Ticket, reason: TakeoverReason, note: string) {
    void runAction(ticket.id, async () => {
      await takeoverTicket(ticket.id, reason, note)
      setActiveTicketId(null)
    })
  }

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <TopBar tenant={currentTenant} user={currentUser} query={query} onQueryChange={setQuery} />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
        {actionError && (
          <p className="rounded-control border border-status-stuck-bg bg-status-stuck-bg/40 px-3 py-2 text-sm text-status-stuck-text">
            {actionError}
          </p>
        )}

        {isManager && managerAlerts.length > 0 && (
          <div className="flex flex-col gap-2 rounded-card border border-status-stuck-bg bg-status-stuck-bg/30 px-4 py-3">
            <p className="text-sm font-medium text-status-stuck-text">Manager alerts</p>
            {managerAlerts.slice(0, 4).map((alert) => (
              <p key={alert.id} className="text-sm text-text-secondary">
                {alert.message}
              </p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4 lg:grid-cols-4">
          <SummaryCard
            label="New"
            count={counts.new}
            icon={Inbox}
            active={summaryFilter === 'new'}
            onClick={() => setSummaryFilter((f) => (f === 'new' ? null : 'new'))}
          />
          <SummaryCard
            label="Mine"
            count={counts.mine}
            icon={UserCheck}
            active={summaryFilter === 'mine'}
            onClick={() => setSummaryFilter((f) => (f === 'mine' ? null : 'mine'))}
          />
          <SummaryCard
            label="Needs attention"
            count={counts.stuck}
            icon={AlertTriangle}
            tone="warning"
            active={summaryFilter === 'stuck'}
            onClick={() => setSummaryFilter((f) => (f === 'stuck' ? null : 'stuck'))}
          />
          <SummaryCard
            label="Customer replies"
            count={counts.replies}
            icon={MessageSquare}
            active={summaryFilter === 'replies'}
            onClick={() => setSummaryFilter((f) => (f === 'replies' ? null : 'replies'))}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DepartmentFilters
            departments={departments}
            active={departmentFilter}
            onChange={setDepartmentFilter}
            allowedDepartmentIds={allowedDepartmentIds}
          />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="shrink-0">Sort</span>
            <Select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="min-w-[11rem]"
            >
              <option value="needs_attention">Needs attention first</option>
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
              <option value="recently_updated">Recently updated</option>
            </Select>
          </label>
        </div>

        <div className="overflow-hidden rounded-card-lg border border-border bg-surface">
          {!currentTenantId ? (
            <div className="flex flex-col">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 flex-[2]" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No tickets match these filters"
              description="Try clearing a filter or searching for something else."
            />
          ) : (
            filteredTickets.map((ticket) => {
              const department = catalogDepartment(ticket.departmentId)
              if (!department) return null
              return (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  department={department}
                  assignee={catalogStaffMember(ticket.assignedTo)}
                  onOpen={openTicket}
                  onPrimaryAction={handlePrimaryAction}
                />
              )
            })
          )}
        </div>

        <footer className="mt-auto border-t border-border pt-4 text-sm text-text-tertiary">
          {solvedThisWeek} resolved ·{' '}
          <Link
            to="/report"
            className="focus-ring rounded-control font-medium text-text-secondary underline-offset-2 transition-colors duration-150 ease-out hover:text-text-primary hover:underline"
          >
            Full performance report
          </Link>
          {busyTicketId && <span className="ml-2">Updating…</span>}
        </footer>
      </main>

      <TicketDetailModal
        ticket={activeTicket}
        department={activeTicket ? catalogDepartment(activeTicket.departmentId) : null}
        assignee={activeTicket ? catalogStaffMember(activeTicket.assignedTo) : null}
        currentUser={currentUser}
        tenantStaff={staff}
        history={activeTicket ? historyForTicket(activeTicket.id) : []}
        open={activeTicketId !== null}
        onClose={() => setActiveTicketId(null)}
        onPrimaryAction={handlePrimaryAction}
        onReassign={handleReassign}
        onTakeover={handleTakeover}
        onUpdateOps={(ticket, patch) =>
          void runAction(ticket.id, () => updateTicketOps({ ticketId: ticket.id, ...patch }))
        }
      />
    </div>
  )
}
