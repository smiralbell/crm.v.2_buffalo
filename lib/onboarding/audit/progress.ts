import { AUDIT_AREAS, type AuditImportance, type AuditProgressMap, type AuditStructured, type ProjectAudit } from './types'
import { BASE_QUESTIONS } from './catalog'

const WEIGHT: Record<AuditImportance, number> = {
  critical: 4,
  important: 2,
  recommended: 1,
  optional: 0.5,
}

const DONE = new Set([
  'answered',
  'confirmed',
  'estimated',
  'pending_confirmation',
  'not_applicable',
])

export function computeProgressFromStructured(structured: AuditStructured): AuditProgressMap {
  const byArea = new Map<string, { w: number; done: number; criticalMissing: number }>()

  for (const q of BASE_QUESTIONS) {
    const area = q.area
    const cur = byArea.get(area) || { w: 0, done: 0, criticalMissing: 0 }
    const weight = WEIGHT[q.importance]
    cur.w += weight
    const f = structured[q.field_key]
    const status = f?.status
    if (status && DONE.has(status)) {
      cur.done += weight
    } else if (q.importance === 'critical') {
      cur.criticalMissing += 1
    }
    byArea.set(area, cur)
  }

  // Also include any structured keys not in catalog
  for (const [key, field] of Object.entries(structured)) {
    if (BASE_QUESTIONS.some((q) => q.field_key === key)) continue
    const area = field.area || 'negocio'
    const cur = byArea.get(area) || { w: 0, done: 0, criticalMissing: 0 }
    const weight = WEIGHT[field.importance || 'important']
    cur.w += weight
    if (DONE.has(field.status)) cur.done += weight
    else if (field.importance === 'critical') cur.criticalMissing += 1
    byArea.set(area, cur)
  }

  const progress: AuditProgressMap = {}
  for (const area of AUDIT_AREAS) {
    const cur = byArea.get(area.id)
    if (!cur || cur.w <= 0) {
      progress[area.id] = 0
      continue
    }
    let pct = Math.round((cur.done / cur.w) * 100)
    if (cur.criticalMissing > 0 && pct >= 100) pct = 85
    progress[area.id] = Math.max(0, Math.min(100, pct))
  }
  return progress
}

export function computeAreaProgress(structured: AuditStructured) {
  const progress = computeProgressFromStructured(structured)
  return AUDIT_AREAS.map((area) => {
    const qs = BASE_QUESTIONS.filter((q) => q.area === area.id)
    const answered = qs.filter((q) => {
      const f = structured[q.field_key]
      return f && DONE.has(f.status)
    }).length
    const critical_missing = qs.filter((q) => {
      if (q.importance !== 'critical') return false
      const f = structured[q.field_key]
      return !f || !DONE.has(f.status)
    }).length
    return {
      id: area.id,
      label: area.label,
      answered,
      critical_missing,
      sufficiency: progress[area.id] ?? 0,
    }
  }).filter((a) => BASE_QUESTIONS.some((q) => q.area === a.id) || (progress[a.id] ?? 0) > 0)
}

export function mergeProgress(
  base: AuditProgressMap,
  updates: Array<{ category: string; percentage: number }>
): AuditProgressMap {
  const next = { ...base }
  for (const u of updates) {
    const key = u.category
    next[key] = Math.max(0, Math.min(100, Math.round(u.percentage)))
  }
  return next
}

export function auditCompleteness(audit: ProjectAudit): {
  percent: number
  criticalMissing: string[]
  enoughForProposal: boolean
} {
  const progress = Object.keys(audit.progress || {}).length
    ? audit.progress
    : computeProgressFromStructured(audit.structured)
  const values = Object.values(progress)
  const percent = values.length
    ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    : 0
  const criticalMissing = BASE_QUESTIONS.filter((q) => {
    if (q.importance !== 'critical') return false
    const f = audit.structured[q.field_key]
    return !f || !DONE.has(f.status)
  }).map((q) => q.field_key)
  return {
    percent,
    criticalMissing,
    enoughForProposal: criticalMissing.length === 0 && percent >= 55,
  }
}
