import type {
  AuditAreaId,
  AuditBlockId,
  AuditImportance,
  AuditStructured,
  ProjectAudit,
} from './types'
import { BASE_QUESTIONS, type CatalogQuestion } from './catalog'
import { topicFromFieldKey, type AuditTopicId } from './topics'

export type { AuditBlockId }

export type AuditBlockStatus = 'pending' | 'incomplete' | 'completed'

export type AuditBlockProgress = {
  id: AuditBlockId
  label: string
  status: AuditBlockStatus
  answered: number
  total: number
  critical_missing: string[]
  sufficiency: number
  preferred_mode: ProjectAudit['active_mode']
  preferred_area: AuditAreaId
}

export const AUDIT_BLOCKS: {
  id: AuditBlockId
  label: string
  short: string
  preferred_mode: ProjectAudit['active_mode']
  preferred_area: AuditAreaId
}[] = [
  { id: 'cliente', label: 'Cliente y negocio', short: 'Cliente', preferred_mode: 'descubrimiento', preferred_area: 'negocio' },
  { id: 'problema', label: 'Situación y problema', short: 'Problema', preferred_mode: 'descubrimiento', preferred_area: 'problema' },
  { id: 'proceso', label: 'Proceso actual', short: 'Proceso', preferred_mode: 'descubrimiento', preferred_area: 'proceso' },
  { id: 'volumen', label: 'Volumen de trabajo', short: 'Volumen', preferred_mode: 'descubrimiento', preferred_area: 'volumen' },
  { id: 'roi', label: 'Coste y rentabilidad', short: 'ROI', preferred_mode: 'roi', preferred_area: 'roi' },
  { id: 'herramientas', label: 'Herramientas e integraciones', short: 'Herramientas', preferred_mode: 'integraciones', preferred_area: 'integraciones' },
  { id: 'crm', label: 'CRM y datos', short: 'CRM', preferred_mode: 'integraciones', preferred_area: 'datos' },
  { id: 'ia', label: 'IA y documentación', short: 'IA', preferred_mode: 'funcional', preferred_area: 'datos' },
  { id: 'tono', label: 'Tono y comunicación', short: 'Tono', preferred_mode: 'funcional', preferred_area: 'alcance' },
  { id: 'reglas', label: 'Reglas y derivación', short: 'Reglas', preferred_mode: 'funcional', preferred_area: 'alcance' },
  { id: 'legal', label: 'Seguridad y legalidad', short: 'Legal', preferred_mode: 'tecnico', preferred_area: 'seguridad' },
  { id: 'metricas', label: 'Objetivos y métricas', short: 'Métricas', preferred_mode: 'funcional', preferred_area: 'negocio' },
  { id: 'alcance', label: 'Alcance del proyecto', short: 'Alcance', preferred_mode: 'funcional', preferred_area: 'alcance' },
  { id: 'calendario', label: 'Calendario e implantación', short: 'Calendario', preferred_mode: 'presupuesto', preferred_area: 'implantacion' },
  { id: 'presupuesto', label: 'Presupuesto y decisión', short: 'Presupuesto', preferred_mode: 'presupuesto', preferred_area: 'presupuesto' },
]

