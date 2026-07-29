/** Tipos del copiloto de auditoría (v2). */

export type AuditMode =
  | 'descubrimiento'
  | 'roi'
  | 'funcional'
  | 'tecnico'
  | 'integraciones'
  | 'presupuesto'
  | 'cerrar_huecos'

export type AuditAreaId =
  | 'negocio'
  | 'problema'
  | 'proceso'
  | 'volumen'
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
  | 'funcionalidades'
  | 'solucion'

export type AuditFieldStatus =
  | 'empty'
  | 'answered'
  | 'partial'
  | 'pending_confirmation'
  | 'skipped'
  | 'not_applicable'
  | 'unknown'
  | 'buffalo_later'
  | 'contradictory'
  | 'pending'
  | 'confirmed'
  | 'estimated'

export type AuditFieldSource =
  | 'client'
  | 'client_estimate'
  | 'buffalo'
  | 'ai_assumption'
  | 'ai_inference'
  | 'unknown'

export type AuditImportance = 'critical' | 'important' | 'recommended' | 'optional'

export type AuditProjectType =
  | 'voice_agent'
  | 'text_agent'
  | 'automation'
  | 'rag'
  | 'scraping'
  | 'dashboard'
  | 'integration'
  | 'custom'
  | 'unclear'

export type AuditAnswerType =
  | 'text'
  | 'textarea'
  | 'single_select'
  | 'multi_select'
  | 'number'
  | 'currency'
  | 'percentage'
  | 'date'
  | 'yes_no'
  | 'scale'
  | 'confirmation'

export type AuditQuestionStatus =
  | 'open'
  | 'answered'
  | 'skipped'
  | 'pending'
  | 'not_applicable'
  | 'unknown'
  | 'buffalo_later'
  | 'resolved'

export type AuditMessageType =
  | 'text'
  | 'question'
  | 'answer'
  | 'system'
  | 'mode_separator'
  | 'example'
  | 'gap'

export type AuditFieldValue = {
  value: string | number | boolean | string[] | null
  raw_answer?: string
  status: AuditFieldStatus
  source: AuditFieldSource
  confidence: number
  importance: AuditImportance
  area: AuditAreaId
  updated_at: string
  note?: string | null
  follow_up_owner?: 'client' | 'buffalo' | null
  message_id?: string | null
  question_id?: string | null
}

export type AuditStructured = Record<string, AuditFieldValue>

export type AuditQuestionOption = {
  id: string
  label: string
  value: string
  description?: string
}

export type AuditQuestion = {
  id: string
  message_id: string | null
  mode: AuditMode
  category: AuditAreaId | string
  field_key: string
  text: string
  help_text?: string | null
  reason?: string | null
  importance: AuditImportance
  answer_type: AuditAnswerType
  options?: AuditQuestionOption[]
  allow_other?: boolean
  unit?: string | null
  status: AuditQuestionStatus
  skipped_at?: string | null
  answered_at?: string | null
  order: number
  created_at: string
}

export type AuditAnswer = {
  id: string
  question_id: string
  message_id: string | null
  value: string | number | boolean | string[] | null
  raw_text: string
  answered_by: 'client' | 'buffalo' | 'system'
  status: AuditQuestionStatus
  created_at: string
  updated_at: string
  late?: boolean
}

export type AuditGap = {
  id: string
  related_question_id?: string | null
  title: string
  description: string
  category: string
  importance: AuditImportance
  owner: 'client' | 'buffalo' | 'unknown'
  status: 'open' | 'converted' | 'resolved'
  created_at: string
}

export type AuditConversationTurn = {
  id: string
  role: 'assistant' | 'user' | 'system'
  content: string
  mode: AuditMode
  area: AuditAreaId
  field_key?: string | null
  question_id?: string | null
  answer_id?: string | null
  message_type?: AuditMessageType
  created_at: string
  meta?: Record<string, unknown>
}

export type AuditContextSectionKey =
  | 'empresa'
  | 'problema'
  | 'objetivos'
  | 'proceso'
  | 'usuarios'
  | 'volumen'
  | 'roi'
  | 'solucion'
  | 'funcionalidades'
  | 'integraciones'
  | 'datos'
  | 'tecnico'
  | 'seguridad'
  | 'presupuesto'
  | 'riesgos'
  | 'decisiones'
  | 'suposiciones'
  | 'pendientes'

export type AuditContextItem = {
  path: string
  label: string
  value: string
  status: AuditFieldStatus
  source: AuditFieldSource
  confidence: number
  updated_at: string
  message_id?: string | null
}

export type AuditContextPanel = {
  sections: Partial<Record<AuditContextSectionKey, AuditContextItem[]>>
  /** Legacy flat lists (compat UI) */
  key_facts: string[]
  risks: string[]
  integrations: string[]
  decisions: string[]
  contradictions: string[]
  pending_client: string[]
  assumptions: string[]
  next_hint: string | null
}

export type AuditProgressMap = Record<string, number>

export type AuditAreaProgress = {
  id: AuditAreaId | string
  label: string
  answered: number
  critical_missing: number
  sufficiency: number
}

export type CurrentQuestion = {
  id: string
  field_key: string
  question: string
  help_text?: string | null
  why: string
  area: AuditAreaId | string
  importance: AuditImportance
  answer_type: AuditAnswerType
  options?: AuditQuestionOption[]
  allow_other?: boolean
  unit?: string | null
  expected_type?: 'text' | 'number' | 'list' | 'boolean'
  blocks_budget?: boolean
  blocks_dev?: boolean
}

