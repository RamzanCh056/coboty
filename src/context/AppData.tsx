import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import {
  callAssignTicket,
  callClaimTicket,
  callListMyTickets,
  callLoadStaffTicketHistory,
  callLoadStaffWorkspace,
  callLoginStaffFromFirestore,
  callLogoutStaffSession,
  callReassignTicket,
  callSubmitTicket,
  callTakeoverTicket,
  subscribeDepartments,
  subscribeTickets,
  subscribeTenant,
  subscribeUsers,
} from '../lib/firebase/data'
import { hydrateCatalog } from '../data/catalog'
import type {
  CustomerAccount,
  CustomerTicketSummary,
  Department,
  StaffUser,
  TakeoverReason,
  Tenant,
  Ticket,
  TicketHistoryEntry,
  UserRole,
} from '../data/types'

const STAFF_SESSION_KEY = 'cobotty:staffSession'

type StaffSessionState = {
  sessionId: string
  profile: StaffUser
}

interface AppDataContextValue {
  ready: boolean
  authReady: boolean
  currentTenantId: string | null
  currentTenant: Tenant | null
  currentUser: StaffUser | null
  customerAccount: CustomerAccount | null
  role: UserRole | null
  staffSessionId: string | null
  departments: Department[]
  staff: StaffUser[]
  tickets: Ticket[]
  history: TicketHistoryEntry[]
  login: (email: string, password: string) => Promise<StaffUser>
  loginCustomer: (email: string, password: string) => Promise<CustomerAccount>
  signupCustomer: (input: {
    name: string
    email: string
    password: string
  }) => Promise<CustomerAccount>
  logout: () => Promise<void>
  listMyTickets: () => Promise<CustomerTicketSummary[]>
  claimTicket: (displayId: string, customerPhone: string) => Promise<{
    displayId: string
    tenantSlug: string
  }>
  submitTicket: (input: {
    tenantSlug: string
    customerName: string
    customerPhone: string
    claimText: string
  }) => Promise<{ displayId: string; tenantSlug: string }>
  assignTicket: (
    ticketId: string,
    action?: 'assign_to_me' | 'will_call' | 'mark_solved' | 'mark_opened',
  ) => Promise<void>
  takeoverTicket: (ticketId: string, reason: TakeoverReason, note?: string) => Promise<string>
  reassignTicket: (ticketId: string, assigneeId: string) => Promise<void>
  historyForTicket: (ticketId: string) => TicketHistoryEntry[]
  setTicketHistory: (ticketId: string, entries: TicketHistoryEntry[]) => void
  loadTicketHistory: (ticketId: string) => Promise<void>
  refreshStaffWorkspace: () => Promise<void>
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

function toCustomerAccount(
  uid: string,
  email: string,
  name?: string | null,
): CustomerAccount {
  return {
    uid,
    email,
    name: name?.trim() || email.split('@')[0] || 'Customer',
  }
}

function readStaffSession(): StaffSessionState | null {
  try {
    const raw = localStorage.getItem(STAFF_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StaffSessionState
    if (!parsed?.sessionId || !parsed?.profile?.id) return null
    return parsed
  } catch {
    return null
  }
}

function writeStaffSession(session: StaffSessionState | null) {
  if (!session) {
    localStorage.removeItem(STAFF_SESSION_KEY)
    return
  }
  localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session))
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false)
  const [ready, setReady] = useState(false)
  const [staffSessionId, setStaffSessionId] = useState<string | null>(null)
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null)
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null)
  const [customerAccount, setCustomerAccount] = useState<CustomerAccount | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [historyByTicket, setHistoryByTicket] = useState<Record<string, TicketHistoryEntry[]>>({})
  const usingFirestoreStaff = useRef(false)

  const applyStaffWorkspace = useCallback(
    (workspace: {
      profile: StaffUser
      tenant: Tenant
      departments: Department[]
      staff: StaffUser[]
      tickets: Ticket[]
    }) => {
      setCustomerAccount(null)
      setCurrentUser(workspace.profile)
      setCurrentTenantId(workspace.profile.tenantId)
      setRole(workspace.profile.role)
      setCurrentTenant(workspace.tenant)
      setDepartments(workspace.departments)
      setStaff(workspace.staff)
      setTickets(workspace.tickets)
      hydrateCatalog({
        tenant: workspace.tenant,
        departments: workspace.departments,
        staff: workspace.staff,
      })
      setReady(true)
    },
    [],
  )

  const refreshStaffWorkspace = useCallback(async () => {
    if (!staffSessionId) return
    const workspace = await callLoadStaffWorkspace(staffSessionId)
    applyStaffWorkspace(workspace)
  }, [staffSessionId, applyStaffWorkspace])

  useEffect(() => {
    let cancelled = false
    let unsubAuth: (() => void) | undefined

    async function boot() {
      // Never leave the UI stuck on "Checking session…"
      const failSafe = window.setTimeout(() => {
        if (!cancelled) {
          setAuthReady(true)
          setReady(true)
        }
      }, 8000)

      try {
        const saved = readStaffSession()
        if (saved) {
          usingFirestoreStaff.current = true
          setStaffSessionId(saved.sessionId)
          try {
            const workspace = await callLoadStaffWorkspace(saved.sessionId)
            if (cancelled) return
            applyStaffWorkspace(workspace)
            writeStaffSession({ sessionId: saved.sessionId, profile: workspace.profile })
          } catch {
            if (cancelled) return
            writeStaffSession(null)
            usingFirestoreStaff.current = false
            setStaffSessionId(null)
            setCurrentUser(null)
            setCurrentTenantId(null)
            setRole(null)
            setReady(true)
          }
          return
        }

        unsubAuth = onAuthStateChanged(auth, async (user) => {
          if (usingFirestoreStaff.current) return
          if (!user) {
            setCurrentUser(null)
            setCustomerAccount(null)
            setCurrentTenantId(null)
            setRole(null)
            setAuthReady(true)
            setReady(true)
            return
          }

          const token = await user.getIdTokenResult(true)
          const tenantId = token.claims.tenantId as string | undefined
          const claimRole = token.claims.role as UserRole | undefined
          const departmentId = token.claims.departmentId as string | undefined

          if (tenantId && claimRole && departmentId) {
            setCustomerAccount(null)
            setCurrentTenantId(tenantId)
            setRole(claimRole)
            setAuthReady(true)
            return
          }

          setCurrentUser(null)
          setCurrentTenantId(null)
          setRole(null)
          setCustomerAccount(
            toCustomerAccount(user.uid, user.email ?? '', user.displayName),
          )
          setReady(true)
          setAuthReady(true)
        })
      } finally {
        window.clearTimeout(failSafe)
        if (!cancelled) {
          setAuthReady(true)
        }
      }
    }

    void boot()

    return () => {
      cancelled = true
      unsubAuth?.()
    }
  }, [applyStaffWorkspace])

  useEffect(() => {
    if (staffSessionId) {
      const timer = window.setInterval(() => {
        void refreshStaffWorkspace().catch(() => undefined)
      }, 4000)
      const onFocus = () => void refreshStaffWorkspace().catch(() => undefined)
      window.addEventListener('focus', onFocus)
      return () => {
        window.clearInterval(timer)
        window.removeEventListener('focus', onFocus)
      }
    }

    if (!currentTenantId || usingFirestoreStaff.current) {
      if (!currentTenantId) {
        hydrateCatalog({ tenant: null, departments: [], staff: [] })
        setCurrentTenant(null)
        setDepartments([])
        setStaff([])
        setTickets([])
        if (!customerAccount) setCurrentUser(null)
      }
      return
    }

    setReady(false)
    const unsubs = [
      subscribeTenant(currentTenantId, (tenant) => {
        setCurrentTenant(tenant)
        hydrateCatalog({ tenant })
        setReady(true)
      }),
      subscribeDepartments(currentTenantId, (rows) => {
        const withTenant = rows.map((r) => ({ ...r, tenantId: r.tenantId || currentTenantId }))
        setDepartments(withTenant)
        hydrateCatalog({ departments: withTenant })
      }),
      subscribeUsers(currentTenantId, (rows) => {
        const withTenant = rows.map((r) => ({ ...r, tenantId: r.tenantId || currentTenantId }))
        setStaff(withTenant)
        hydrateCatalog({ staff: withTenant })
        const uid = auth.currentUser?.uid
        if (uid) {
          setCurrentUser(withTenant.find((u) => u.id === uid) ?? null)
        }
      }),
      subscribeTickets(currentTenantId, setTickets),
    ]

    return () => unsubs.forEach((u) => u())
  }, [currentTenantId, customerAccount, staffSessionId, refreshStaffWorkspace])

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await callLoginStaffFromFirestore({
        email: email.trim().toLowerCase(),
        password,
      })

      // Load the workspace before exposing a staff session, so the dashboard
      // never renders without tenant data.
      const workspace = await callLoadStaffWorkspace(result.sessionId)

      usingFirestoreStaff.current = true
      writeStaffSession({ sessionId: result.sessionId, profile: workspace.profile })
      setStaffSessionId(result.sessionId)
      applyStaffWorkspace(workspace)
      setAuthReady(true)
      return workspace.profile
    },
    [applyStaffWorkspace],
  )

  const loginCustomer = useCallback(async (email: string, password: string) => {
    usingFirestoreStaff.current = false
    writeStaffSession(null)
    setStaffSessionId(null)
    const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
    const token = await cred.user.getIdTokenResult(true)
    if (token.claims.role) {
      await signOut(auth)
      throw new Error('This is a staff account. Use the Staff tab to sign in.')
    }
    const account = toCustomerAccount(
      cred.user.uid,
      cred.user.email ?? email,
      cred.user.displayName,
    )
    setCurrentUser(null)
    setCurrentTenantId(null)
    setRole(null)
    setCustomerAccount(account)
    return account
  }, [])

  const signupCustomer = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      usingFirestoreStaff.current = false
      writeStaffSession(null)
      setStaffSessionId(null)
      const email = input.email.trim().toLowerCase()
      const name = input.name.trim()
      const cred = await createUserWithEmailAndPassword(auth, email, input.password)
      if (name) {
        await updateProfile(cred.user, { displayName: name })
      }
      const account = toCustomerAccount(cred.user.uid, email, name)
      setCurrentUser(null)
      setCurrentTenantId(null)
      setRole(null)
      setCustomerAccount(account)
      return account
    },
    [],
  )

  const logout = useCallback(async () => {
    const sessionId = staffSessionId ?? readStaffSession()?.sessionId
    if (sessionId) {
      await callLogoutStaffSession(sessionId).catch(() => undefined)
    }
    writeStaffSession(null)
    usingFirestoreStaff.current = false
    setStaffSessionId(null)
    if (auth.currentUser) {
      await signOut(auth)
    }
    setCurrentUser(null)
    setCustomerAccount(null)
    setCurrentTenantId(null)
    setRole(null)
    setCurrentTenant(null)
    setDepartments([])
    setStaff([])
    setTickets([])
  }, [staffSessionId])

  const listMyTickets = useCallback(async () => {
    const result = await callListMyTickets()
    return result.tickets
  }, [])

  const claimTicket = useCallback(async (displayId: string, customerPhone: string) => {
    const result = await callClaimTicket({ displayId, customerPhone })
    return { displayId: result.displayId, tenantSlug: result.tenantSlug }
  }, [])

  const submitTicket = useCallback(
    async (input: {
      tenantSlug: string
      customerName: string
      customerPhone: string
      claimText: string
    }) => {
      const result = await callSubmitTicket(input)
      return { displayId: result.displayId, tenantSlug: result.tenantSlug }
    },
    [],
  )

  const assignTicket = useCallback(
    async (ticketId: string, action?: 'assign_to_me' | 'will_call' | 'mark_solved' | 'mark_opened') => {
      if (!currentTenantId) throw new Error('Not signed in to a tenant.')
      await callAssignTicket({
        tenantId: currentTenantId,
        ticketId,
        action,
        sessionId: staffSessionId ?? undefined,
      })
      await refreshStaffWorkspace()
    },
    [currentTenantId, staffSessionId, refreshStaffWorkspace],
  )

  const takeoverTicket = useCallback(
    async (ticketId: string, reason: TakeoverReason, note?: string) => {
      if (!currentTenantId) throw new Error('Not signed in to a tenant.')
      const result = await callTakeoverTicket({
        tenantId: currentTenantId,
        ticketId,
        reason,
        note,
        sessionId: staffSessionId ?? undefined,
      })
      await refreshStaffWorkspace()
      return result.smsPreview
    },
    [currentTenantId, staffSessionId, refreshStaffWorkspace],
  )

  const reassignTicket = useCallback(
    async (ticketId: string, assigneeId: string) => {
      if (!currentTenantId) throw new Error('Not signed in to a tenant.')
      await callReassignTicket({
        tenantId: currentTenantId,
        ticketId,
        assigneeId,
        sessionId: staffSessionId ?? undefined,
      })
      await refreshStaffWorkspace()
    },
    [currentTenantId, staffSessionId, refreshStaffWorkspace],
  )

  const setTicketHistory = useCallback((ticketId: string, entries: TicketHistoryEntry[]) => {
    setHistoryByTicket((prev) => ({ ...prev, [ticketId]: entries }))
  }, [])

  const loadTicketHistory = useCallback(
    async (ticketId: string) => {
      if (!staffSessionId) return
      const result = await callLoadStaffTicketHistory(staffSessionId, ticketId)
      setTicketHistory(ticketId, result.history)
    },
    [staffSessionId, setTicketHistory],
  )

  const history = useMemo(() => Object.values(historyByTicket).flat(), [historyByTicket])

  const historyForTicket = useCallback(
    (ticketId: string) =>
      (historyByTicket[ticketId] ?? []).slice().sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
    [historyByTicket],
  )

  const value = useMemo(
    () => ({
      ready,
      authReady,
      currentTenantId,
      currentTenant,
      currentUser,
      customerAccount,
      role,
      staffSessionId,
      departments,
      staff,
      tickets,
      history,
      login,
      loginCustomer,
      signupCustomer,
      logout,
      listMyTickets,
      claimTicket,
      submitTicket,
      assignTicket,
      takeoverTicket,
      reassignTicket,
      historyForTicket,
      setTicketHistory,
      loadTicketHistory,
      refreshStaffWorkspace,
    }),
    [
      ready,
      authReady,
      currentTenantId,
      currentTenant,
      currentUser,
      customerAccount,
      role,
      staffSessionId,
      departments,
      staff,
      tickets,
      history,
      login,
      loginCustomer,
      signupCustomer,
      logout,
      listMyTickets,
      claimTicket,
      submitTicket,
      assignTicket,
      takeoverTicket,
      reassignTicket,
      historyForTicket,
      setTicketHistory,
      loadTicketHistory,
      refreshStaffWorkspace,
    ],
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
