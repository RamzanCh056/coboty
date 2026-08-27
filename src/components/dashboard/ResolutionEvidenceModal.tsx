import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Input'

const MIN_EVIDENCE = 20

export function ResolutionEvidenceModal({
  open,
  displayId,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  displayId: string | null
  busy?: boolean
  onClose: () => void
  onConfirm: (evidence: string) => void
}) {
  const [evidence, setEvidence] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) {
      setEvidence('')
      setTouched(false)
    }
  }, [open])

  const trimmed = evidence.trim()
  const tooShort = trimmed.length < MIN_EVIDENCE

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={displayId ? `Resolve ${displayId}` : 'Resolve ticket'}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          Describe what you did to resolve this case. The customer may see this when confirming
          closure.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Resolution evidence</span>
          <Textarea
            autoFocus
            value={evidence}
            onChange={(e) => {
              setEvidence(e.target.value)
              setTouched(true)
            }}
            placeholder="e.g. Replaced the water inlet valve on site, ran a full wash cycle with no leak, confirmed with customer on the call…"
            className="min-h-28"
          />
          {touched && tooShort && (
            <span className="text-xs text-status-stuck-text">
              Add at least {MIN_EVIDENCE} characters ({trimmed.length}/{MIN_EVIDENCE}).
            </span>
          )}
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={tooShort || busy}
            onClick={() => onConfirm(trimmed)}
          >
            {busy ? 'Saving…' : 'Mark resolved'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
