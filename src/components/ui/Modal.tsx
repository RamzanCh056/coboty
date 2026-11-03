import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      style={{ animation: 'modal-overlay-in 150ms ease-out' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'modal-panel-in 180ms ease-out' }}
        className={cn(
          'flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-card-lg border border-border bg-surface shadow-[0_24px_80px_-28px_rgba(24,24,27,0.45)]',
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-5 py-4">
          <h2 id="modal-title" className="text-lg font-medium tracking-tight text-text-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-control text-text-tertiary transition-colors duration-150 ease-out hover:bg-page hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  )
}
