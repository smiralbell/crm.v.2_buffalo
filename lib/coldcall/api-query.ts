import type { ColdCallFilter } from '@/lib/coldcall/scope'

export function coldCallScopeQuery(filter: ColdCallFilter, currentUserId?: number): string {
  if (filter === 'team') return '?userId=team'
  if (typeof filter === 'number' && Number.isFinite(filter)) return `?userId=${filter}`
  if (currentUserId) return `?userId=${currentUserId}`
  return ''
}

export function parseColdCallFilterParam(
  raw: string | string[] | undefined,
  defaultUserId: number
): ColdCallFilter {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'team') return 'team'
  const id = parseInt(String(value ?? ''), 10)
  if (Number.isFinite(id)) return id
  return defaultUserId
}
