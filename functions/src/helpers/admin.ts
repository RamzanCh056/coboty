import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

if (getApps().length === 0) {
  initializeApp()
}

export const adminAuth = getAuth()
export const db = getFirestore()

// Optional fields (takeover reason, previous actor) are frequently absent.
db.settings({ ignoreUndefinedProperties: true })
