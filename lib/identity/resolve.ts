/**
 * Resolver de identidad: dado un email y/o teléfono, encuentra el contacto existente.
 * Email manda (sin distinguir mayúsculas); si no hay, teléfono por sus últimos 9 dígitos,
 * así «612 345 678» y «+34612345678» son la misma persona.
 */
import { prisma } from '@/lib/prisma'
import { normalizeEmail, phoneTail } from '@/lib/identity/normalize'

export type IdentityMatch = { contactId: number; matchedBy: 'email' | 'phone' } | null

export async function findContactByIdentity(input: {
  email?: string | null
  phone?: string | null
}): Promise<IdentityMatch> {
  const email = normalizeEmail(input.email)
  if (email) {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM contacts WHERE LOWER(TRIM(email)) = ${email} ORDER BY id LIMIT 1
    `
    if (rows[0]) return { contactId: rows[0].id, matchedBy: 'email' }
  }
  const tail = phoneTail(input.phone)
  if (tail) {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM contacts
       WHERE telefono IS NOT NULL
         AND RIGHT(regexp_replace(telefono, '[^0-9]', '', 'g'), 9) = ${tail}
       ORDER BY id LIMIT 1
    `
    if (rows[0]) return { contactId: rows[0].id, matchedBy: 'phone' }
  }
  return null
}
