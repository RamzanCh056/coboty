import { Navigate } from 'react-router-dom'
import { useAppData } from '../context/AppData'
import type { ReactNode } from 'react'

export function RequireCustomer({ children }: { children: ReactNode }) {
  const { authReady, customerAccount, currentUser } = useAppData()

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-sm text-text-secondary">
        Checking session…
      </div>
    )
  }

  if (currentUser) {
    return <Navigate to="/dashboard" replace />
  }

  if (!customerAccount) {
    return <Navigate to="/login" replace />
  }

  return children
}
