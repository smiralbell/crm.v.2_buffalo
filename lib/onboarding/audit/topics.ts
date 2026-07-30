import type { AuditAreaId, AuditMode, AuditStructured, ProjectAudit } from './types'
import { BASE_QUESTIONS, type CatalogQuestion } from './catalog'

/** Tema semántico (más estable que field_key suelto). */
export type AuditTopicId =
  | 'negocio'
  | 'objetivo'
  | 'problema'
  | 'proceso'
  | 'volumen'
  | 'canales'
  | 'roi'
  | 'usuarios'
  | 'integraciones'
  | 'datos'
  | 'tecnico'
  | 'seguridad'
  | 'alcance'
  | 'implantacion'
  | 'mantenimiento'
  | 'presupuesto'
  | 'voz'
  | 'rag'
  | 'otro'

/** Orden de fase básica (descubrimiento / primeras preguntas). */
export const BASIC_TOPIC_ORDER: AuditTopicId[] = [
  'negocio',
  'objetivo',
  'problema',
  'proceso',
  'volumen',
  'canales',
  'roi',
]

/** Temas de profundidad (después de básicas). */
export const DEEP_TOPIC_ORDER: AuditTopicId[] = [
  'usuarios',
  'integraciones',
  'datos',
  'tecnico',
  'seguridad',
  'alcance',
  'implantacion',
  'mantenimiento',
  'presupuesto',
  'voz',
  'rag',
]

const FIELD_TO_TOPIC: Record<string, AuditTopicId> = {
  'business.company_summary': 'negocio',
  'business.main_goal': 'objetivo',
  'business.ideal_customer': 'negocio',
  'business.interlocutor_role': 'negocio',
  'business.team_size': 'negocio',
  'problem.main_problem': 'problema',
  'problem.bottlenecks': 'problema',
  'problem.if_unsolved': 'problema',
  'problem.priority': 'problema',
  'process.current_flow': 'proceso',
  'process.trigger': 'proceso',
  'process.human_only': 'proceso',
  'volume.monthly_volume': 'volumen',
  'volume.channels': 'canales',
  'volume.peaks': 'volumen',
  'volume.repetitive_pct': 'volumen',
  'roi.people_involved': 'roi',
  'roi.hourly_cost': 'roi',
  'roi.lost_opportunity': 'roi',
  'roi.avg_deal_value': 'roi',
  'users.roles': 'usuarios',
  'integrations.systems': 'integraciones',
  'integrations.api_access': 'integraciones',
  'integrations.primary_source': 'integraciones',
  'crm.name': 'integraciones',
  'crm.entities': 'datos',
  'crm.read_write': 'datos',
  'data.sources': 'datos',
  'ai.task': 'rag',
  'ai.human_approval': 'rag',
  'tech.environments': 'tecnico',
  'security.gdpr': 'seguridad',
  'legal.needs_review': 'seguridad',
  'tone.style': 'alcance',
  'tone.languages': 'alcance',
  'rules.auto_vs_human': 'alcance',
  'rules.escalation': 'alcance',
  'metrics.success': 'objetivo',
  'metrics.kpi_current': 'objetivo',
  'scope.must_have': 'alcance',
  'scope.nice_to_have': 'alcance',
  'scope.out_of_scope': 'alcance',
  'impl.timeline': 'implantacion',
  'impl.access_owners': 'implantacion',
  'impl.pilot': 'implantacion',
  'maint.expectations': 'mantenimiento',
  'budget.range': 'presupuesto',
  'budget.decision_makers': 'presupuesto',
  'budget.blockers': 'presupuesto',
  'voice.inbound_outbound': 'voz',
  'voice.transfer_rules': 'voz',
  'rag.sources': 'rag',
}

const AREA_TO_TOPIC: Partial<Record<AuditAreaId, AuditTopicId>> = {
  negocio: 'negocio',
  problema: 'problema',
  proceso: 'proceso',
  volumen: 'volumen',
  roi: 'roi',
  usuarios: 'usuarios',
  integraciones: 'integraciones',
  datos: 'datos',
  tecnico: 'tecnico',
  seguridad: 'seguridad',
  alcance: 'alcance',
  implantacion: 'implantacion',
  mantenimiento: 'mantenimiento',
  presupuesto: 'presupuesto',
}

