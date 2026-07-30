import { Lock } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { Department } from '../../data/types'

export function DepartmentFilters({
  departments,
  active,
  onChange,
  allowedDepartmentIds,
}: {
  departments: Department[]
  active: string | null
  onChange: (id: string | null) => void
  /** null/undefined = no restriction (manager). Array = only these are selectable (agent). */
  allowedDepartmentIds?: string[] | null
}) {
  const restricted = allowedDepartmentIds != null

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by department">
      {!restricted && (
        <FilterPill label="All departments" isActive={active === null} onClick={() => onChange(null)} />
      )}
      {departments.map((dep) => {
        const isAllowed = !restricted || allowedDepartmentIds!.includes(dep.id)
        return (
          <FilterPill
            key={dep.id}
            label={dep.name}
            isActive={active === dep.id}
            disabled={!isAllowed}
            onClick={() => isAllowed && onChange(dep.id)}
          />
        )
      })}
    </div>
  )
}

function FilterPill({
  label,
  isActive,
  disabled,
  onClick,
}: {
  label: string
  isActive: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
      title={disabled ? 'Outside your department' : undefined}
      className={cn(
        'focus-ring flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out',
        disabled && 'cursor-not-allowed border-border bg-page text-text-tertiary opacity-50',
        !disabled &&
          (isActive
            ? 'border-accent bg-accent text-text-inverse'
            : 'border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary'),
      )}
    >
      {disabled && <Lock className="h-3 w-3" aria-hidden="true" />}
      {label}
    </button>
  )
}
