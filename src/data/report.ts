export interface MetricCard {
  label: string
  value: string
  delta: string
  trend: 'up' | 'down'
  isGoodTrend: boolean
}

export interface TeamRow {
  staffId: string
  ticketsSolved: number
  avgResponseHours: number
  reopenRate: number
  satisfaction: number
  blendedScore: number
  badge?: string
  workloadNote?: string
}

export interface InsightCard {
  title: string
  description: string
  action: string
}
