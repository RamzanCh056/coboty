import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useAppData } from '../context/AppData'
import { cn } from '../lib/cn'

type Tab = 'staff' | 'customer'
type CustomerMode = 'login' | 'signup'

const DEFAULT_TENANT_SLUG = 'fenwick'

export function Login() {
  const {
    login,
    loginCustomer,
    signupCustomer,
    authReady,
    currentUser,
    customerAccount,
    currentTenant,
  } = useAppData()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('staff')
  const [customerMode, setCustomerMode] = useState<CustomerMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const tenantSlug = currentTenant?.subdomain ?? DEFAULT_TENANT_SLUG

  useEffect(() => {
    if (!authReady) return
    if (currentUser) {
      navigate('/dashboard', { replace: true })
      return
    }
    if (customerAccount) {
      navigate('/my-tickets', { replace: true })
    }
  }, [authReady, currentUser, customerAccount, navigate])

  async function handleStaffSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(mapAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleCustomerSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (customerMode === 'signup') {
        await signupCustomer({ name, email, password })
      } else {
        await loginCustomer(email, password)
      }
      navigate('/my-tickets')
    } catch (err) {
      setError(mapAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const logo = currentTenant?.config.logoInitial ?? 'C'
  const company = currentTenant?.name ?? 'CoBotty'

  return (
    <div className="relative min-h-screen overflow-hidden bg-stone-100">
      <div
        className="absolute inset-0 bg-cover bg-[68%_center] md:bg-center"
        style={{ backgroundImage: "url('/cobotty-login-background.png')" }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-white/20" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/20 via-black/5 to-black/10"
        aria-hidden="true"
      />

      <main className="relative flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-[420px]">
          <Card className="border-white/80 bg-white/90 p-7 shadow-[0_28px_90px_-24px_rgba(24,24,27,0.5)] backdrop-blur-2xl sm:p-8">
            <div className="mb-7 flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-950 text-base font-semibold text-white shadow-lg shadow-black/20">
                {logo}
              </div>
              <p className="mt-3 text-base font-semibold tracking-tight text-zinc-950">{company}</p>
              <p className="mt-1 text-xs text-zinc-500">Customer care, simplified</p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-zinc-200/80 bg-zinc-100/80 p-1">
              <SegmentButton
                active={tab === 'staff'}
                onClick={() => {
                  setTab('staff')
                  setError('')
                  setName('')
                  setEmail('')
                  setPassword('')
                }}
              >
                Staff
              </SegmentButton>
              <SegmentButton
                active={tab === 'customer'}
                onClick={() => {
                  setTab('customer')
                  setError('')
                  setName('')
                  setEmail('')
                  setPassword('')
                }}
              >
                Customer
              </SegmentButton>
            </div>

            {tab === 'staff' ? (
              <>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-950">Welcome back</h2>
                <p className="mt-1.5 text-sm text-zinc-500">
                  Enter your work email or username, and password.
                </p>

                <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void handleStaffSubmit(e)}>
                  <Field
                    label="Email or username"
                    type="text"
                    autoFocus
                    autoComplete="username"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@company.com or manager"
                    clearError={() => setError('')}
                  />
                  <Field
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    clearError={() => setError('')}
                  />
                  {error && <p className="text-sm text-status-stuck-text">{error}</p>}
                  <Button
                    type="submit"
                    variant="primary"
                    className="mt-1 h-11 w-full !bg-zinc-950 !text-white shadow-lg shadow-zinc-950/15 hover:!bg-zinc-800"
                    disabled={busy}
                  >
                    {busy ? 'Signing in…' : 'Log in'}
                    {!busy && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-zinc-200/80 bg-zinc-50 p-1">
                  <SegmentButton
                    active={customerMode === 'login'}
                    onClick={() => {
                      setCustomerMode('login')
                      setError('')
                    }}
                  >
                    Log in
                  </SegmentButton>
                  <SegmentButton
                    active={customerMode === 'signup'}
                    onClick={() => {
                      setCustomerMode('signup')
                      setError('')
                    }}
                  >
                    Sign up
                  </SegmentButton>
                </div>

                <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                  {customerMode === 'signup' ? 'Create your account' : 'Track your cases'}
                </h2>
                <p className="mt-1.5 text-sm text-zinc-500">
                  {customerMode === 'signup'
                    ? 'Sign up to see every ticket in one place.'
                    : 'Log in to view all tickets linked to your account.'}
                </p>

                <form
                  className="mt-6 flex flex-col gap-4"
                  onSubmit={(e) => void handleCustomerSubmit(e)}
                >
                  {customerMode === 'signup' && (
                    <Field
                      label="Full name"
                      type="text"
                      autoFocus
                      value={name}
                      onChange={setName}
                      placeholder="Jane Doe"
                      clearError={() => setError('')}
                    />
                  )}
                  <Field
                    label="Email address"
                    type="email"
                    autoFocus={customerMode === 'login'}
                    value={email}
                    onChange={setEmail}
                    placeholder="you@email.com"
                    clearError={() => setError('')}
                  />
                  <Field
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="At least 6 characters"
                    clearError={() => setError('')}
                  />
                  {error && <p className="text-sm text-status-stuck-text">{error}</p>}
                  <Button
                    type="submit"
                    variant="primary"
                    className="mt-1 h-11 w-full !bg-zinc-950 !text-white shadow-lg shadow-zinc-950/15 hover:!bg-zinc-800"
                    disabled={busy}
                  >
                    {busy
                      ? customerMode === 'signup'
                        ? 'Creating account…'
                        : 'Signing in…'
                      : customerMode === 'signup'
                        ? 'Create account'
                        : 'Log in'}
                    {!busy && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>

                <div className="mt-5 flex items-center gap-3 text-xs text-zinc-400">
                  <span className="h-px flex-1 bg-zinc-200" />
                  or continue without account
                  <span className="h-px flex-1 bg-zinc-200" />
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="h-11 w-full !border-zinc-200 !bg-white/70 !text-zinc-900 hover:!bg-white"
                    onClick={() => navigate(`/${tenantSlug}/submit`)}
                  >
                    Submit a new problem
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-10 w-full"
                    onClick={() => navigate(`/${tenantSlug}/track`)}
                  >
                    Track with ticket number
                  </Button>
                </div>
              </>
            )}
          </Card>
          <p className="mt-5 text-center text-xs text-zinc-600/80">
            We use your details only to handle your case. Ticket links are private and require your
            phone number to open.
          </p>
        </div>
      </main>
    </div>
  )
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  clearError,
  autoFocus,
  autoComplete,
}: {
  label: string
  type: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  clearError: () => void
  autoFocus?: boolean
  autoComplete?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <Input
        className="h-11 border-zinc-200 bg-white/80 text-zinc-950 shadow-sm placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900"
        type={type}
        required
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          clearError()
        }}
        placeholder={placeholder}
      />
    </label>
  )
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring rounded-lg py-2 text-sm font-medium transition-all duration-200 ease-out',
        active
          ? 'bg-white text-zinc-950 shadow-sm'
          : 'text-zinc-500 hover:bg-white/50 hover:text-zinc-800',
      )}
    >
      {children}
    </button>
  )
}

function mapAuthError(err: unknown): string {
  const code = (err as { code?: string }).code
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-email' ||
    code === 'functions/permission-denied' ||
    code === 'functions/unauthenticated'
  ) {
    return 'Invalid email/username or password.'
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Log in instead.'
  }
  if (code === 'auth/weak-password') {
    return 'Password should be at least 6 characters.'
  }
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
    return 'Email/password sign-in is not enabled in Firebase Auth yet.'
  }
  if (code === 'functions/failed-precondition') {
    return 'Company data is not set up yet. Ask an admin to run bootstrap.'
  }
  if (err instanceof Error) {
    const cleaned = err.message
      .replace(/^Firebase:\s*/i, '')
      .replace(/\s*\([^)]*\)\.?$/, '')
      .trim()
    if (!cleaned || cleaned.toUpperCase() === 'INTERNAL' || cleaned.toUpperCase() === 'ERROR') {
      return 'Login failed. Check email/password in the staf collection.'
    }
    return cleaned
  }
  return 'Something went wrong. Try again.'
}
