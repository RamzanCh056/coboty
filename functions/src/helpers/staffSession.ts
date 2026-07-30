import { HttpsError } from 'firebase-functions/v2/https'
import { db } from './admin'
import type { StaffUser } from '../types'

const STAFF_SESSIONS = 'staffSessions'

export type StaffSession = {
  id: string
  email: string
  profile: StaffUser
  createdAt: string
  expiresAt: string
}

export async function requireStaffSession(sessionId: string | undefined): Promise<StaffSession> {
  if (!sessionId) {
    throw new HttpsError('unauthenticated', 'Staff session required.')
  }
  const snap = await db.collection(STAFF_SESSIONS).doc(sessionId).get()
  if (!snap.exists) {
    throw new HttpsError('unauthenticated', 'Session expired. Log in again.')
  }
  const session = { id: snap.id, ...snap.data() } as StaffSession
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await snap.ref.delete()
    throw new HttpsError('unauthenticated', 'Session expired. Log in again.')
  }
  return session
}

export { STAFF_SESSIONS }
