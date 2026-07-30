import type { AuditMode, AuditProjectType, AuditStructured, CurrentQuestion, ProjectAudit } from './types'
import { BASE_QUESTIONS, questionsFor, type CatalogQuestion } from './catalog'
import {
  blockedTopics,
  catalogByTopic,
  topicFromCatalog,
  topicFromFieldKey,
  topicOrderForMode,
  type AuditTopicId,
} from './topics'
import { isSolutionFieldKey, readyForStrategies } from './blocks'

function toCurrent(pick: CatalogQuestion): CurrentQuestion {
  return {
    id: `cat_${pick.field_key}`,
    field_key: pick.field_key,
    question: pick.question,
    why: pick.why,
    area: pick.area,
    importance: pick.importance,
    answer_type: 'textarea',
    expected_type: pick.expected_type,
    blocks_budget: pick.blocks_budget,
    blocks_dev: pick.blocks_dev,
  }
}

function isOpenField(structured: AuditStructured, fieldKey: string): boolean {
  const f = structured[fieldKey]
  if (!f) return true
  return f.status === 'empty' || f.status === 'partial'
}

export type PlanNextResult = {
  question: CurrentQuestion | null
  topic: AuditTopicId | null
  reason: string
  phase: 'basic' | 'deep' | 'done'
}

/**
 * Elige la siguiente pregunta del catálogo de forma determinista.
 * Tras omitir un tema, salta a OTRO tema (nunca el mismo).
 */
export function planNextQuestion(
  audit: ProjectAudit,
  opts?: {
    excludeFieldKeys?: string[]
    excludeTopics?: AuditTopicId[]
    /** Si se acaba de omitir este field_key, se bloquea su topic entero */
    skippedFieldKey?: string | null
    mode?: AuditMode
  }
): PlanNextResult {
  const mode = opts?.mode || audit.active_mode
  const excludeKeys = new Set(opts?.excludeFieldKeys || [])
  const extraTopics: AuditTopicId[] = [...(opts?.excludeTopics || [])]
  if (opts?.skippedFieldKey) {
    extraTopics.push(topicFromFieldKey(opts.skippedFieldKey))
  }
  const blocked = blockedTopics(audit, extraTopics)

  const order = topicOrderForMode(mode)
  const modePool = new Set(
    questionsFor(mode, audit.project_types as AuditProjectType[]).map((q) => q.field_key)
  )
  // En cerrar_huecos / descubrimiento usamos catálogo amplio
  const allowAllKeys =
    mode === 'cerrar_huecos' || mode === 'descubrimiento'
      ? new Set(BASE_QUESTIONS.map((q) => q.field_key))
      : modePool

  const basicSlice = order.slice(0, 7)
  const stillBasic = basicSlice.some((t) => !blocked.has(t))

  for (const topic of order) {
    if (blocked.has(topic)) continue
    const candidates = catalogByTopic(topic).filter((q) => {
      if (!allowAllKeys.has(q.field_key) && !modePool.has(q.field_key)) {
        // permitir básicas en descubrimiento aunque el modePool las filtre mal
        if (mode === 'descubrimiento' && basicSlice.includes(topic)) return true
        if (mode === 'cerrar_huecos') return true
        return modePool.has(q.field_key)
      }
      return true
    })

    const canSolve = readyForStrategies(audit)
    const open = candidates
      .filter((q) => isOpenField(audit.structured, q.field_key) && !excludeKeys.has(q.field_key))
      .filter((q) => canSolve || !isSolutionFieldKey(q.field_key))
      .filter((q) => {
        if (!q.requires?.length) return true
        return q.requires.every((r) => !isOpenField(audit.structured, r))
      })
      .sort((a, b) => {
        const rank = { critical: 0, important: 1, recommended: 2, optional: 3 }
        return rank[a.importance] - rank[b.importance]
      })

    const pick = open[0]
    if (pick) {
      return {
        question: toCurrent(pick),
        topic,
        reason: `planner:${topic}`,
        phase: stillBasic && basicSlice.includes(topic) ? 'basic' : 'deep',
      }
    }
  }

  // Último recurso: cualquier pregunta del modo no cubierta
  const pool = questionsFor(mode, audit.project_types)
    .filter((q) => isOpenField(audit.structured, q.field_key) && !excludeKeys.has(q.field_key))
    .filter((q) => !blocked.has(topicFromCatalog(q)))
    .sort((a, b) => {
      const rank = { critical: 0, important: 1, recommended: 2, optional: 3 }
      return rank[a.importance] - rank[b.importance]
    })

  if (pool[0]) {
    return {
      question: toCurrent(pool[0]),
      topic: topicFromCatalog(pool[0]),
      reason: 'planner:fallback_mode_pool',
      phase: stillBasic ? 'basic' : 'deep',
    }
  }

  return { question: null, topic: null, reason: 'planner:done', phase: 'done' }
}
