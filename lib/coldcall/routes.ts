import type { CrmRole } from '@/lib/auth'

export function campanasListHref(role?: CrmRole | null): string {
  if (role === 'comercial') return '/comercial/campanas'
  return '/marketing?tab=coldcalling&cc=campanas'
}
