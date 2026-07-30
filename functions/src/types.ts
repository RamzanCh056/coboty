export type TicketStatus = 'new' | 'assigned' | 'opened' | 'calling' | 'solved'
export type UserRole = 'admin' | 'manager' | 'agent' | 'readonly'
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type DepartmentSlug = 'repair' | 'finance' | 'sales' | 'logistics'

export interface TenantConfig {
  primaryColor: string
  logoInitial: string
  ticketPrefix: string
}

export interface Tenant {
  id: string
  name: string
  subdomain: string
  plan: 'starter' | 'growth' | 'scale'
  config: TenantConfig
  configJson?: TenantConfig
  createdAt: string
}

export interface StaffUser {
  id: string
  tenantId: string
  name: string
  email: string
  role: UserRole
  departmentId: string
  avatarInitials: string
  team: string
  createdAt?: string
}

export interface Department {
  id: string
  tenantId: string
  name: string
  slug: DepartmentSlug
  routingKeywords: string[]
}

export interface Ticket {
  id: string
  tenantId: string
  displayId: string
  customerName: string
  customerPhone: string
  customerUid?: string | null
  customerEmail?: string | null
  claimText: string
  summary: string
  departmentId: string
  status: TicketStatus
  assignedTo: string | null
  priority: TicketPriority
  createdAt: string
  updatedAt: string
  isStuck: boolean
  stuckSinceHours: number | null
}

export type TicketAction =
  | 'created'
  | 'assigned'
  | 'opened'
  | 'calling'
  | 'solved'
  | 'takeover'
  | 'note'
  | 'message'
  | 'received'

export type TakeoverReason =
  | 'colleague_unavailable'
  | 'wrong_department'
  | 'customer_escalated'
  | 'shift_change'

export interface TicketHistoryEntry {
  id: string
  ticketId: string
  tenantId: string
  action: TicketAction
  actor: string
  note: string
  visibleToCustomer: boolean
  timestamp: string
  previousActor?: string
  reason?: TakeoverReason
}

export interface NotificationDoc {
  id: string
  ticketId: string
  tenantId: string
  channel: 'sms' | 'whatsapp'
  message: string
  sentAt: string
  status: 'delivered' | 'sent' | 'failed' | 'skipped'
}

export interface BillingEvent {
  id: string
  tenantId: string
  eventType: 'ticket_created' | 'sms_sent' | 'ai_classification'
  quantity: number
  timestamp: string
}

export interface PublicHistoryItem {
  id: string
  action: TicketAction
  actor: string
  note: string
  timestamp: string
  previousActor?: string
}

export interface PublicTracking {
  displayId: string
  tenantId: string
  tenantSlug: string
  tenantName: string
  logoInitial: string
  ticketId: string
  status: TicketStatus
  summary: string
  departmentName: string
  assigneeName: string | null
  assigneeInitials: string | null
  isStuck: boolean
  statusSentence: string
  expectedTiming: string | null
  updatedAt: string
  createdAt: string
  history: PublicHistoryItem[]
}

export interface StaffClaims {
  tenantId: string
  role: UserRole
  departmentId: string
}

export const TAKEOVER_REASONS: TakeoverReason[] = [
  'colleague_unavailable',
  'wrong_department',
  'customer_escalated',
  'shift_change',
]

export const nextStatusMap: Record<TicketStatus, TicketStatus | null> = {
  new: 'assigned',
  assigned: 'opened',
  opened: 'calling',
  calling: 'solved',
  solved: null,
}

export const reasonLabels: Record<TakeoverReason, string> = {
  colleague_unavailable: 'colleague unavailable',
  wrong_department: 'wrong department',
  customer_escalated: 'customer escalated',
  shift_change: 'shift change',
}
