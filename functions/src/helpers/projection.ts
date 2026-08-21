import { db } from './admin'
import { expectedTiming, statusSentence } from './status'
import { ensureTicketTrackingToken } from './trackingToken'
import type {
  Department,
  PublicHistoryItem,
  PublicTracking,
  StaffUser,
  Tenant,
  Ticket,
  TicketHistoryEntry,
} from '../types'

export async function syncPublicTracking(input: {
  tenant: Tenant
  ticket: Ticket
  department: Department
  assignee: StaffUser | null
  history: TicketHistoryEntry[]
}): Promise<void> {
  const firstName = input.assignee?.name.split(' ')[0] ?? null
  const publicHistory: PublicHistoryItem[] = input.history
    .filter((h) => h.visibleToCustomer)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((h) => {
      const item: PublicHistoryItem = {
        id: h.id,
        action: h.action,
        actor: h.actor,
        note: h.note,
        timestamp: h.timestamp,
      }
      if (h.previousActor) item.previousActor = h.previousActor
      return item
    })

  // Ensure the ticket has a tracking token
  const trackingToken = await ensureTicketTrackingToken(input.ticket)
  
  const projection: PublicTracking = {
    displayId: input.ticket.displayId,
    tenantId: input.tenant.id,
    tenantSlug: input.tenant.subdomain,
    tenantName: input.tenant.name,
    logoInitial: input.tenant.config.logoInitial,
    ticketId: input.ticket.id,
    status: input.ticket.status,
    summary: input.ticket.summary,
    departmentName: input.department.name,
    assigneeName: input.assignee?.name ?? null,
    assigneeInitials: input.assignee?.avatarInitials ?? null,
    isStuck: input.ticket.isStuck,
    statusSentence: statusSentence(input.ticket.status, firstName),
    expectedTiming: expectedTiming(input.ticket.status),
    updatedAt: input.ticket.updatedAt,
    createdAt: input.ticket.createdAt,
    history: publicHistory,
    trackingToken,
    waitingForCustomer: input.ticket.waitingForCustomer,
    waitingForInternal: input.ticket.waitingForInternal,
    customerNextStep: input.ticket.customerNextStep,
    promisedResponseAt: input.ticket.promisedResponseAt,
    whatHappensNext: input.ticket.customerNextStep || statusSentence(input.ticket.status, firstName),
    pendingCustomerConfirmation: input.ticket.status === 'awaiting_confirmation',
  }

  // Write projection keyed by trackingToken
  await db.collection('publicTracking').doc(trackingToken).set(projection)
  
  // Clean up legacy projection by displayId if it exists and differs from token
  const legacyProjectionRef = db.collection('publicTracking').doc(input.ticket.displayId)
  const legacySnap = await legacyProjectionRef.get()
  if (legacySnap.exists && input.ticket.displayId !== trackingToken) {
    await legacyProjectionRef.delete()
  }
}

export async function loadVisibleHistory(
  tenantId: string,
  ticketId: string,
): Promise<TicketHistoryEntry[]> {
  const snap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('tickets')
    .doc(ticketId)
    .collection('history')
    .get()
  return snap.docs.map((d) => d.data() as TicketHistoryEntry)
}

export async function appendHistory(
  tenantId: string,
  ticketId: string,
  entry: Omit<TicketHistoryEntry, 'id' | 'ticketId' | 'tenantId'> & { id?: string },
): Promise<TicketHistoryEntry> {
  const col = db
    .collection('tenants')
    .doc(tenantId)
    .collection('tickets')
    .doc(ticketId)
    .collection('history')
  const ref = entry.id ? col.doc(entry.id) : col.doc()
  const full: TicketHistoryEntry = {
    id: ref.id,
    ticketId,
    tenantId,
    action: entry.action,
    actor: entry.actor,
    note: entry.note,
    visibleToCustomer: entry.visibleToCustomer,
    timestamp: entry.timestamp,
  }
  if (entry.previousActor) full.previousActor = entry.previousActor
  if (entry.reason) full.reason = entry.reason
  await ref.set(full)
  return full
}

export async function rebuildProjection(tenantId: string, ticketId: string): Promise<void> {
  const tenantSnap = await db.collection('tenants').doc(tenantId).get()
  const ticketSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('tickets')
    .doc(ticketId)
    .get()
  if (!tenantSnap.exists || !ticketSnap.exists) return

  const tenant = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant
  const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket
  const deptSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('departments')
    .doc(ticket.departmentId)
    .get()
  const department = { id: deptSnap.id, ...deptSnap.data() } as Department

  let assignee: StaffUser | null = null
  if (ticket.assignedTo) {
    const userSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('users')
      .doc(ticket.assignedTo)
      .get()
    if (userSnap.exists) {
      assignee = { id: userSnap.id, ...userSnap.data() } as StaffUser
    }
  }

  const history = await loadVisibleHistory(tenantId, ticketId)
  await syncPublicTracking({ tenant, ticket, department, assignee, history })
}
