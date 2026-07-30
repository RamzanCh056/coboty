import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { adminAuth, db } from '../helpers/admin'
import {
  assertManagerOrAdmin,
  assertSameTenant,
  initialsFromName,
  requireStaffClaims,
} from '../helpers/auth'
import type { UserRole } from '../types'

const schema = z.object({
  tenantId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'manager', 'agent', 'readonly']),
  departmentId: z.string().min(1),
})

export const createStaffUser = onCall({ cors: true }, async (request) => {
  const claims = requireStaffClaims(request.auth?.token)
  assertManagerOrAdmin(claims.role)
  const parsed = schema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid staff payload.')
  const data = parsed.data
  assertSameTenant(claims, data.tenantId)

  if (claims.role === 'manager' && data.role === 'admin') {
    throw new HttpsError('permission-denied', 'Managers cannot create admin accounts.')
  }

  const deptSnap = await db
    .collection('tenants')
    .doc(data.tenantId)
    .collection('departments')
    .doc(data.departmentId)
    .get()
  if (!deptSnap.exists) throw new HttpsError('not-found', 'Department not found.')
  const team = (deptSnap.data()?.name as string | undefined) ?? 'General'

  let user
  try {
    user = await adminAuth.createUser({
      email: data.email.toLowerCase(),
      password: data.password,
      displayName: data.name,
    })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'A user with that email already exists.')
    }
    throw err
  }

  const role = data.role as UserRole
  await adminAuth.setCustomUserClaims(user.uid, {
    tenantId: data.tenantId,
    role,
    departmentId: data.departmentId,
  })

  const now = new Date().toISOString()
  await db
    .collection('tenants')
    .doc(data.tenantId)
    .collection('users')
    .doc(user.uid)
    .set({
      id: user.uid,
      tenantId: data.tenantId,
      name: data.name,
      email: data.email.toLowerCase(),
      role,
      departmentId: data.departmentId,
      avatarInitials: initialsFromName(data.name),
      team,
      createdAt: now,
    })

  return { uid: user.uid }
})
