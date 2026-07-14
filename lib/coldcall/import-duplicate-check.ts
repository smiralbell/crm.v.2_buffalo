import { prisma } from '@/lib/prisma'

export interface OtherCampaignLeadMatch {
  prospect_id: number
  nombre: string
  campaign_id: number
  campaign_name: string
  match_type: 'dedupe_key' | 'phone'
}

export function normalizePhoneDigits(telefono: string | null | undefined): string | null {
  if (!telefono?.trim()) return null
  let digits = telefono.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 9 && /^[6789]/.test(digits)) digits = `34${digits}`
  if (digits.length < 9) return null
  return digits
}

type LeadRef = { dedupeKey: string; telefono: string | null; nombre: string }

export async function findOtherCampaignMatchesForLeads(
  campaignId: number,
  leads: LeadRef[]
): Promise<Map<string, OtherCampaignLeadMatch>> {
  const matches = new Map<string, OtherCampaignLeadMatch>()

  const dedupeKeys = Array.from(
    new Set(leads.map((l) => l.dedupeKey?.trim()).filter((k): k is string => Boolean(k)))
  )

  if (dedupeKeys.length > 0) {
    const rows = await prisma.$queryRaw<
      {
        id: number
        nombre: string
        dedupe_key: string
        campaign_id: number
        campaign_name: string
      }[]
    >`
      SELECT p.id, p.nombre, p.dedupe_key, p.campaign_id, c.name AS campaign_name
      FROM coldcall_prospects p
      INNER JOIN coldcall_campaigns c ON c.id = p.campaign_id
      WHERE p.deleted_at IS NULL
        AND p.campaign_id != ${campaignId}
        AND p.dedupe_key = ANY(${dedupeKeys}::text[])
    `
    for (const row of rows) {
      matches.set(`dedupe:${row.dedupe_key}`, {
        prospect_id: row.id,
        nombre: row.nombre,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        match_type: 'dedupe_key',
      })
    }
  }

  const phoneKeys = Array.from(
    new Set(
      leads
        .map((l) => normalizePhoneDigits(l.telefono))
        .filter((p): p is string => Boolean(p))
    )
  )

  if (phoneKeys.length > 0) {
    const rows = await prisma.$queryRaw<
      {
        id: number
        nombre: string
        phone_digits: string
        campaign_id: number
        campaign_name: string
      }[]
    >`
      SELECT
        p.id,
        p.nombre,
        NULLIF(regexp_replace(COALESCE(p.telefono, ''), '[^0-9]', '', 'g'), '') AS phone_digits,
        p.campaign_id,
        c.name AS campaign_name
      FROM coldcall_prospects p
      INNER JOIN coldcall_campaigns c ON c.id = p.campaign_id
      WHERE p.deleted_at IS NULL
        AND p.campaign_id != ${campaignId}
        AND NULLIF(regexp_replace(COALESCE(p.telefono, ''), '[^0-9]', '', 'g'), '') = ANY(${phoneKeys}::text[])
    `
    for (const row of rows) {
      if (!row.phone_digits) continue
      const key = `phone:${row.phone_digits}`
      if (!matches.has(key)) {
        matches.set(key, {
          prospect_id: row.id,
          nombre: row.nombre,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          match_type: 'phone',
        })
      }
    }
  }

  return matches
}

export function resolveOtherCampaignMatch(
  lead: LeadRef,
  index: Map<string, OtherCampaignLeadMatch>
): OtherCampaignLeadMatch | null {
  const byDedupe = index.get(`dedupe:${lead.dedupeKey}`)
  if (byDedupe) return byDedupe
  const phone = normalizePhoneDigits(lead.telefono)
  if (phone) return index.get(`phone:${phone}`) ?? null
  return null
}

export function summarizeOtherCampaignMatches(
  leads: LeadRef[],
  index: Map<string, OtherCampaignLeadMatch>
): {
  count: number
  samples: { nombre: string; campaign_name: string; match_type: string }[]
} {
  const seen = new Set<string>()
  const samples: { nombre: string; campaign_name: string; match_type: string }[] = []

  for (const lead of leads) {
    const match = resolveOtherCampaignMatch(lead, index)
    if (!match) continue
    const key = `${match.campaign_id}:${lead.dedupeKey}`
    if (seen.has(key)) continue
    seen.add(key)
    if (samples.length < 8) {
      samples.push({
        nombre: lead.nombre || match.nombre,
        campaign_name: match.campaign_name,
        match_type: match.match_type,
      })
    }
  }

  return { count: seen.size, samples }
}
