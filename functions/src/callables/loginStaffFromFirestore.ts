import { randomBytes, timingSafeEqual } from 'node:crypto'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { initialsFromName } from '../helpers/auth'
import { assertRateLimit } from '../helpers/sms'
import { requireStaffSession, STAFF_SESSIONS, type StaffSession } from '../helpers/staffSession'
import type {
  Department,
  ManagerAlert,
  StaffUser,
  Tenant,
  Ticket,
  TicketHistoryEntry,
  UserRole,
} from '../types'

const DEFAULT_TENANT_ID = 'tn_fenwick'
const DEFAULT_DEPARTMENT_ID = 'dep_repair'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
})

const sessionSchema = z.object({
  sessionId: z.string().min(16).max(128),
})

function passwordsMatch(actual: unknown, supplied: string): boolean {
  if (typeof actual !== 'string') return false
  const left = Buffer.from(actual)
  const right = Buffer.from(supplied)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function ensureDefaultTenant(tenantId: string): Promise<Tenant> {
  const tenantRef = db.collection('tenants').doc(tenantId)
  const existing = await tenantRef.get()
  if (existing.exists) {
    return { id: existing.id, ...existing.data() } as Tenant
  }

  const now = new Date().toISOString()
  const tenant: Tenant = {
    id: tenantId,
    name: 'Fenwick Home Services',
    subdomain: 'fenwick',
    plan: 'growth',
    config: { primaryColor: '#18181b', logoInitial: 'F', ticketPrefix: 'CB', unopenedSlaHours: 3 },
    configJson: { primaryColor: '#18181b', logoInitial: 'F', ticketPrefix: 'CB', unopenedSlaHours: 3 },
    createdAt: now,
  }
  await tenantRef.set(tenant)

  const departments = [
    {
      id: 'dep_repair',
      tenantId,
      name: 'Repair',
      slug: 'repair',
      routingKeywords: ['leak', 'broken', 'repair', 'fix', 'damage'],
    },
    {
      id: 'dep_finance',
      tenantId,
      name: 'Finance',
      slug: 'finance',
      routingKeywords: ['bill', 'invoice', 'payment', 'charge', 'refund'],
    },
    {
      id: 'dep_sales',
      tenantId,
      name: 'Sales',
      slug: 'sales',
      routingKeywords: ['quote', 'upgrade', 'buy', 'purchase', 'new service'],
    },
    {
      id: 'dep_logistics',
      tenantId,
      name: 'Logistics',
      slug: 'logistics',
      routingKeywords: ['delivery', 'schedule', 'appointment', 'technician', 'arrival'],
    },
  ]

  const batch = db.batch()
  for (const dept of departments) {
    batch.set(tenantRef.collection('departments').doc(dept.id), dept)
  }
  await batch.commit()
  return tenant
}

export const loginStaffFromFirestore = onCall({ cors: true }, async (request) => {
  try {
    assertRateLimit(`staff-login:${request.rawRequest.ip ?? 'unknown'}`, 10, 60_000)
  } catch {
    throw new HttpsError('resource-exhausted', 'Too many login attempts. Try again shortly.')
  }

  const parsed = loginSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Enter a valid email and password.')
  }

  const email = parsed.data.email.toLowerCase()
  const snap = await db.collection('staf').where('email', '==', email).limit(1).get()
  const credential = snap.docs[0]
  if (!credential || !passwordsMatch(credential.data().password, parsed.data.password)) {
    throw new HttpsError('permission-denied', 'Invalid email or password.')
  }

  const data = credential.data()
  const tenantId = typeof data.tenantId === 'string' ? data.tenantId : DEFAULT_TENANT_ID
  const departmentId =
    typeof data.departmentId === 'string' ? data.departmentId : DEFAULT_DEPARTMENT_ID
  const allowedRoles: UserRole[] = ['admin', 'manager', 'agent', 'readonly']
  const role = allowedRoles.includes(data.role as UserRole)
    ? (data.role as UserRole)
    : 'agent'
  const name =
    typeof data.name === 'string' && data.name.trim()
      ? data.name.trim()
      : email.split('@')[0] ?? 'Staff'

  await ensureDefaultTenant(tenantId)

  const department = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('departments')
    .doc(departmentId)
    .get()
  const team = (department.data()?.name as string | undefined) ?? 'General'

  const profile: StaffUser = {
    id: credential.id,
    tenantId,
    name,
    email,
    role,
    departmentId,
    avatarInitials: initialsFromName(name),
    team,
    createdAt: new Date().toISOString(),
  }

  await db
    .collection('tenants')
    .doc(tenantId)
    .collection('users')
    .doc(profile.id)
    .set(profile, { merge: true })

  const sessionId = randomBytes(24).toString('hex')
  const now = Date.now()
  const session: StaffSession = {
    id: sessionId,
    email,
    profile,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  }
  await db.collection(STAFF_SESSIONS).doc(sessionId).set(session)

  return { sessionId, profile }
})

export const loadStaffWorkspace = onCall({ cors: true }, async (request) => {
  const parsed = sessionSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Missing staff session.')
  }
  const session = await requireStaffSession(parsed.data.sessionId)
  const tenantId = session.profile.tenantId

  await ensureDefaultTenant(tenantId)

  const [tenantSnap, departmentsSnap, usersSnap, ticketsSnap, alertsSnap] = await Promise.all([
    db.collection('tenants').doc(tenantId).get(),
    db.collection('tenants').doc(tenantId).collection('departments').get(),
    db.collection('tenants').doc(tenantId).collection('users').get(),
    db
      .collection('tenants')
      .doc(tenantId)
      .collection('tickets')
      .orderBy('updatedAt', 'desc')
      .limit(200)
      .get()
      .catch(async () => {
        // Fallback if index/order is unavailable.
        return db.collection('tenants').doc(tenantId).collection('tickets').limit(200).get()
      }),
    db
      .collection('tenants')
      .doc(tenantId)
      .collection('managerAlerts')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get()
      .catch(async () =>
        db.collection('tenants').doc(tenantId).collection('managerAlerts').limit(20).get(),
      ),
  ])

  const tenant = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant
  const departments = departmentsSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as Department,
  )
  const staff = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as StaffUser)
  const tickets = ticketsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Ticket)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  const managerAlerts = alertsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as ManagerAlert)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return {
    profile: session.profile,
    tenant,
    departments,
    staff,
    tickets,
    managerAlerts,
  }
})

export const loadStaffTicketHistory = onCall({ cors: true }, async (request) => {
  const schema = z.object({
    sessionId: z.string().min(16).max(128),
    ticketId: z.string().min(1),
  })
  const parsed = schema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid history request.')
  const session = await requireStaffSession(parsed.data.sessionId)
  const snap = await db
    .collection('tenants')
    .doc(session.profile.tenantId)
    .collection('tickets')
    .doc(parsed.data.ticketId)
    .collection('history')
    .orderBy('timestamp', 'asc')
    .get()
    .catch(async () =>
      db
        .collection('tenants')
        .doc(session.profile.tenantId)
        .collection('tickets')
        .doc(parsed.data.ticketId)
        .collection('history')
        .get(),
    )
  return {
    history: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TicketHistoryEntry),
  }
})

export const logoutStaffSession = onCall({ cors: true }, async (request) => {
  const parsed = sessionSchema.safeParse(request.data)
  if (!parsed.success) return { ok: true }
  await db.collection(STAFF_SESSIONS).doc(parsed.data.sessionId).delete().catch(() => undefined)
  return { ok: true }
})
