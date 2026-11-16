import type { AuthUser } from '@/lib/auth'
import { AGENCY_GOOGLE_OWNER_KEY } from '@/lib/agency-google'

/** Clave de las conexiones de Google (Calendar, Gmail) de cada sesión del CRM. */
export function googleOwnerKey(user: AuthUser): string {
  // Todos los admins (cada socio con su Google) usan las conexiones de la
  // cuenta de la agencia: mismo Calendar y Gmail para los dos.
  if (user.role === 'admin') {
    return AGENCY_GOOGLE_OWNER_KEY
  }
  return `user:${user.id}`
}
