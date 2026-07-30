import { Navigate } from 'react-router-dom'
import { useAppData } from '../context/AppData'
import type { ReactNode } from 'react'

export function RequireStaff({ children }: { children: ReactNode }) {
  const { authReady, currentUser, ready } = useAppData()

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-sm text-text-secondary">
        Checking session…
      </div>
    )
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-sm text-text-secondary">
        Loading dashboard…
      </div>
    )
  }

  return children
}
