/**
 * Firestore Security Rules tests.
 * Run with: firebase emulators:exec --only firestore "npm --prefix tests/rules test"
 * or from repo root via npm run test:rules (after deps installed).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const PROJECT_ID = 'cobotty-rules-test'
let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'tenants/tn_fenwick'), {
      name: 'Fenwick',
      subdomain: 'fenwick',
    })
    await setDoc(doc(db, 'tenants/tn_alderly'), {
      name: 'Alderly',
      subdomain: 'alderly',
    })
    await setDoc(doc(db, 'tenants/tn_fenwick/tickets/tk1'), {
      displayId: 'CB-10001',
      status: 'new',
      tenantId: 'tn_fenwick',
    })
    await setDoc(doc(db, 'tenants/tn_alderly/tickets/tk2'), {
      displayId: 'AL-20001',
      status: 'new',
      tenantId: 'tn_alderly',
    })
    await setDoc(doc(db, 'publicTracking/CB-10001'), {
      displayId: 'CB-10001',
      tenantId: 'tn_fenwick',
      summary: 'Washer leak',
      status: 'new',
      history: [],
    })
  })
})

function fenwickAgent() {
  return testEnv.authenticatedContext('agent1', {
    tenantId: 'tn_fenwick',
    role: 'agent',
    departmentId: 'dep_repair',
  }).firestore()
}

function alderlyAgent() {
  return testEnv.authenticatedContext('agent2', {
    tenantId: 'tn_alderly',
    role: 'agent',
    departmentId: 'dep2_claims',
  }).firestore()
}

describe('tenant isolation', () => {
  it('allows same-tenant ticket read', async () => {
    await assertSucceeds(getDoc(doc(fenwickAgent(), 'tenants/tn_fenwick/tickets/tk1')))
  })

  it('denies cross-tenant ticket read', async () => {
    await assertFails(getDoc(doc(fenwickAgent(), 'tenants/tn_alderly/tickets/tk2')))
  })

  it('denies unauthenticated tenant ticket list', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDocs(collection(db, 'tenants/tn_fenwick/tickets')))
  })
})

describe('public tracking projection', () => {
  it('allows unauthenticated get by tracking token', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    const trackingToken = '1234567890abcdef1234567890abcdef1234567890abcdef'
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore()
      await setDoc(doc(adminDb, `publicTracking/${trackingToken}`), {
        trackingToken,
        displayId: 'CB-10001',
        tenantId: 'tn_fenwick',
        summary: 'Washer leak',
        status: 'new',
        history: [],
      })
    })
    await assertSucceeds(getDoc(doc(db, `publicTracking/${trackingToken}`)))
  })

  it('denies unauthenticated get by displayId', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'publicTracking/CB-10001')))
  })

  it('denies unauthenticated list of publicTracking', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDocs(collection(db, 'publicTracking')))
  })

  it('denies client writes to publicTracking', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(setDoc(doc(db, 'publicTracking/CB-99999'), { displayId: 'CB-99999' }))
  })
})

describe('role enforcement on direct writes', () => {
  it('denies agent direct ticket mutation', async () => {
    await assertFails(
      updateDoc(doc(fenwickAgent(), 'tenants/tn_fenwick/tickets/tk1'), { status: 'solved' }),
    )
  })

  it('denies manager direct ticket mutation (server-only writes)', async () => {
    const db = testEnv
      .authenticatedContext('mgr1', {
        tenantId: 'tn_fenwick',
        role: 'manager',
        departmentId: 'dep_finance',
      })
      .firestore()
    await assertFails(updateDoc(doc(db, 'tenants/tn_fenwick/tickets/tk1'), { assignedTo: 'x' }))
  })

  it('denies alderly agent writing fenwick ticket', async () => {
    await assertFails(
      updateDoc(doc(alderlyAgent(), 'tenants/tn_fenwick/tickets/tk1'), { status: 'assigned' }),
    )
  })
})
