import { BASE_QUESTIONS, type CatalogQuestion } from '@/lib/onboarding/audit/catalog'
import { topicFromCatalog, BASIC_TOPIC_ORDER, DEEP_TOPIC_ORDER, type AuditTopicId } from '@/lib/onboarding/audit/topics'
import type { AuditImportance, AuditProjectType, AuditStructured, ProjectAudit } from '@/lib/onboarding/audit/types'

export type ChecklistItem = CatalogQuestion & {
  topic: AuditTopicId
  covered: boolean
  skipped: boolean
  map_checked: boolean
  note: string | null
  answered_value: string | null
  phase: 'basic' | 'deep'
}

const COVERED = new Set([
  'answered',
  'confirmed',
  'estimated',
  'pending_confirmation',
  'not_applicable',
])

function matchesProject(q: CatalogQuestion, types: AuditProjectType[]) {
  if (!q.project_types || q.project_types.length === 0) return true
  const t = types.length ? types : (['unclear'] as AuditProjectType[])
  return q.project_types.some((x) => t.includes(x) || t.includes('unclear'))
}

export function buildAuditChecklist(audit: ProjectAudit | null): ChecklistItem[] {
  const structured: AuditStructured = audit?.structured || {}
  const types = (audit?.project_types || ['unclear']) as AuditProjectType[]
  const basicSet = new Set(BASIC_TOPIC_ORDER)

  return BASE_QUESTIONS.filter((q) => matchesProject(q, types)).map((q) => {
    const topic = topicFromCatalog(q)
    const f = structured[q.field_key]
    const covered = Boolean(f && COVERED.has(f.status) && f.value != null && f.value !== '')
    const skipped = Boolean(
      f && ['skipped', 'unknown', 'buffalo_later'].includes(f.status)
    )
    const value =
      f?.value == null
        ? null
        : Array.isArray(f.value)
          ? f.value.join(', ')
          : String(f.value)
    return {
      ...q,
      topic,
      covered,
      skipped,
      map_checked: f?.map_checked === true || (f?.map_checked !== false && covered),
      note: f?.note ?? null,
      answered_value: value,
      phase: basicSet.has(topic) ? 'basic' : 'deep',
    }
  })
}

export function groupChecklistByTopic(items: ChecklistItem[]) {
  const order = [...BASIC_TOPIC_ORDER, ...DEEP_TOPIC_ORDER]
  const map = new Map<AuditTopicId, ChecklistItem[]>()
  for (const it of items) {
    const list = map.get(it.topic) || []
    list.push(it)
    map.set(it.topic, list)
  }
  return order
    .filter((t) => map.has(t))
    .map((t) => ({ topic: t, items: map.get(t)! }))
}

export function importanceLabel(i: AuditImportance) {
  if (i === 'critical') return 'Crítica'
  if (i === 'important') return 'Importante'
  if (i === 'recommended') return 'Recomendada'
  return 'Opcional'
}

export const TOPIC_LABELS: Record<AuditTopicId, string> = {
  negocio: 'Negocio',
  objetivo: 'Objetivo',
  problema: 'Problema',
  proceso: 'Proceso',
  volumen: 'Volumen',
  canales: 'Canales',
  roi: 'ROI / personas',
  usuarios: 'Usuarios',
  integraciones: 'Integraciones',
  datos: 'Datos',
  tecnico: 'Técnico',
  seguridad: 'Seguridad',
  alcance: 'Alcance',
  implantacion: 'Implantación',
  mantenimiento: 'Mantenimiento',
  presupuesto: 'Presupuesto',
  voz: 'Voz',
  rag: 'RAG / conocimiento',
  otro: 'Otros',
}