const COVERED = new Set([
  'answered',
  'confirmed',
  'estimated',
  'pending_confirmation',
  'not_applicable',
  'unknown',
  'buffalo_later',
  'skipped',
])

export function topicFromFieldKey(fieldKey: string | null | undefined): AuditTopicId {
  if (!fieldKey) return 'otro'
  if (FIELD_TO_TOPIC[fieldKey]) return FIELD_TO_TOPIC[fieldKey]
  const prefix = fieldKey.split('.')[0]?.toLowerCase() || ''
  if (prefix === 'business') return fieldKey.includes('goal') ? 'objetivo' : 'negocio'
  if (prefix === 'problem') return 'problema'
  if (prefix === 'process') return 'proceso'
  if (prefix === 'volume') return fieldKey.includes('channel') ? 'canales' : 'volumen'
  if (prefix === 'roi' || prefix === 'cost') return 'roi'
  if (prefix === 'user' || prefix === 'users') return 'usuarios'
  if (prefix === 'integration' || prefix === 'integrations') return 'integraciones'
  if (prefix === 'data' || prefix === 'rag') return prefix === 'rag' ? 'rag' : 'datos'
  if (prefix === 'tech' || prefix === 'tecnico') return 'tecnico'
  if (prefix === 'security' || prefix === 'gdpr') return 'seguridad'
  if (prefix === 'scope') return 'alcance'
  if (prefix === 'impl') return 'implantacion'
  if (prefix === 'maint') return 'mantenimiento'
  if (prefix === 'budget') return 'presupuesto'
  if (prefix === 'voice') return 'voz'
  if (prefix === 'auto') {
    // auto.volumen.xxx → intentar inferir
    const t = fieldKey.toLowerCase()
    if (/volumen|volume|lead|ticket|llamad/.test(t)) return 'volumen'
    if (/roi|persona|hora|coste|costo/.test(t)) return 'roi'
    if (/proceso|flow|flujo/.test(t)) return 'proceso'
    if (/empresa|negocio|company/.test(t)) return 'negocio'
    if (/problema|pain/.test(t)) return 'problema'
    if (/integr/.test(t)) return 'integraciones'
    if (/presupuest|budget/.test(t)) return 'presupuesto'
  }
  return 'otro'
}

export function topicFromCatalog(q: CatalogQuestion): AuditTopicId {
  return FIELD_TO_TOPIC[q.field_key] || AREA_TO_TOPIC[q.area] || topicFromFieldKey(q.field_key)
}

export function isStructuredCovered(structured: AuditStructured, fieldKey: string): boolean {
  const f = structured[fieldKey]
  return Boolean(f && COVERED.has(f.status))
}

/** Temas ya cerrados (respondidos, inferidos, N/A, unknown, buffalo_later). Skip NO cuenta como “cubierto con dato” pero sí como “no repreguntar”. */
export function coveredTopics(audit: ProjectAudit): Set<AuditTopicId> {
  const out = new Set<AuditTopicId>()
  for (const [k, v] of Object.entries(audit.structured || {})) {
    if (
      v &&
      ['answered', 'confirmed', 'estimated', 'pending_confirmation', 'not_applicable'].includes(
        v.status
      ) &&
      v.value != null &&
      v.value !== ''
    ) {
      out.add(topicFromFieldKey(k))
    }
  }
  return out
}

export function skippedTopics(audit: ProjectAudit): Set<AuditTopicId> {
  const out = new Set<AuditTopicId>()
  for (const [k, v] of Object.entries(audit.structured || {})) {
    if (v?.status === 'skipped' || v?.status === 'unknown' || v?.status === 'buffalo_later') {
      out.add(topicFromFieldKey(k))
    }
  }
  for (const q of audit.questions || []) {
    if (['skipped', 'unknown', 'buffalo_later', 'not_applicable'].includes(q.status)) {
      out.add(topicFromFieldKey(q.field_key))
    }
  }
  return out
}

