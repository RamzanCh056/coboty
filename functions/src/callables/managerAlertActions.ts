import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertManagerOrAdmin, assertSameTenant, requireStaffActor } from '../helpers/auth'
import type { ManagerAlert } from '../types'

const baseSchema = z.object({
  sessionId: z.string().min(16).max(128).optional(),
  tenantId: z.string().min(1),
  alertId: z.string().min(1),
})

async function loadAlert(tenantId: string, alertId: string): Promise<ManagerAlert> {
  const snap = await db.collection('tenants').doc(tenantId).collection('managerAlerts').doc(alertId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Alert not found.')
  return { id: snap.id, ...snap.data() } as ManagerAlert
}

export const acknowledgeManagerAlert = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  assertManagerOrAdmin(claims.role)
  const parsed = baseSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid alert payload.')
  const { tenantId, alertId } = parsed.data
  assertSameTenant(claims, tenantId)

  const alert = await loadAlert(tenantId, alertId)
  if (alert.status === 'resolved') {
    throw new HttpsError('failed-precondition', 'Alert is already resolved.')
  }

  const now = new Date().toISOString()
  await db.collection('tenants').doc(tenantId).collection('managerAlerts').doc(alertId).update({
    status: 'acknowledged',
    acknowledgedAt: now,
    read: true,
  })

  return { ok: true, status: 'acknowledged' }
})

const assignSchema = baseSchema.extend({
  assignedToStaffId: z.string().min(1),
})

export const assignManagerAlert = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  assertManagerOrAdmin(claims.role)
  const parsed = assignSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid alert assign payload.')
  const { tenantId, alertId, assignedToStaffId } = parsed.data
  assertSameTenant(claims, tenantId)

  const alert = await loadAlert(tenantId, alertId)
  if (alert.status === 'resolved') {
    throw new HttpsError('failed-precondition', 'Alert is already resolved.')
  }

  const userSnap = await db.collection('tenants').doc(tenantId).collection('users').doc(assignedToStaffId).get()
  if (!userSnap.exists) throw new HttpsError('not-found', 'Assignee not found.')

  await db.collection('tenants').doc(tenantId).collection('managerAlerts').doc(alertId).update({
    status: 'assigned',
    assignedToStaffId,
    read: true,
  })

  return { ok: true, status: 'assigned', assignedToStaffId }
})

export const resolveManagerAlert = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  assertManagerOrAdmin(claims.role)
  const parsed = baseSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid alert payload.')
  const { tenantId, alertId } = parsed.data
  assertSameTenant(claims, tenantId)

  const alert = await loadAlert(tenantId, alertId)
  if (alert.status === 'resolved') {
    return { ok: true, status: 'resolved', alreadyResolved: true }
  }

  const now = new Date().toISOString()
  await db.collection('tenants').doc(tenantId).collection('managerAlerts').doc(alertId).update({
    status: 'resolved',
    resolvedAt: now,
    resolvedBy: claims.uid,
    read: true,
  })

  return { ok: true, status: 'resolved' }
})
