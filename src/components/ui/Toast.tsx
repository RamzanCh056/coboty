import type { ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'

export function Toast({ visible, children }: { visible: boolean; children: ReactNode }) {
  if (!visible) return null

  return (
    <div
      role="status"
      style={{ animation: 'modal-panel-in 150ms ease-out' }}
      className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[90vw] items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text-primary"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0 text-status-solved-text" aria-hidden="true" />
      {children}
    </div>
  )
}
