import { prisma } from '@/lib/prisma'
import type { ColdCallScope } from '@/lib/coldcall/scope'
import { assertProspectAccess, getScopeFilterParams } from '@/lib/coldcall/scope'
import { normalizePhoneDigits as normalizePhoneDigitsImport } from '@/lib/coldcall/import-duplicate-check'

export interface DuplicateProspect {
  id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  campaign_id: number
  campaign_name: string
  stage: string
  call_count: number
  created_at: string
  dedupe_key: string | null
}

export interface DuplicateGroup {
  match_key: string
  match_type: 'dedupe_key' | 'phone'
  prospects: DuplicateProspect[]
}

export type DuplicateCleanupStrategy = 'keep_in_campaign' | 'keep_most_calls' | 'keep_oldest'

function mapProspectRow(r: {
  id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  campaign_id: number
  campaign_name: string
  stage: string
  call_count: string | number
  created_at: Date
  dedupe_key: string | null
}): DuplicateProspect {
  return {
    id: r.id,
    nombre: r.nombre,
    empresa: r.empresa,
    telefono: r.telefono,
    email: r.email,
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    stage: r.stage,
    call_count: Number(r.call_count),
    created_at: r.created_at.toISOString(),
    dedupe_key: r.dedupe_key,
  }
}

async function fetchScopedProspects(scope: ColdCallScope): Promise<DuplicateProspect[]> {
  const { userId: scopeUserId, teamIds: scopeTeamIds, legacyAdmin } = getScopeFilterParams(scope)

  const rows = await prisma.$queryRaw<
    {
      id: number
      nombre: string
      empresa: string | null
      telefono: string | null
      email: string | null
      campaign_id: number
      campaign_name: string
      stage: string
      call_count: string | number
      created_at: Date
      dedupe_key: string | null
      phone_digits: string | null
    }[]
  >`
    SELECT
      p.id,
      p.nombre,
      p.empresa,
      p.telefono,
      p.email,
      p.campaign_id,
      c.name AS campaign_name,
      p.stage,
      (SELECT COUNT(*)::int FROM coldcall_calls WHERE prospect_id = p.id) AS call_count,
      p.created_at,
      p.dedupe_key,
      NULLIF(regexp_replace(COALESCE(p.telefono, ''), '[^0-9]', '', 'g'), '') AS phone_digits
    FROM coldcall_prospects p
    INNER JOIN coldcall_campaigns c ON c.id = p.campaign_id
    WHERE p.deleted_at IS NULL
      AND (
        (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
        OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
        OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
          c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
          OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
          OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
        ))
      )
  `

  return rows.map(mapProspectRow)
}

function groupByDedupeKey(prospects: DuplicateProspect[]): DuplicateGroup[] {
  const buckets = new Map<string, DuplicateProspect[]>()
  for (const p of prospects) {
    const key = p.dedupe_key?.trim()
    if (!key) continue
    const list = buckets.get(key) ?? []
    list.push(p)
    buckets.set(key, list)
  }

  const groups: DuplicateGroup[] = []
  for (const [match_key, list] of Array.from(buckets.entries())) {
    if (list.length < 2) continue
    const campaigns = new Set(list.map((p: DuplicateProspect) => p.campaign_id))
    if (campaigns.size < 2) continue
    groups.push({
      match_key,
      match_type: 'dedupe_key',
      prospects: [...list].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    })
  }
  return groups
}

function normalizePhoneDigits(telefono: string | null): string | null {
  return normalizePhoneDigitsImport(telefono)
}

function groupByPhone(prospects: DuplicateProspect[], existingGroups: DuplicateGroup[]): DuplicateGroup[] {
  const alreadyPaired = new Set<number>()
  for (const g of existingGroups) {
    for (const p of g.prospects) alreadyPaired.add(p.id)
  }

  const buckets = new Map<string, DuplicateProspect[]>()
  for (const p of prospects) {
    if (alreadyPaired.has(p.id)) continue
    const digits = normalizePhoneDigits(p.telefono)
    if (!digits) continue
    const list = buckets.get(digits) ?? []
    list.push(p)
    buckets.set(digits, list)
  }

  const groups: DuplicateGroup[] = []
  for (const [digits, list] of Array.from(buckets.entries())) {
    if (list.length < 2) continue
    const campaigns = new Set(list.map((p: DuplicateProspect) => p.campaign_id))
    if (campaigns.size < 2) continue
    groups.push({
      match_key: `phone:${digits}`,
      match_type: 'phone',
      prospects: [...list].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    })
  }
  return groups
}

export async function findCrossCampaignDuplicates(
  scope: ColdCallScope,
  opts: { campaignId?: number } = {}
): Promise<DuplicateGroup[]> {
  const prospects = await fetchScopedProspects(scope)
  const byDedupe = groupByDedupeKey(prospects)
  const byPhone = groupByPhone(prospects, byDedupe)
  let groups = [...byDedupe, ...byPhone].sort((a, b) =>
    a.prospects[0].nombre.localeCompare(b.prospects[0].nombre, 'es')
  )

  if (opts.campaignId != null) {
    groups = groups.filter((g) => g.prospects.some((p) => p.campaign_id === opts.campaignId))
  }

  return groups
}

export function pickKeeperId(
  group: DuplicateGroup,
  strategy: DuplicateCleanupStrategy,
  campaignId?: number
): number {
  const list = group.prospects

  if (strategy === 'keep_in_campaign' && campaignId != null) {
    const inCampaign = list.filter((p) => p.campaign_id === campaignId)
    const pool = inCampaign.length ? inCampaign : list
    return [...pool].sort(
      (a, b) =>
        b.call_count - a.call_count ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0].id
  }

  if (strategy === 'keep_most_calls') {
    return [...list].sort(
      (a, b) =>
        b.call_count - a.call_count ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0].id
  }

  return [...list].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0].id
}

export function planDuplicateCleanup(
  groups: DuplicateGroup[],
  strategy: DuplicateCleanupStrategy,
  campaignId?: number,
  explicitKeepIds?: number[]
): { keep_ids: number[]; delete_ids: number[] } {
  const keepIds: number[] = []
  const deleteIds: number[] = []
  const explicit = new Set(explicitKeepIds ?? [])

  for (const group of groups) {
    const keeper =
      [...group.prospects].find((p) => explicit.has(p.id))?.id ??
      pickKeeperId(group, strategy, campaignId)
    keepIds.push(keeper)
    for (const p of group.prospects) {
      if (p.id !== keeper) deleteIds.push(p.id)
    }
  }

  return { keep_ids: keepIds, delete_ids: deleteIds }
}

export async function softDeleteProspects(scope: ColdCallScope, ids: number[]): Promise<number> {
  const unique = Array.from(new Set(ids))
  let deleted = 0
  for (const id of unique) {
    await assertProspectAccess(scope, id)
    await prisma.$executeRaw`
      UPDATE coldcall_prospects SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
    `
    deleted++
  }
  return deleted
}
