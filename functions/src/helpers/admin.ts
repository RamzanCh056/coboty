import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

if (getApps().length === 0) {
  initializeApp()
}

export const adminAuth = getAuth()
export const db = getFirestore()
export const bucket = getStorage().bucket()

// Optional fields (takeover reason, previous actor) are frequently absent.
db.settings({ ignoreUndefinedProperties: true })