export type ProjectAudit = {
  id: string
  lead_id: number
  project_types: AuditProjectType[]
  active_mode: AuditMode
  active_area: AuditAreaId
  active_question_id: string | null
  structured: AuditStructured
  conversation: AuditConversationTurn[]
  questions: AuditQuestion[]
  answers: AuditAnswer[]
  gaps: AuditGap[]
  progress: AuditProgressMap
  context: AuditContextPanel
  status: 'draft' | 'in_progress' | 'ready_for_proposal' | 'closed'
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type AuditAnswerAction =
  | 'save_continue'
  | 'skip'
  | 'not_applicable'
  | 'unknown'
  | 'buffalo_later'
  | 'add_buffalo_note'
  | 'ask_example'
  | 'resolve'

export const AUDIT_MODES: { id: AuditMode; label: string; hint: string }[] = [
  { id: 'descubrimiento', label: 'Descubrimiento', hint: 'Empresa, problema y proceso actual' },
  { id: 'roi', label: 'ROI', hint: 'Horas, costes y retorno' },
  { id: 'funcional', label: 'Funcional', hint: 'Qué debe hacer la solución' },
  { id: 'tecnico', label: 'Técnico', hint: 'Stack, APIs, entornos' },
  { id: 'integraciones', label: 'Integraciones', hint: 'Sistemas y flujos de datos' },
  { id: 'presupuesto', label: 'Presupuesto', hint: 'Complejidad y estimación' },
  { id: 'cerrar_huecos', label: 'Cerrar huecos', hint: 'Solo lo imprescindible que falta' },
]

export const AUDIT_AREAS: { id: AuditAreaId; label: string }[] = [
  { id: 'negocio', label: 'Negocio y contexto' },
  { id: 'problema', label: 'Problema actual' },
  { id: 'proceso', label: 'Proceso actual' },
  { id: 'volumen', label: 'Volumen y operativa' },
  { id: 'roi', label: 'Impacto económico y ROI' },
  { id: 'usuarios', label: 'Usuarios y roles' },
  { id: 'funcionalidades', label: 'Funcionalidades' },
  { id: 'solucion', label: 'Solución propuesta' },
  { id: 'integraciones', label: 'Integraciones' },
  { id: 'datos', label: 'Datos disponibles' },
  { id: 'tecnico', label: 'Requisitos técnicos' },
  { id: 'seguridad', label: 'Seguridad y RGPD' },
  { id: 'alcance', label: 'Alcance y funcionalidades' },
  { id: 'implantacion', label: 'Implantación' },
  { id: 'mantenimiento', label: 'Mantenimiento' },
  { id: 'presupuesto', label: 'Presupuesto y decisión' },
]

export const AUDIT_CONTEXT_SECTIONS: { id: AuditContextSectionKey; label: string }[] = [
  { id: 'empresa', label: 'Empresa y actividad' },
  { id: 'problema', label: 'Problema actual' },
  { id: 'objetivos', label: 'Objetivos' },
  { id: 'proceso', label: 'Proceso actual' },
  { id: 'usuarios', label: 'Usuarios y responsables' },
  { id: 'volumen', label: 'Volumen y operativa' },
  { id: 'roi', label: 'Impacto económico y ROI' },
  { id: 'solucion', label: 'Solución propuesta' },
  { id: 'funcionalidades', label: 'Funcionalidades' },
  { id: 'integraciones', label: 'Integraciones' },
  { id: 'datos', label: 'Datos disponibles' },
  { id: 'tecnico', label: 'Requisitos técnicos' },
  { id: 'seguridad', label: 'Seguridad y RGPD' },
  { id: 'presupuesto', label: 'Presupuesto' },
  { id: 'riesgos', label: 'Riesgos' },
  { id: 'decisiones', label: 'Decisiones' },
  { id: 'suposiciones', label: 'Suposiciones' },
  { id: 'pendientes', label: 'Pendientes' },
]

export const AUDIT_PROJECT_TYPES: { id: AuditProjectType; label: string }[] = [
  { id: 'voice_agent', label: 'Agente de voz' },
  { id: 'text_agent', label: 'Agente de texto' },
  { id: 'automation', label: 'Automatización' },
  { id: 'rag', label: 'RAG / conocimiento' },
  { id: 'scraping', label: 'Scraping' },
  { id: 'dashboard', label: 'Dashboard / app' },
  { id: 'integration', label: 'Integración sistemas' },
  { id: 'custom', label: 'Personalizado' },
  { id: 'unclear', label: 'Aún no está claro' },
]

export function emptyContext(): AuditContextPanel {
  return {
    sections: {},
    key_facts: [],
    risks: [],
    integrations: [],
    decisions: [],
    contradictions: [],
    pending_client: [],
    assumptions: [],
    next_hint: null,
  }
}

export function emptyAuditCollections() {
  return {
    questions: [] as AuditQuestion[],
    answers: [] as AuditAnswer[],
    gaps: [] as AuditGap[],
    progress: {} as AuditProgressMap,
    active_question_id: null as string | null,
    started_at: null as string | null,
    completed_at: null as string | null,
  }
}

export function modeLabel(mode: AuditMode): string {
  return AUDIT_MODES.find((m) => m.id === mode)?.label || mode
}
