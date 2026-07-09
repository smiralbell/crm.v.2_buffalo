import type { AuthUser, CrmRole } from '@/lib/auth'

export const DEVELOPER_PAGE_PREFIXES = [
  '/developer',
  '/gestion-proyecto',
  '/retencion',
  '/tickets',
  '/login',
] as const

export const DEVELOPER_API_PREFIXES = [
  '/api/auth/',
  '/api/developer/',
  '/api/gestion-proyecto/',
  '/api/retencion/',
  '/api/tickets/',
  '/api/team-members',
] as const

export function isAdmin(user: AuthUser): boolean {
  return user.role === 'admin'
}

export function isDeveloper(user: AuthUser): boolean {
  return user.role === 'developer'
}

export function canAccessPage(pathname: string, role: CrmRole): boolean {
  if (role === 'admin') return pathname !== '/login' || true
  if (pathname === '/login') return true
  return DEVELOPER_PAGE_PREFIXES.some(
    (p) => p !== '/login' && (pathname === p || pathname.startsWith(`${p}/`))
  )
}

export function canAccessApi(pathname: string, role: CrmRole): boolean {
  if (role === 'admin') return true
  return DEVELOPER_API_PREFIXES.some((p) => pathname.startsWith(p))
}

export function defaultHomeForRole(role: CrmRole): string {
  return role === 'developer' ? '/developer' : '/dashboard'
}
