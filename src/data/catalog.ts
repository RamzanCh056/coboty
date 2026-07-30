import type { Department, StaffUser, Tenant } from './types'

let liveTenant: Tenant | null = null
let liveDepartments: Department[] = []
let liveStaff: StaffUser[] = []

export function hydrateCatalog(next: {
  tenant?: Tenant | null
  departments?: Department[]
  staff?: StaffUser[]
}) {
  if (next.tenant !== undefined) liveTenant = next.tenant
  if (next.departments !== undefined) liveDepartments = next.departments
  if (next.staff !== undefined) liveStaff = next.staff
}

export function catalogTenant(): Tenant | null {
  return liveTenant
}

export function catalogTenants(): Tenant[] {
  return liveTenant ? [liveTenant] : []
}

export function catalogTenantById(id: string): Tenant | null {
  return liveTenant?.id === id ? liveTenant : null
}

export function catalogDepartments(): Department[] {
  return liveDepartments
}

export function catalogDepartmentsForTenant(tenantId: string): Department[] {
  return liveDepartments.filter((d) => d.tenantId === tenantId)
}

export function catalogDepartment(id: string): Department | null {
  return liveDepartments.find((d) => d.id === id) ?? null
}

export function catalogStaff(): StaffUser[] {
  return liveStaff
}

export function catalogStaffForTenant(tenantId: string): StaffUser[] {
  return liveStaff.filter((s) => s.tenantId === tenantId)
}

export function catalogStaffMember(id: string | null): StaffUser | null {
  if (!id) return null
  return liveStaff.find((s) => s.id === id) ?? null
}

export function catalogStaffByEmail(email: string): StaffUser | null {
  const needle = email.trim().toLowerCase()
  return liveStaff.find((s) => s.email.toLowerCase() === needle) ?? null
}

export function getDepartmentOrThrow(id: string): Department {
  const dep = catalogDepartment(id)
  if (!dep) throw new Error(`Unknown department ${id}`)
  return dep
}

export function getStaffDepartment(staffMember: StaffUser): Department | null {
  return (
    catalogDepartment(staffMember.departmentId) ??
    liveDepartments.find((d) => d.tenantId === staffMember.tenantId && d.name === staffMember.team) ??
    null
  )
}
