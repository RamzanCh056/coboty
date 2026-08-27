export type TicketStatus = 'new' | 'assigned' | 'opened' | 'calling' | 'awaiting_confirmation' | 'solved'

export type UserRole = 'admin' | 'manager' | 'agent' | 'readonly'

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'

export type DepartmentSlug = 'repair' | 'finance' | 'sales' | 'logistics'

export type PreferredChannel = 'sms' | 'email'

export type ManagerAlertStatus = 'open' | 'acknowledged' | 'assigned' | 'resolved'

export type ManagerAlertType =
  | 'unopened_sla'
  | 'customer_escalation'
  | 'resolution_rejected'
  | 'customer_reply'
  | 'missed_promise'

export interface TenantConfig {
  primaryColor: string
  logoInitial: string
  ticketPrefix: string
  unopenedSlaHours?: number
}

export interface Tenant {
  id: string
  name: string
  subdomain: string
  plan: 'starter' | 'growth' | 'scale'
  config: TenantConfig
  /** Alias for architecture doc naming; mirrors `config`. */
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

export interface TicketAttachment {
  id: string
  name: string
  contentType: string
  size: number
  storagePath: string
  uploadedBy: string
  createdAt: string
  visibleToCustomer: boolean
}

export interface PublicAttachmentMeta {
  id: string
  name: string
  contentType: string
  size: number
  createdAt: string
}

export interface Ticket {
  id: string
  tenantId: string
  displayId: string
  customerName: string
  customerPhone: string
  customerUid?: string | null
  customerEmail?: string | null
  preferredChannel?: PreferredChannel
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
  trackingToken?: string | null
  waitingForCustomer?: boolean
  waitingForInternal?: boolean
  customerNextStep?: string | null
  promisedResponseAt?: string | null
  hasUnreadCustomerReply?: boolean
  resolutionEvidence?: string | null
  csatScore?: number | null
  csatComment?: string | null
  csatAt?: string | null
  lastMissedPromiseAlertAt?: string | null
  assignedAt?: string | null
  lastUnopenedSlaAt?: string | null
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
  | 'escalated'
  | 'reopened'
  | 'confirmed_closed'
  | 'resolution_rejected'
  | 'ops_update'
  | 'awaiting_confirmation'
  | 'csat'
  | 'attachment'

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

export interface Notification {
  id: string
  ticketId: string
  tenantId: string
  channel: 'sms' | 'whatsapp' | 'email'
  message: string
  sentAt: string
  status: 'delivered' | 'sent' | 'failed' | 'skipped'
}

export interface BillingEvent {
  id: string
  tenantId: string
  eventType: 'ticket_created' | 'sms_sent' | 'ai_classification' | 'email_sent'
  quantity: number
  timestamp: string
}

export type TakeoverReason =
  | 'colleague_unavailable'
  | 'wrong_department'
  | 'customer_escalated'
  | 'shift_change'

export interface ManagerAlert {
  id: string
  tenantId: string
  ticketId: string
  displayId: string
  type: ManagerAlertType
  message: string
  fromName: string
  toName: string | null
  hours: number
  createdAt: string
  read: boolean
  status: ManagerAlertStatus
  assignedToStaffId?: string | null
  acknowledgedAt?: string | null
  resolvedAt?: string | null
  resolvedBy?: string | null
}

/** Sanitized public projection — no phone or raw claim text. */
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
  trackingToken: string
  waitingForCustomer?: boolean
  waitingForInternal?: boolean
  customerNextStep?: string | null
  promisedResponseAt?: string | null
  whatHappensNext?: string | null
  pendingCustomerConfirmation?: boolean
  preferredChannel?: PreferredChannel
  resolutionEvidence?: string | null
  attachments?: PublicAttachmentMeta[]
  csatScore?: number | null
  canSubmitCsat?: boolean
}

export interface PublicHistoryItem {
  id: string
  action: TicketAction
  actor: string
  note: string
  timestamp: string
  previousActor?: string
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
  calling: 'awaiting_confirmation',
  awaiting_confirmation: 'solved',
  solved: null,
}

export interface CustomerAccount {
  uid: string
  email: string
  name: string
}

export interface CustomerTicketSummary {
  ticketId: string
  tenantId: string
  tenantSlug: string
  tenantName: string
  displayId: string
  trackingToken?: string
  status: TicketStatus
  summary: string
  updatedAt: string
  createdAt: string
  isStuck: boolean
}
