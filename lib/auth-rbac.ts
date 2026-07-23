import type { AuthUser, CrmRole } from '@/lib/auth'

export const DEVELOPER_PAGE_PREFIXES = [
  '/developer',
  '/gestion-proyecto',
  '/retencion',
  '/tickets',
  '/ayuda',
  '/login',
] as const

export const COMERCIAL_PAGE_PREFIXES = [
  '/comercial',
  '/coldcalling',
  '/pipelines',
  '/developer/facturas',
  '/ayuda',
  '/login',
] as const

/** Rutas exclusivas del panel comercial (además de coldcalling compartido). */
export const COMERCIAL_ONLY_ROUTES = [
  '/comercial',
  '/comercial/campanas',
  '/comercial/pipeline',
  '/comercial/reuniones',
  '/comercial/llamar-mas-tarde',
  '/comercial/objeciones',
  '/comercial/duplicados',
  '/comercial/preparar-demos',
] as const

export const DEVELOPER_API_PREFIXES = [
  '/api/auth/',
  '/api/developer/',
  '/api/gestion-proyecto/',
  '/api/retencion/',
  '/api/tickets/',
  '/api/team-members',
] as const

export const COMERCIAL_API_PREFIXES = [
  '/api/auth/',
  '/api/coldcall/',
  '/api/pipelines/',
  '/api/developer/invoices',
] as const

export function isAdmin(user: AuthUser): boolean {
  return user.role === 'admin'
}

export function isDeveloper(user: AuthUser): boolean {
  return user.role === 'developer'
}

export function isComercial(user: AuthUser): boolean {
  return user.role === 'comercial'
}

export function canAccessColdCall(role: CrmRole): boolean {
  return role === 'admin' || role === 'comercial'
}

export function canUseFreelancerInvoices(role: CrmRole): boolean {
  return role === 'developer' || role === 'comercial'
}

export function canAccessPage(pathname: string, role: CrmRole): boolean {
  if (pathname === '/login') return true
  if (role === 'admin') return true
  if (role === 'comercial') {
    return COMERCIAL_PAGE_PREFIXES.some(
      (p) => p !== '/login' && (pathname === p || pathname.startsWith(`${p}/`))
    )
  }
  return DEVELOPER_PAGE_PREFIXES.some(
    (p) => p !== '/login' && (pathname === p || pathname.startsWith(`${p}/`))
  )
}

export function canAccessApi(pathname: string, role: CrmRole): boolean {
  if (role === 'admin') return true
  if (role === 'comercial') {
    return COMERCIAL_API_PREFIXES.some((p) => pathname.startsWith(p))
  }
  return DEVELOPER_API_PREFIXES.some((p) => pathname.startsWith(p))
}

export function defaultHomeForRole(role: CrmRole): string {
  if (role === 'developer') return '/developer'
  if (role === 'comercial') return '/comercial'
  return '/dashboard'
}
