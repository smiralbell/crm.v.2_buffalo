import { prisma } from '@/lib/prisma'
import { saveMessage } from '@/lib/telegram-agent/store'
import { allowedWhatsAppNumbers, normalizePhone, waChatId } from '@/lib/whatsapp-agent/config'

/**
 * Quién escribe al agente de WhatsApp del equipo.
 *
 * La identidad sale SIEMPRE del móvil que manda WhatsApp, mapeado al usuario del
 * CRM que tiene ese móvil en su ficha (crm_users.whatsapp_phone). La IA nunca
 * decide quién es nadie: recibe al usuario ya resuelto y no lo puede cambiar.
 * Se vuelve a buscar en cada mensaje, así que desactivar al usuario o quitarle
 * el móvil corta el acceso al momento.
 */

export const TEAM_ROLES = ['developer', 'project_manager'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

export interface TeamMember {
  id: number
  name: string
  email: string
  role: TeamRole
  phone: string
}

export function isTeamRole(role: unknown): role is TeamRole {
  return TEAM_ROLES.includes(role as TeamRole)
}

export type PhoneCheck = { ok: true; phone: string | null } | { ok: false; error: string }

/**
 * Valida el móvil que el admin pone en la ficha. Vacío = quitarlo.
 * No puede ser el de un socio (ese número ya entra al agente de los socios).
 */
export function validateTeamPhone(raw: unknown, socioNumbers: Set<string>): PhoneCheck {
  const text = String(raw ?? '').trim()
  if (!text) return { ok: true, phone: null }
  const phone = normalizePhone(text)
  if (!/^\d{8,15}$/.test(phone)) {
    return { ok: false, error: 'Móvil no válido: ponlo con prefijo de país, p. ej. 34600111222' }
  }
  if (/^[67]\d{8}$/.test(phone)) {
    return { ok: false, error: `Falta el prefijo de país: para España pon 34 delante (34${phone})` }
  }
  if (socioNumbers.has(phone)) {
    return { ok: false, error: 'Ese móvil es de uno de los socios: no se puede dar a otro usuario' }
  }
  return { ok: true, phone }
}

let columnReady: Promise<void> | null = null

export function ensureUserPhoneColumn(): Promise<void> {
  if (!columnReady) {
    columnReady = (async () => {
      await prisma.$executeRawUnsafe(`ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT`)
      // Un móvil, un usuario: si no, no sabríamos quién escribe
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS crm_users_whatsapp_phone_key ON crm_users(whatsapp_phone) WHERE whatsapp_phone IS NOT NULL`
      )
    })().catch((e) => {
      columnReady = null
      throw e
    })
  }
  return columnReady
}

export async function getUserWhatsAppPhone(userId: number): Promise<string | null> {
  await ensureUserPhoneColumn()
  const rows = await prisma.$queryRaw<{ whatsapp_phone: string | null }[]>`
    SELECT whatsapp_phone FROM crm_users WHERE id = ${userId}
  `
  return rows[0]?.whatsapp_phone ?? null
}

export class PhoneTakenError extends Error {
  constructor(public readonly takenBy: string) {
    super('PHONE_TAKEN')
  }
}

/** Guarda (o quita, con vacío) el móvil de un usuario. Lanza Error con el motivo si no vale. */
export async function setUserWhatsAppPhone(userId: number, raw: unknown): Promise<string | null> {
  const check = validateTeamPhone(raw, allowedWhatsAppNumbers())
  if (!check.ok) throw new Error(check.error)
  await ensureUserPhoneColumn()
  if (check.phone) {
    const other = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM crm_users WHERE whatsapp_phone = ${check.phone} AND id <> ${userId}
    `
    if (other[0]) throw new PhoneTakenError(other[0].name)
  }
  const previous = await getUserWhatsAppPhone(userId)
  await prisma.$executeRaw`
    UPDATE crm_users SET whatsapp_phone = ${check.phone}, updated_at = NOW() WHERE id = ${userId}
  `
  // Conversación nueva en el móvil viejo y en el nuevo: si un número pasa a otra
  // persona, esa persona no hereda el historial de la anterior.
  if (previous !== check.phone) {
    for (const phone of [previous, check.phone]) {
      if (phone) await saveMessage(waChatId(phone), null, 'reset', '').catch(() => undefined)
    }
  }
  return check.phone
}

/**
 * Usuario del equipo con ese móvil, o null. Solo usuarios activos con rol de
 * developer o project manager: el resto no entra al agente aunque tenga móvil.
 */
export async function findTeamMemberByPhone(rawPhone: string): Promise<TeamMember | null> {
  const phone = normalizePhone(rawPhone)
  if (!/^\d{8,15}$/.test(phone)) return null
  // Los socios nunca entran por aquí, aunque alguien les hubiera puesto el móvil a otro usuario
  if (allowedWhatsAppNumbers().has(phone)) return null
  await ensureUserPhoneColumn()
  const rows = await prisma.$queryRaw<{ id: number; name: string; email: string; role: string }[]>`
    SELECT id, name, email, role FROM crm_users
    WHERE whatsapp_phone = ${phone} AND active = TRUE
    LIMIT 2
  `
  // Si por lo que sea hubiera dos, no se adivina: no entra nadie
  if (rows.length !== 1) return null
  const row = rows[0]
  if (!isTeamRole(row.role)) return null
  return { id: Number(row.id), name: row.name, email: row.email, role: row.role, phone }
}
