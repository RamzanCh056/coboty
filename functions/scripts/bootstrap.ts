/**
 * Bootstrap Fenwick + Alderly tenants with departments and two Fenwick staff users.
 *
 * Usage:
 *   cd functions
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   # or: gcloud auth application-default login
 *   AGENT_PASSWORD='...' MANAGER_PASSWORD='...' npm run bootstrap
 *
 * Optional overrides:
 *   AGENT_EMAIL, MANAGER_EMAIL, AGENT_PASSWORD, MANAGER_PASSWORD
 */
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

if (getApps().length === 0) {
  try {
    initializeApp({ credential: applicationDefault() })
  } catch {
    initializeApp()
  }
}

const auth = getAuth()
const db = getFirestore()

const AGENT_EMAIL = (process.env.AGENT_EMAIL ?? 'andrew.chen@fenwickhs.com').toLowerCase()
const MANAGER_EMAIL = (process.env.MANAGER_EMAIL ?? 'sarah.okafor@fenwickhs.com').toLowerCase()
const AGENT_PASSWORD = process.env.AGENT_PASSWORD ?? process.env.BOOTSTRAP_PASSWORD
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD ?? process.env.BOOTSTRAP_PASSWORD

async function upsertAuthUser(email: string, password: string, displayName: string) {
  try {
    const existing = await auth.getUserByEmail(email)
    if (password) {
      await auth.updateUser(existing.uid, { password, displayName })
    }
    return existing
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code !== 'auth/user-not-found') throw err
    if (!password) {
      throw new Error(`Set AGENT_PASSWORD / MANAGER_PASSWORD (or BOOTSTRAP_PASSWORD) to create ${email}`)
    }
    return auth.createUser({ email, password, displayName })
  }
}

async function main() {
  const now = new Date().toISOString()

  const fenwick = {
    id: 'tn_fenwick',
    name: 'Fenwick Home Services',
    subdomain: 'fenwick',
    plan: 'growth' as const,
    config: { primaryColor: '#18181b', logoInitial: 'F', ticketPrefix: 'CB' },
    configJson: { primaryColor: '#18181b', logoInitial: 'F', ticketPrefix: 'CB' },
    createdAt: now,
  }

  const alderly = {
    id: 'tn_alderly',
    name: 'Alderly Insurance Group',
    subdomain: 'alderly',
    plan: 'scale' as const,
    config: { primaryColor: '#1d4ed8', logoInitial: 'A', ticketPrefix: 'AL' },
    configJson: { primaryColor: '#1d4ed8', logoInitial: 'A', ticketPrefix: 'AL' },
    createdAt: now,
  }

  await db.collection('tenants').doc(fenwick.id).set(fenwick)
  await db.collection('tenants').doc(alderly.id).set(alderly)

  const fenwickDepartments = [
    {
      id: 'dep_repair',
      tenantId: fenwick.id,
      name: 'Repair',
      slug: 'repair',
      routingKeywords: ['broken', 'leak', 'noise', 'not working', 'technician', 'oven', 'washer', 'dryer'],
    },
    {
      id: 'dep_finance',
      tenantId: fenwick.id,
      name: 'Finance',
      slug: 'finance',
      routingKeywords: ['invoice', 'refund', 'charge', 'billing', 'payment', 'fee'],
    },
    {
      id: 'dep_sales',
      tenantId: fenwick.id,
      name: 'Sales',
      slug: 'sales',
      routingKeywords: ['upgrade', 'quote', 'plan', 'new order', 'price', 'discount'],
    },
    {
      id: 'dep_logistics',
      tenantId: fenwick.id,
      name: 'Logistics',
      slug: 'logistics',
      routingKeywords: ['delivery', 'wrong item', 'shipment', 'driver', 'address'],
    },
  ]

  const alderlyDepartments = [
    {
      id: 'dep2_claims',
      tenantId: alderly.id,
      name: 'Claims',
      slug: 'repair',
      routingKeywords: ['accident', 'claim', 'adjuster', 'damage', 'inspection'],
    },
    {
      id: 'dep2_billing',
      tenantId: alderly.id,
      name: 'Billing',
      slug: 'finance',
      routingKeywords: ['premium', 'invoice', 'refund', 'charge', 'payment'],
    },
    {
      id: 'dep2_underwriting',
      tenantId: alderly.id,
      name: 'Underwriting',
      slug: 'sales',
      routingKeywords: ['quote', 'policy', 'coverage', 'renewal', 'price'],
    },
    {
      id: 'dep2_policyservices',
      tenantId: alderly.id,
      name: 'Policy Services',
      slug: 'logistics',
      routingKeywords: ['proof of insurance', 'documents', 'letter', 'certificate', 'address'],
    },
  ]

  for (const dep of [...fenwickDepartments, ...alderlyDepartments]) {
    await db.collection('tenants').doc(dep.tenantId).collection('departments').doc(dep.id).set(dep)
  }

  const agent = await upsertAuthUser(AGENT_EMAIL, AGENT_PASSWORD ?? '', 'Andrew Chen')
  await auth.setCustomUserClaims(agent.uid, {
    tenantId: fenwick.id,
    role: 'agent',
    departmentId: 'dep_repair',
  })
  await db.collection('tenants').doc(fenwick.id).collection('users').doc(agent.uid).set({
    id: agent.uid,
    tenantId: fenwick.id,
    name: 'Andrew Chen',
    email: AGENT_EMAIL,
    role: 'agent',
    departmentId: 'dep_repair',
    avatarInitials: 'AC',
    team: 'Repair',
    createdAt: now,
  })

  const manager = await upsertAuthUser(MANAGER_EMAIL, MANAGER_PASSWORD ?? '', 'Sarah Okafor')
  await auth.setCustomUserClaims(manager.uid, {
    tenantId: fenwick.id,
    role: 'manager',
    departmentId: 'dep_finance',
  })
  await db.collection('tenants').doc(fenwick.id).collection('users').doc(manager.uid).set({
    id: manager.uid,
    tenantId: fenwick.id,
    name: 'Sarah Okafor',
    email: MANAGER_EMAIL,
    role: 'manager',
    departmentId: 'dep_finance',
    avatarInitials: 'SO',
    team: 'Finance',
    createdAt: now,
  })

  // Minimal Alderly staff so second-tenant isolation can be verified.
  const alderlyAgentEmail = process.env.ALDERLY_AGENT_EMAIL ?? 'elena.kowalski@alderlyinsurance.com'
  const alderlyPassword = process.env.ALDERLY_AGENT_PASSWORD ?? MANAGER_PASSWORD ?? AGENT_PASSWORD
  if (alderlyPassword) {
    const alderlyAgent = await upsertAuthUser(alderlyAgentEmail, alderlyPassword, 'Elena Kowalski')
    await auth.setCustomUserClaims(alderlyAgent.uid, {
      tenantId: alderly.id,
      role: 'agent',
      departmentId: 'dep2_claims',
    })
    await db.collection('tenants').doc(alderly.id).collection('users').doc(alderlyAgent.uid).set({
      id: alderlyAgent.uid,
      tenantId: alderly.id,
      name: 'Elena Kowalski',
      email: alderlyAgentEmail.toLowerCase(),
      role: 'agent',
      departmentId: 'dep2_claims',
      avatarInitials: 'EK',
      team: 'Claims',
      createdAt: now,
    })
    console.log('Alderly agent:', alderlyAgentEmail)
  }

  console.log('Bootstrap complete.')
  console.log('Fenwick agent:', AGENT_EMAIL, agent.uid)
  console.log('Fenwick manager:', MANAGER_EMAIL, manager.uid)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
