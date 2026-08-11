import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useAppData } from '../../context/AppData'

const PRESETS = [2, 3, 6]

export function SlaSettingsModal({ onClose }: { onClose: () => void }) {
  const { currentTenant, updateUnopenedSla, runUnopenedSlaCheck } = useAppData()
  const currentHours = currentTenant?.config.unopenedSlaHours ?? 3
  const [hours, setHours] = useState(currentHours)
  const [custom, setCustom] = useState(
    PRESETS.includes(currentHours) ? '' : String(currentHours),
  )
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const next = custom.trim() ? Number(custom) : hours
      if (!Number.isInteger(next) || next < 1 || next > 72) {
        throw new Error('Enter a whole number between 1 and 72 hours.')
      }
      await updateUnopenedSla(next)
      setHours(next)
      setMessage(`Timer set to ${next} hour${next === 1 ? '' : 's'}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save timer.')
    } finally {
      setBusy(false)
    }
  }

  async function checkNow() {
    setChecking(true)
    setError('')
    setMessage('')
    try {
      const result = await runUnopenedSlaCheck()
      setMessage(
        result.warned === 0
          ? `No unopened tickets past the ${result.slaHours}h timer.`
          : `${result.warned} overdue ticket${result.warned === 1 ? '' : 's'} checked. ${result.forwarded} auto-forwarded.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-card-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-text-primary">Unopened ticket timer</h2>
            <p className="mt-1 text-sm text-text-secondary">
              If an assigned ticket is not opened in this time, CoBotty auto-forwards it to another
              teammate and warns you.
            </p>
          </div>
          <button type="button" className="focus-ring rounded-control p-1 text-text-tertiary" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setHours(preset)
                setCustom('')
              }}
              className={`focus-ring rounded-full border px-3 py-1.5 text-sm font-medium ${
                !custom && hours === preset
                  ? 'border-accent bg-accent text-text-inverse'
                  : 'border-border bg-surface text-text-secondary hover:border-border-strong'
              }`}
            >
              {preset} hours
            </button>
          ))}
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Custom hours (1–72)</span>
          <Input
            type="number"
            min={1}
            max={72}
            placeholder="e.g. 4"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </label>

        {error && <p className="mt-3 text-sm text-status-stuck-text">{error}</p>}
        {message && <p className="mt-3 text-sm text-status-solved-text">{message}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => void checkNow()} disabled={checking || busy}>
            {checking ? 'Checking…' : 'Check overdue now'}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save timer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
