import { prisma } from '@/lib/prisma'
import { resolveCrmUserFkId } from '@/lib/crm-users'
import {
  buildComercialPersona,
  DEFAULT_CEO_PERSONA,
  firstTokenName,
  type ComercialPersona,
} from '@/lib/coldcall/comercial-persona'

const DEFAULT_GMAIL_BY_COMMERCIAL: Record<string, string> = {
  sergi: 'sergimasoliver@gmail.com',
}

export function resolveColdcallGmail(input: {
  email: string
  name: string
  coldcall_gmail?: string | null
}): string | null {
  const explicit = input.coldcall_gmail?.trim()
  if (explicit) return explicit

  const loginEmail = input.email.trim().toLowerCase()
  if (loginEmail.endsWith('@gmail.com')) return input.email.trim()

  const first = firstTokenName(input.name).toLowerCase()
  return DEFAULT_GMAIL_BY_COMMERCIAL[first] ?? null
}

export async function getColdcallGmailForUserId(
  userId: number | null | undefined
): Promise<string | null> {
  if (!userId || userId <= 0) {
    return process.env.COLDCALL_GMAIL_SENDER?.trim() || DEFAULT_GMAIL_BY_COMMERCIAL.sergi
  }

  const crmUserId = await resolveCrmUserFkId(userId)
  if (!crmUserId) {
    return process.env.COLDCALL_GMAIL_SENDER?.trim() || DEFAULT_GMAIL_BY_COMMERCIAL.sergi
  }

  try {
    const rows = await prisma.$queryRaw<
      { name: string; email: string; coldcall_gmail: string | null }[]
    >`
      SELECT name, email, coldcall_gmail
      FROM crm_users
      WHERE id = ${crmUserId}
      LIMIT 1
    `
    const row = rows[0]
    if (!row) return null
    return resolveColdcallGmail(row)
  } catch {
    return null
  }
}

export async function getComercialPersonaForUserId(
  userId: number | null | undefined
): Promise<ComercialPersona> {
  if (!userId || userId <= 0) return DEFAULT_CEO_PERSONA

  const crmUserId = await resolveCrmUserFkId(userId)
  if (!crmUserId) return DEFAULT_CEO_PERSONA

  try {
    const rows = await prisma.$queryRaw<
      {
        name: string
        coldcall_speaker_name: string | null
        coldcall_speaker_full_name: string | null
        coldcall_present_as_ceo: boolean | null
      }[]
    >`
      SELECT
        name,
        coldcall_speaker_name,
        coldcall_speaker_full_name,
        coldcall_present_as_ceo
      FROM crm_users
      WHERE id = ${crmUserId}
      LIMIT 1
    `

    const row = rows[0]
    if (!row) return DEFAULT_CEO_PERSONA

    return buildComercialPersona({
      name: row.name,
      speakerName: row.coldcall_speaker_name,
      speakerFullName: row.coldcall_speaker_full_name,
      presentAsCeo: row.coldcall_present_as_ceo,
    })
  } catch {
    return DEFAULT_CEO_PERSONA
  }
}
