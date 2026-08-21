import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import type {
  CustomerTicketSummary,
  Department,
  ManagerAlert,
  PublicTracking,
  StaffUser,
  TakeoverReason,
  Tenant,
  Ticket,
  TicketHistoryEntry,
} from '../../data/types'

function mapDocs<T extends { id: string }>(
  snap: { docs: { id: string; data: () => Record<string, unknown> }[] },
): T[] {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
}

export function subscribeTenant(tenantId: string, cb: (tenant: Tenant | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'tenants', tenantId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Tenant) : null)
  })
}

export function subscribeDepartments(
  tenantId: string,
  cb: (rows: Department[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'tenants', tenantId, 'departments'), (snap) => {
    cb(mapDocs<Department>(snap))
  })
}

export function subscribeUsers(tenantId: string, cb: (rows: StaffUser[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'tenants', tenantId, 'users'), (snap) => {
    cb(mapDocs<StaffUser>(snap))
  })
}

export function subscribeTickets(tenantId: string, cb: (rows: Ticket[]) => void): Unsubscribe {
  const q = query(collection(db, 'tenants', tenantId, 'tickets'), orderBy('updatedAt', 'desc'))
  return onSnapshot(q, (snap) => {
    cb(mapDocs<Ticket>(snap))
  })
}

export function subscribeTicketHistory(
  tenantId: string,
  ticketId: string,
  cb: (rows: TicketHistoryEntry[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'tenants', tenantId, 'tickets', ticketId, 'history'),
    orderBy('timestamp', 'asc'),
  )
  return onSnapshot(q, (snap) => {
    cb(mapDocs<TicketHistoryEntry>(snap))
  })
}

export function subscribeAllHistoryForTenant(
  tenantId: string,
  tickets: Ticket[],
  cb: (rows: TicketHistoryEntry[]) => void,
): () => void {
  const unsubs: Unsubscribe[] = []
  const byTicket = new Map<string, TicketHistoryEntry[]>()

  const emit = () => {
    cb(Array.from(byTicket.values()).flat())
  }

  for (const ticket of tickets) {
    const unsub = subscribeTicketHistory(tenantId, ticket.id, (rows) => {
      byTicket.set(ticket.id, rows)
      emit()
    })
    unsubs.push(unsub)
  }

  return () => unsubs.forEach((u) => u())
}

export function subscribePublicTracking(
  trackingToken: string,
  cb: (row: PublicTracking | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'publicTracking', trackingToken), (snap) => {
    cb(snap.exists() ? (snap.data() as PublicTracking) : null)
  })
}

export async function callSubmitTicket(input: {
  tenantSlug: string
  customerName: string
  customerPhone: string
  claimText: string
}): Promise<{ displayId: string; ticketId: string; tenantSlug: string; trackingToken: string }> {
  const fn = httpsCallable<
    typeof input,
    { displayId: string; ticketId: string; tenantSlug: string; trackingToken: string }
  >(functions, 'submitTicket')
  const result = await fn(input)
  return result.data
}

export async function callLoginStaffFromFirestore(input: {
  email: string
  password: string
}): Promise<{ sessionId: string; profile: StaffUser }> {
  const fn = httpsCallable<typeof input, { sessionId: string; profile: StaffUser }>(
    functions,
    'loginStaffFromFirestore',
  )
  return (await fn(input)).data
}

export async function callLoadStaffWorkspace(sessionId: string): Promise<{
  profile: StaffUser
  tenant: Tenant
  departments: Department[]
  staff: StaffUser[]
  tickets: Ticket[]
  managerAlerts: ManagerAlert[]
}> {
  const fn = httpsCallable<
    { sessionId: string },
    {
      profile: StaffUser
      tenant: Tenant
      departments: Department[]
      staff: StaffUser[]
      tickets: Ticket[]
      managerAlerts: ManagerAlert[]
    }
  >(functions, 'loadStaffWorkspace')
  const data = (await fn({ sessionId })).data
  return { ...data, managerAlerts: data.managerAlerts ?? [] }
}

export async function callUpdateUnopenedSla(input: {
  tenantId: string
  hours: number
  sessionId?: string
}): Promise<{ ok: boolean; hours: number }> {
  const fn = httpsCallable<typeof input, { ok: boolean; hours: number }>(
    functions,
    'updateUnopenedSla',
  )
  return (await fn(input)).data
}

export async function callRunUnopenedSlaCheck(input: {
  sessionId?: string
}): Promise<{ ok: boolean; forwarded: number; warned: number; slaHours: number }> {
  const fn = httpsCallable<
    typeof input,
    { ok: boolean; forwarded: number; warned: number; slaHours: number }
  >(functions, 'runUnopenedSlaCheck')
  return (await fn(input)).data
}

