import { prisma } from '@/lib/prisma'
import {
  DEFAULT_OBJECTIONS_CA,
  DEFAULT_OBJECTIONS_ES,
} from '@/lib/coldcall/default-objections'

export interface ColdCallObjection {
  objection: string
  response: string
}

export type ObjectionLocale = 'es' | 'ca'

function parseObjectionsJson(raw: unknown): ColdCallObjection[] | null {
  if (!Array.isArray(raw)) return null
  const items: ColdCallObjection[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const objection = String((row as { objection?: unknown }).objection ?? '').trim()
    const response = String((row as { response?: unknown }).response ?? '').trim()
    if (!objection || !response) continue
    items.push({ objection, response })
  }
  return items.length ? items : null
}

export function defaultObjections(locale: ObjectionLocale): ColdCallObjection[] {
  return locale === 'ca' ? DEFAULT_OBJECTIONS_CA : DEFAULT_OBJECTIONS_ES
}

export function normalizeObjections(
  items: ColdCallObjection[],
  locale: ObjectionLocale
): ColdCallObjection[] {
  const cleaned = items
    .map((item) => ({
      objection: item.objection.trim(),
      response: item.response.trim(),
    }))
    .filter((item) => item.objection && item.response)
  return cleaned.length ? cleaned : defaultObjections(locale)
}

export async function getUserObjections(
  userId: number
): Promise<{ es: ColdCallObjection[]; ca: ColdCallObjection[]; isCustom: boolean }> {
  const rows = await prisma.$queryRaw<
    { coldcall_objections_es: unknown; coldcall_objections_ca: unknown }[]
  >`
    SELECT coldcall_objections_es, coldcall_objections_ca
    FROM crm_users
    WHERE id = ${userId}
    LIMIT 1
  `
  const row = rows[0]
  const es = parseObjectionsJson(row?.coldcall_objections_es) ?? defaultObjections('es')
  const ca = parseObjectionsJson(row?.coldcall_objections_ca) ?? defaultObjections('ca')
  const isCustom = Boolean(
    parseObjectionsJson(row?.coldcall_objections_es) || parseObjectionsJson(row?.coldcall_objections_ca)
  )
  return { es, ca, isCustom }
}

export async function saveUserObjections(
  userId: number,
  input: { es: ColdCallObjection[]; ca: ColdCallObjection[] }
): Promise<void> {
  const es = normalizeObjections(input.es, 'es')
  const ca = normalizeObjections(input.ca, 'ca')
  await prisma.$executeRaw`
    UPDATE crm_users SET
      coldcall_objections_es = ${JSON.stringify(es)}::jsonb,
      coldcall_objections_ca = ${JSON.stringify(ca)}::jsonb,
      updated_at = NOW()
    WHERE id = ${userId}
  `
}

export async function resetUserObjections(userId: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE crm_users SET
      coldcall_objections_es = NULL,
      coldcall_objections_ca = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `
}