const FIELD_TO_BLOCK: Record<string, AuditBlockId> = {
  'business.company_summary': 'cliente',
  'business.main_goal': 'cliente',
  'business.ideal_customer': 'cliente',
  'business.how_acquire': 'cliente',
  'business.team_size': 'cliente',
  'business.interlocutor_role': 'cliente',
  'business.decision_makers': 'cliente',
  'problem.main_problem': 'problema',
  'problem.bottlenecks': 'problema',
  'problem.if_unsolved': 'problema',
  'problem.why_now': 'problema',
  'problem.priority': 'problema',
  'process.current_flow': 'proceso',
  'process.trigger': 'proceso',
  'process.exceptions': 'proceso',
  'process.human_only': 'proceso',
  'volume.monthly_volume': 'volumen',
  'volume.channels': 'volumen',
  'volume.peaks': 'volumen',
  'volume.repetitive_pct': 'volumen',
  'roi.people_involved': 'roi',
  'roi.hourly_cost': 'roi',
  'roi.lost_opportunity': 'roi',
  'roi.avg_deal_value': 'roi',
  'integrations.systems': 'herramientas',
  'integrations.api_access': 'herramientas',
  'integrations.primary_source': 'herramientas',
  'crm.name': 'crm',
  'crm.entities': 'crm',
  'crm.read_write': 'crm',
  'users.roles': 'crm',
  'data.sources': 'ia',
  'rag.sources': 'ia',
  'ai.task': 'ia',
  'ai.human_approval': 'ia',
  'tone.style': 'tono',
  'tone.languages': 'tono',
  'tone.escalation_complaints': 'tono',
  'rules.auto_vs_human': 'reglas',
  'rules.escalation': 'reglas',
  'voice.transfer_rules': 'reglas',
  'security.gdpr': 'legal',
  'legal.data_types': 'legal',
  'legal.needs_review': 'legal',
  'metrics.success': 'metricas',
  'metrics.kpi_current': 'metricas',
  'scope.must_have': 'alcance',
  'scope.out_of_scope': 'alcance',
  'scope.nice_to_have': 'alcance',
  'impl.timeline': 'calendario',
  'impl.pilot': 'calendario',
  'impl.access_owners': 'calendario',
  'maint.expectations': 'calendario',
  'budget.range': 'presupuesto',
  'budget.decision_makers': 'presupuesto',
  'budget.blockers': 'presupuesto',
  'voice.inbound_outbound': 'volumen',
}

const AREA_TO_BLOCK: Partial<Record<AuditAreaId, AuditBlockId>> = {
  negocio: 'cliente',
  problema: 'problema',
  proceso: 'proceso',
  volumen: 'volumen',
  roi: 'roi',
  usuarios: 'crm',
  integraciones: 'herramientas',
  datos: 'ia',
  tecnico: 'herramientas',
  seguridad: 'legal',
  alcance: 'alcance',
  implantacion: 'calendario',
  mantenimiento: 'calendario',
  presupuesto: 'presupuesto',
  funcionalidades: 'alcance',
  solucion: 'alcance',
}

const TOPIC_TO_BLOCK: Partial<Record<AuditTopicId, AuditBlockId>> = {
  negocio: 'cliente',
  objetivo: 'metricas',
  problema: 'problema',
  proceso: 'proceso',
  volumen: 'volumen',
  canales: 'volumen',
  roi: 'roi',
  usuarios: 'crm',
  integraciones: 'herramientas',
  datos: 'ia',
  tecnico: 'herramientas',
  seguridad: 'legal',
  alcance: 'alcance',
  implantacion: 'calendario',
  mantenimiento: 'calendario',
  presupuesto: 'presupuesto',
  voz: 'reglas',
  rag: 'ia',
}

const COVERED = new Set([
  'answered',
  'confirmed',
  'estimated',
  'pending_confirmation',
  'not_applicable',
])

const SKIPPED = new Set(['skipped', 'unknown', 'buffalo_later'])

/** Bloques que deben estar cubiertos antes de hablar de solución/arquitectura. */
export const DISCOVERY_GATE_BLOCKS: AuditBlockId[] = [
  'problema',
  'proceso',
  'volumen',
  'herramientas',
]

export function blockFromFieldKey(fieldKey: string | null | undefined): AuditBlockId {
  if (!fieldKey) return 'cliente'
  if (FIELD_TO_BLOCK[fieldKey]) return FIELD_TO_BLOCK[fieldKey]
  const prefix = fieldKey.split('.')[0]?.toLowerCase() || ''
  if (prefix === 'business') return 'cliente'
  if (prefix === 'problem') return 'problema'
  if (prefix === 'process') return 'proceso'
  if (prefix === 'volume') return 'volumen'
  if (prefix === 'roi' || prefix === 'cost') return 'roi'
  if (prefix === 'integration' || prefix === 'integrations' || prefix === 'tech') return 'herramientas'
  if (prefix === 'crm' || prefix === 'users' || prefix === 'user') return 'crm'
  if (prefix === 'data' || prefix === 'rag' || prefix === 'ai') return 'ia'
  if (prefix === 'tone') return 'tono'
  if (prefix === 'rules' || prefix === 'voice') return prefix === 'voice' ? 'reglas' : 'reglas'
  if (prefix === 'security' || prefix === 'legal' || prefix === 'gdpr') return 'legal'
  if (prefix === 'metrics' || prefix === 'metric') return 'metricas'
  if (prefix === 'scope' || prefix === 'solution' || prefix === 'solucion') return 'alcance'
  if (prefix === 'impl' || prefix === 'maint') return 'calendario'
  if (prefix === 'budget') return 'presupuesto'
  return TOPIC_TO_BLOCK[topicFromFieldKey(fieldKey)] || 'cliente'
}