export function blockedTopics(
  audit: ProjectAudit,
  extraExclude: AuditTopicId[] = []
): Set<AuditTopicId> {
  const out = new Set<AuditTopicId>()
  for (const t of Array.from(coveredTopics(audit))) out.add(t)
  for (const t of Array.from(skippedTopics(audit))) out.add(t)
  for (const t of extraExclude) out.add(t)
  return out
}

export function basicPhaseComplete(audit: ProjectAudit): boolean {
  const blocked = blockedTopics(audit)
  return BASIC_TOPIC_ORDER.every((t) => blocked.has(t))
}

export function topicOrderForMode(mode: AuditMode): AuditTopicId[] {
  if (mode === 'descubrimiento') return [...BASIC_TOPIC_ORDER, ...DEEP_TOPIC_ORDER]
  if (mode === 'roi') return ['volumen', 'canales', 'roi', 'problema', 'objetivo']
  if (mode === 'funcional') return ['proceso', 'usuarios', 'alcance', 'voz', 'rag', 'objetivo']
  if (mode === 'tecnico') return ['tecnico', 'datos', 'integraciones', 'seguridad', 'rag']
  if (mode === 'integraciones') return ['integraciones', 'datos', 'tecnico']
  if (mode === 'presupuesto') return ['presupuesto', 'roi', 'volumen', 'alcance']
  if (mode === 'cerrar_huecos') return [...BASIC_TOPIC_ORDER, ...DEEP_TOPIC_ORDER]
  return [...BASIC_TOPIC_ORDER, ...DEEP_TOPIC_ORDER]
}

/** Heurística local: relleno de hechos desde texto libre (sin LLM). */
export function inferFactsFromText(
  text: string,
  structured: AuditStructured
): Array<{ path: string; value: string | number; status: 'estimated' | 'confirmed'; topic: AuditTopicId }> {
  const t = text.trim()
  if (!t || t.length < 4) return []
  const out: Array<{
    path: string
    value: string | number
    status: 'estimated' | 'confirmed'
    topic: AuditTopicId
  }> = []
  const lower = t.toLowerCase()

  // Volumen numérico
  const volMatch = lower.match(
    /(\d[\d.\s]*)\s*(leads?|llamadas?|tickets?|consultas?|emails?|mensajes?|documentos?)\s*(\/\s*mes|al mes|mensuales?|mensual)?/i
  )
  if (volMatch && !isStructuredCovered(structured, 'volume.monthly_volume')) {
    const num = parseFloat(volMatch[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(num) && num > 0) {
      out.push({
        path: 'volume.monthly_volume',
        value: num,
        status: /aprox|unos|alrededor|cerca/i.test(t) ? 'estimated' : 'confirmed',
        topic: 'volumen',
      })
    }
  }

  // Personas + horas
  const peopleMatch = lower.match(
    /(\d+)\s*(personas?|empleados?|comerciales?|agentes?|operadores?).{0,40}?(\d+)\s*(h|horas?)/i
  )
  const peopleOnly = lower.match(/(\d+)\s*(personas?|empleados?|comerciales?)/i)
  if (!isStructuredCovered(structured, 'roi.people_involved')) {
    if (peopleMatch) {
      out.push({
        path: 'roi.people_involved',
        value: `${peopleMatch[1]} personas, ~${peopleMatch[3]} ${peopleMatch[4]}/semana`,
        status: 'estimated',
        topic: 'roi',
      })
    } else if (peopleOnly) {
      out.push({
        path: 'roi.people_involved',
        value: `${peopleOnly[1]} personas`,
        status: 'estimated',
        topic: 'roi',
      })
    }
  }

  return out
}

export function catalogByTopic(topic: AuditTopicId): CatalogQuestion[] {
  return BASE_QUESTIONS.filter((q) => topicFromCatalog(q) === topic)
}
