import { prisma } from '@/lib/prisma'
import { resolveCrmUserFkId } from '@/lib/crm-users'
import {
  buildComercialPersona,
  DEFAULT_CEO_PERSONA,
  type ComercialPersona,
} from '@/lib/coldcall/comercial-persona'

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
