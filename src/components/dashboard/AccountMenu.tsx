import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, LogOut } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { cn } from '../../lib/cn'
import { useAppData } from '../../context/AppData'
import type { StaffUser, UserRole } from '../../data/types'

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
  readonly: 'Read-only',
}

export function AccountMenu({ user }: { user: StaffUser }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { logout } = useAppData()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleLogout() {
    setOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        className="focus-ring rounded-full transition-opacity duration-150 ease-out hover:opacity-80"
      >
        <Avatar initials={user.avatarInitials} size="md" />
      </button>

      {open && (
        <div
          role="menu"
          style={{ animation: 'modal-panel-in 150ms ease-out' }}
          className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-card border border-border bg-surface"
        >
          <div className="border-b border-border px-3.5 py-3">
            <p className="text-sm font-medium text-text-primary">
              {user.name} <span className="text-text-tertiary">· {roleLabels[user.role]}</span>
            </p>
            <p className="truncate text-xs text-text-tertiary">{user.email}</p>
          </div>
          <div className="p-1">
            <MenuLink
              icon={BarChart3}
              label="Monthly report"
              onClick={() => {
                setOpen(false)
                navigate('/report')
              }}
            />
            <MenuLink icon={LogOut} label="Log out" onClick={() => void handleLogout()} />
          </div>
        </div>
      )}
    </div>
  )
}

function MenuLink({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof BarChart3
  label: string
  onClick: () => void
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        'focus-ring flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm text-text-primary transition-colors duration-150 ease-out hover:bg-page',
      )}
    >
      <Icon className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
      {label}
    </button>
  )
}
