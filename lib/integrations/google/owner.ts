import type { AuthUser } from '@/lib/auth'

/** Clave estable por sesión CRM (admin env o usuario DB). */
export function googleOwnerKey(user: AuthUser): string {
  if (user.role === 'admin' && user.id === 0) {
    return `admin:${user.email.toLowerCase()}`
  }
  return `user:${user.id}`
}
