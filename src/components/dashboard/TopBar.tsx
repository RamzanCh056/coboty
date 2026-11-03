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
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface/95 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent text-sm font-medium text-text-inverse">
          {tenant.config.logoInitial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{tenant.name}</p>
          <p className="hidden text-[11px] text-text-tertiary sm:block">Staff workspace</p>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-md flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          type="search"
          placeholder="Search tickets, customers…"
          aria-label="Search tickets and customers"
          className="focus-ring h-9 w-full rounded-full border border-border bg-page pl-9 pr-4 text-sm text-text-primary placeholder:text-text-tertiary transition-colors duration-150 ease-out hover:border-border-strong focus:border-focus-ring focus:bg-surface"
        />
      </div>

      <div className="ml-auto shrink-0">
        <AccountMenu user={user} />
      </div>
    </header>
  )
}
