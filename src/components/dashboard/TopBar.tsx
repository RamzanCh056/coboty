import { Search } from 'lucide-react'
import { AccountMenu } from './AccountMenu'
import type { StaffUser, Tenant } from '../../data/types'

export function TopBar({
  tenant,
  user,
  query,
  onQueryChange,
}: {
  tenant: Tenant
  user: StaffUser
  query: string
  onQueryChange: (value: string) => void
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-control bg-accent text-sm font-medium text-text-inverse">
          {tenant.config.logoInitial}
        </div>
        <span className="text-base font-medium text-text-primary">{tenant.name}</span>
      </div>

      <div className="relative ml-6 max-w-sm flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          type="text"
          placeholder="Search tickets, customers..."
          aria-label="Search tickets and customers"
          className="focus-ring h-9 w-full rounded-control border border-border bg-page pl-9 pr-3 text-base text-text-primary placeholder:text-text-tertiary transition-colors duration-150 ease-out hover:border-border-strong focus:border-focus-ring focus:bg-surface"
        />
      </div>

      <div className="ml-auto">
        <AccountMenu user={user} />
      </div>
    </header>
  )
}