export function blockFromCatalog(q: CatalogQuestion): AuditBlockId {
  if (q.block) return q.block
  return FIELD_TO_BLOCK[q.field_key] || AREA_TO_BLOCK[q.area] || blockFromFieldKey(q.field_key)
}

export function blockFromArea(area: AuditAreaId | string): AuditBlockId {
  return AREA_TO_BLOCK[area as AuditAreaId] || 'cliente'
}

function isFieldCovered(structured: AuditStructured, fieldKey: string): boolean {
  const f = structured[fieldKey]
  return Boolean(f && COVERED.has(f.status) && f.value != null && f.value !== '')
}

function isFieldSkipped(structured: AuditStructured, fieldKey: string): boolean {
  const f = structured[fieldKey]
  return Boolean(f && SKIPPED.has(f.status))
}

function isFieldDone(structured: AuditStructured, fieldKey: string): boolean {
  return isFieldCovered(structured, fieldKey) || isFieldSkipped(structured, fieldKey)
}

function questionsForBlock(block: AuditBlockId): CatalogQuestion[] {
  return BASE_QUESTIONS.filter((q) => blockFromCatalog(q) === block)
}

function weightOf(importance: AuditImportance) {
  if (importance === 'critical') return 4
  if (importance === 'important') return 2
  if (importance === 'recommended') return 1
  return 0.5
}

export function computeBlockStatus(audit: ProjectAudit | null): AuditBlockProgress[] {
  const structured = audit?.structured || {}
  return AUDIT_BLOCKS.map((b) => {
    const qs = questionsForBlock(b.id)
    if (!qs.length) {
      return {
        id: b.id,
        label: b.label,
        status: 'pending' as const,
        answered: 0,
        total: 0,
        critical_missing: [],
        sufficiency: 0,
        preferred_mode: b.preferred_mode,
        preferred_area: b.preferred_area,
      }
    }
    let answered = 0
    let weightDone = 0
    let weightTotal = 0
    const criticalMissing: string[] = []
    for (const q of qs) {
      const w = weightOf(q.importance)
      weightTotal += w
      if (isFieldDone(structured, q.field_key)) {
        answered += 1
        weightDone += w * (structured[q.field_key]?.status === 'pending_confirmation' ? 0.7 : 1)
      } else if (q.importance === 'critical') {
        criticalMissing.push(q.field_key)
      }
    }
    const sufficiency = weightTotal > 0 ? Math.round((weightDone / weightTotal) * 100) : 0
    let status: AuditBlockStatus = 'pending'
    if (answered === 0 && sufficiency === 0) status = 'pending'
    else if (criticalMissing.length === 0 && sufficiency >= 70) status = 'completed'
    else status = 'incomplete'
    return {
      id: b.id,
      label: b.label,
      status,
      answered,
      total: qs.length,
      critical_missing: criticalMissing,
      sufficiency,
      preferred_mode: b.preferred_mode,
      preferred_area: b.preferred_area,
    }
  })
}

export function overallBlockProgress(blocks: AuditBlockProgress[]) {
  const withQs = blocks.filter((b) => b.total > 0)
  const completed = withQs.filter((b) => b.status === 'completed').length
  const avg =
    withQs.length > 0
      ? Math.round(withQs.reduce((s, b) => s + b.sufficiency, 0) / withQs.length)
      : 0
  return { completed, total: withQs.length, percent: avg }
}

/** ¿Ya se puede hablar de estrategias / solución? */
export function readyForStrategies(audit: ProjectAudit): boolean {
  const blocks = computeBlockStatus(audit)
  return DISCOVERY_GATE_BLOCKS.every((id) => {
    const b = blocks.find((x) => x.id === id)
    if (!b || b.total === 0) return true
    return b.status === 'completed' || (b.sufficiency >= 50 && b.critical_missing.length === 0)
  })
}

export function isSolutionFieldKey(fieldKey: string | null | undefined): boolean {
  if (!fieldKey) return false
  const k = fieldKey.toLowerCase()
  return (
    k.startsWith('solution.') ||
    k.startsWith('solucion.') ||
    k.includes('architecture') ||
    k.includes('recommended_stack') ||
    k.includes('proposed_channel')
  )
}
