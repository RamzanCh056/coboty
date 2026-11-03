import { useMemo, useState } from 'react'
import { Download, Lightbulb, Scale, TrendingDown } from 'lucide-react'
import { TopBar } from '../components/dashboard/TopBar'
import { MetricTile } from '../components/report/MetricTile'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { useAppData } from '../context/AppData'
import { catalogDepartment, catalogStaffMember } from '../data/catalog'
import { cn } from '../lib/cn'
import type { MetricCard, TeamRow, InsightCard } from '../data/report'

function hoursBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000)
}

export function Report() {
  const { currentTenant, currentUser, tickets, staff } = useAppData()
  const [exporting, setExporting] = useState(false)
  const [query, setQuery] = useState('')

  const metrics = useMemo((): MetricCard[] => {
    const solved = tickets.filter((t) => t.status === 'solved')
    const open = tickets.filter((t) => t.status !== 'solved')
    const avgResolution =
      solved.length === 0
        ? null
        : solved.reduce((sum, t) => sum + hoursBetween(t.createdAt, t.updatedAt), 0) / solved.length
    const stuckRate =
      tickets.length === 0 ? 0 : Math.round((tickets.filter((t) => t.isStuck).length / tickets.length) * 1000) / 10

    return [
      {
        label: 'Tickets solved',
        value: String(solved.length),
        delta: `${open.length} currently open`,
        trend: 'up',
        isGoodTrend: true,
      },
      {
        label: 'Avg. resolution time',
        value: avgResolution == null ? '—' : `${avgResolution.toFixed(1)}h`,
        delta: solved.length === 0 ? 'No solved tickets yet' : 'Based on closed tickets',
        trend: 'down',
        isGoodTrend: true,
      },
      (() => {
        const withCsat = tickets.filter(
          (t) => typeof t.csatScore === 'number' && t.csatScore != null,
        )
        const avg =
          withCsat.length === 0
            ? null
            : withCsat.reduce((sum, t) => sum + (t.csatScore as number), 0) / withCsat.length
        return {
          label: 'Satisfaction',
          value: avg == null ? '—' : avg.toFixed(1),
          delta:
            withCsat.length === 0
              ? 'No CSAT responses yet'
              : `${withCsat.length} response${withCsat.length === 1 ? '' : 's'}`,
          trend: 'up' as const,
          isGoodTrend: true,
        }
      })(),
      {
        label: 'Needs attention rate',
        value: `${stuckRate}%`,
        delta: `${tickets.filter((t) => t.isStuck).length} need attention now`,
        trend: stuckRate > 10 ? 'up' : 'down',
        isGoodTrend: stuckRate <= 10,
      },
    ]
  }, [tickets])

  const teamRows = useMemo((): TeamRow[] => {
    return staff.map((member) => {
      const mine = tickets.filter((t) => t.assignedTo === member.id)
      const solved = mine.filter((t) => t.status === 'solved')
      const withCsat = solved.filter((t) => typeof t.csatScore === 'number')
      const satisfaction =
        withCsat.length === 0
          ? 0
          : withCsat.reduce((sum, t) => sum + (t.csatScore as number), 0) / withCsat.length
      const avg =
        solved.length === 0
          ? 0
          : solved.reduce((sum, t) => sum + hoursBetween(t.createdAt, t.updatedAt), 0) / solved.length
      const volumeScore = Math.min(40, solved.length * 4)
      const speedScore = solved.length === 0 ? 0 : Math.max(0, 40 - avg * 2)
      const stuckPenalty = mine.filter((t) => t.isStuck).length * 5
      const blendedScore = Math.max(0, Math.min(100, Math.round(volumeScore + speedScore - stuckPenalty + 20)))
      return {
        staffId: member.id,
        ticketsSolved: solved.length,
        avgResponseHours: Math.round(avg * 10) / 10,
        reopenRate: 0,
        satisfaction: Math.round(satisfaction * 10) / 10,
        blendedScore,
        badge: undefined,
        workloadNote:
          mine.filter((t) => t.status !== 'solved').length >= 5
            ? 'High open workload — worth a staffing check-in.'
            : undefined,
      }
    })
  }, [staff, tickets])

  const insights = useMemo((): InsightCard[] => {
    const byDept = new Map<string, number>()
    for (const t of tickets.filter((x) => x.status !== 'solved')) {
      byDept.set(t.departmentId, (byDept.get(t.departmentId) ?? 0) + 1)
    }
    const top = [...byDept.entries()].sort((a, b) => b[1] - a[1])[0]
    const cards: InsightCard[] = []
    if (top) {
      const pct = tickets.length ? Math.round((top[1] / tickets.filter((t) => t.status !== 'solved').length) * 100) : 0
      const deptName = catalogDepartment(top[0])?.name ?? top[0]
      cards.push({
        title: 'Current bottleneck',
        description: `${deptName} holds ${top[1]} open tickets (${pct || 0}% of open volume).`,
        action: 'Rebalance assignments or add coverage on that team.',
      })
    } else {
      cards.push({
        title: 'Current bottleneck',
        description: 'Not enough open ticket data yet to spot a bottleneck.',
        action: 'Check back after more cases flow through the system.',
      })
    }
    cards.push({
      title: 'Most common issue',
      description: 'AI issue clustering ships with richer history — showing volume signal for now.',
      action: 'Review recent claim text in the dashboard for recurring themes.',
    })
    return cards
  }, [tickets])

  if (!currentTenant || !currentUser) return null

  function handleExport() {
    setExporting(true)
    window.setTimeout(() => {
      window.print()
      setExporting(false)
    }, 50)
  }

  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <TopBar tenant={currentTenant} user={currentUser} query={query} onQueryChange={setQuery} />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-4 py-5 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium text-text-primary">Monthly performance report</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {monthLabel} · {currentTenant.name}
            </p>
          </div>
          <Button variant="primary" className="print:hidden" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? 'Opening print…' : 'Save as PDF'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {metrics.map((metric) => (
            <MetricTile key={metric.label} metric={metric} />
          ))}
        </div>

        <section>
          <h2 className="mb-3 text-lg font-medium text-text-primary">Team efficiency</h2>
          {teamRows.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="No staff data yet"
              description="Seed staff users for this tenant to see efficiency scores."
            />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-text-tertiary">
                    <th className="px-5 py-3 font-medium">Teammate</th>
                    <th className="px-5 py-3 font-medium">Solved</th>
                    <th className="px-5 py-3 font-medium">Avg. response</th>
                    <th className="px-5 py-3 font-medium">Reopen rate</th>
                    <th className="px-5 py-3 font-medium">Satisfaction</th>
                    <th className="px-5 py-3 font-medium">Blended score</th>
                    <th className="px-5 py-3 font-medium">Recognition</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRows
                    .slice()
                    .filter((row) => {
                      if (!query.trim()) return true
                      const staffMember = catalogStaffMember(row.staffId)
                      return staffMember?.name.toLowerCase().includes(query.trim().toLowerCase())
                    })
                    .sort((a, b) => b.blendedScore - a.blendedScore)
                    .map((row) => {
                      const staffMember = catalogStaffMember(row.staffId)
                      if (!staffMember) return null
                      return (
                        <tr key={row.staffId} className="border-b border-border last:border-b-0">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar initials={staffMember.avatarInitials} size="sm" />
                              <div>
                                <div className="text-sm font-medium text-text-primary">{staffMember.name}</div>
                                <div className="text-xs text-text-tertiary">{staffMember.team}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-sm text-text-primary tabular-nums">
                            {row.ticketsSolved}
                          </td>
                          <td className="px-5 py-3 text-sm text-text-primary tabular-nums">
                            {row.avgResponseHours}h
                          </td>
                          <td className="px-5 py-3 text-sm text-text-tertiary tabular-nums">—</td>
                          <td className="px-5 py-3 text-sm tabular-nums text-text-primary">
                            {row.satisfaction > 0 ? row.satisfaction.toFixed(1) : '—'}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-page">
                                <div
                                  className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
                                  style={{ width: `${row.blendedScore}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium tabular-nums text-text-primary">
                                {row.blendedScore}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            {row.workloadNote && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full border border-border bg-page px-2.5 py-1 text-xs font-medium text-text-secondary',
                                )}
                                title={row.workloadNote}
                              >
                                <Scale className="h-3 w-3" aria-hidden="true" />
                                High workload
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </Card>
          )}
          <p className="mt-2 text-xs text-text-tertiary">
            Scores blend speed and volume from live tickets. Satisfaction and reopen rate appear once
            those signals are collected.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {insights.map((insight, i) => (
            <Card key={insight.title} className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-control bg-page text-text-secondary">
                  {i === 0 ? (
                    <TrendingDown className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Lightbulb className="h-4 w-4" aria-hidden="true" />
                  )}
                </div>
                <h3 className="text-base font-medium text-text-primary">{insight.title}</h3>
              </div>
              <p className="text-sm text-text-secondary">{insight.description}</p>
              <p className="rounded-control bg-page px-3 py-2 text-sm text-text-primary">
                Suggested action: {insight.action}
              </p>
            </Card>
          ))}
        </section>
      </main>
    </div>
  )
}