export async function callLoadStaffTicketHistory(
  sessionId: string,
  ticketId: string,
): Promise<{ history: TicketHistoryEntry[] }> {
  const fn = httpsCallable<
    { sessionId: string; ticketId: string },
    { history: TicketHistoryEntry[] }
  >(functions, 'loadStaffTicketHistory')
  return (await fn({ sessionId, ticketId })).data
}

export async function callLogoutStaffSession(sessionId: string): Promise<{ ok: boolean }> {
  const fn = httpsCallable<{ sessionId: string }, { ok: boolean }>(functions, 'logoutStaffSession')
  return (await fn({ sessionId })).data
}

export async function callAssignTicket(input: {
  tenantId: string
  ticketId: string
  sessionId?: string
  action?: 'assign_to_me' | 'will_call' | 'mark_solved' | 'mark_opened'
}): Promise<{ ok: boolean; status: string; assignedTo: string | null }> {
  const fn = httpsCallable<typeof input, { ok: boolean; status: string; assignedTo: string | null }>(
    functions,
    'assignTicket',
  )
  return (await fn(input)).data
}

export async function callTakeoverTicket(input: {
  tenantId: string
  ticketId: string
  reason: TakeoverReason
  note?: string
  sessionId?: string
}): Promise<{ ok: boolean; smsPreview: string }> {
  const fn = httpsCallable<typeof input, { ok: boolean; smsPreview: string }>(functions, 'takeoverTicket')
  return (await fn(input)).data
}

export async function callReassignTicket(input: {
  tenantId: string
  ticketId: string
  assigneeId: string
  sessionId?: string
}): Promise<{ ok: boolean }> {
  const fn = httpsCallable<typeof input, { ok: boolean }>(functions, 'reassignTicket')
  return (await fn(input)).data
}

export async function callSendCustomerMessage(input: {
  trackingToken: string
  message: string
  customerName?: string
}): Promise<{ ok: boolean }> {
  const fn = httpsCallable<typeof input, { ok: boolean }>(functions, 'sendCustomerMessage')
  return (await fn(input)).data
}

export async function callLookupTicketByPhone(input: {
  displayId: string
  customerPhone: string
  tenantSlug?: string
}): Promise<{ trackingToken: string; tenantSlug: string; displayId: string; ticketId: string }> {
  const fn = httpsCallable<
    typeof input,
    { trackingToken: string; tenantSlug: string; displayId: string; ticketId: string }
  >(functions, 'lookupTicketByPhone')
  return (await fn(input)).data
}

export async function callRequestTicketUpdate(input: {
  trackingToken: string
  message?: string
}): Promise<{ ok: boolean }> {
  const fn = httpsCallable<typeof input, { ok: boolean }>(functions, 'requestTicketUpdate')
  return (await fn(input)).data
}

export async function callConfirmTicketResolution(input: {
  trackingToken: string
  confirm: boolean
}): Promise<{ ok: boolean }> {
  const fn = httpsCallable<typeof input, { ok: boolean }>(functions, 'confirmTicketResolution')
  return (await fn(input)).data
}

export async function callReopenTicket(input: {
  trackingToken: string
}): Promise<{ ok: boolean }> {
  const fn = httpsCallable<typeof input, { ok: boolean }>(functions, 'reopenTicket')
  return (await fn(input)).data
}

export async function callUpdateTicketOps(input: {
  sessionId: string
  tenantId: string
  ticketId: string
  waitingForCustomer?: boolean
  waitingForInternal?: boolean
  customerNextStep?: string
  promisedResponseAt?: string
}): Promise<{ ok: boolean }> {
  const fn = httpsCallable<typeof input, { ok: boolean }>(functions, 'updateTicketOps')
  return (await fn(input)).data
}

export async function callMarkCustomerReplyRead(input: {
  sessionId: string
  tenantId: string
  ticketId: string
}): Promise<{ ok: boolean }> {
  const fn = httpsCallable<typeof input, { ok: boolean }>(functions, 'markCustomerReplyRead')
  return (await fn(input)).data
}

export async function callListMyTickets(): Promise<{ tickets: CustomerTicketSummary[] }> {
  const fn = httpsCallable<undefined, { tickets: CustomerTicketSummary[] }>(functions, 'listMyTickets')
  return (await fn()).data
}

export async function callClaimTicket(input: {
  displayId: string
  customerPhone: string
}): Promise<{ ok: boolean; displayId: string; tenantSlug: string }> {
  const fn = httpsCallable<
    typeof input,
    { ok: boolean; displayId: string; tenantSlug: string }
  >(functions, 'claimTicket')
  return (await fn(input)).data
}
