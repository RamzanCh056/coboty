import { HttpsError } from 'firebase-functions/v2/https'
import type { DecodedIdToken } from 'firebase-admin/auth'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { requireStaffSession } from './staffSession'
import type { StaffClaims, UserRole } from '../types'

export function requireStaffClaims(auth: DecodedIdToken | undefined): StaffClaims & { uid: string } {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const tenantId = auth.tenantId as string | undefined
  const role = auth.role as UserRole | undefined
  const departmentId = auth.departmentId as string | undefined
  if (!tenantId || !role || !departmentId) {
    throw new HttpsError(
      'failed-precondition',
      'Staff account is missing tenant claims. Ask an admin to re-provision this user.',
    )
  }
  return { uid: auth.uid, tenantId, role, departmentId }
}

/** Staff via Firestore `staf` session OR Firebase Auth custom claims. */
export async function requireStaffActor(
  request: CallableRequest,
): Promise<StaffClaims & { uid: string }> {
  const sessionId =
    typeof request.data?.sessionId === 'string' ? (request.data.sessionId as string) : undefined
  if (sessionId) {
    const session = await requireStaffSession(sessionId)
    return {
      uid: session.profile.id,
      tenantId: session.profile.tenantId,
      role: session.profile.role,
      departmentId: session.profile.departmentId,
    }
  }
  return requireStaffClaims(request.auth?.token)
}

export function assertSameTenant(claims: StaffClaims, tenantId: string) {
  if (claims.tenantId !== tenantId) {
    throw new HttpsError('permission-denied', 'Cross-tenant access is not allowed.')
  }
}

export function assertManagerOrAdmin(role: UserRole) {
  if (role !== 'manager' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Manager or admin role required.')
  }
}

export function assertCanMutate(role: UserRole) {
  if (role === 'readonly') {
    throw new HttpsError('permission-denied', 'Read-only accounts cannot change tickets.')
  }
}

export function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}
