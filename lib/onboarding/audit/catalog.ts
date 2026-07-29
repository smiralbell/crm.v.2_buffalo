import type {
  AuditAreaId,
  AuditImportance,
  AuditMode,
  AuditProjectType,
  AuditStructured,
  CurrentQuestion,
} from './types'
import { AUDIT_AREAS } from './types'

export type CatalogQuestion = {
  field_key: string
  question: string
  why: string
  area: AuditAreaId
  importance: AuditImportance
  expected_type: 'text' | 'number' | 'list' | 'boolean'
  blocks_budget: boolean
  blocks_dev: boolean
  modes: AuditMode[]
  project_types?: AuditProjectType[] // vacío = todas
}

/** Preguntas base Buffalo (MVP). La IA puede generar follow-ups encima. */
export const BASE_QUESTIONS: CatalogQuestion[] = [
  {
    field_key: 'business.company_summary',
    question: '¿A qué se dedica la empresa y quién es el interlocutor en esta reunión?',
    why: 'Contexto comercial y tono de la propuesta',
    area: 'negocio',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['descubrimiento', 'cerrar_huecos'],
  },
  {
    field_key: 'business.main_goal',
    question: '¿Qué queréis conseguir con este proyecto en los próximos 3–6 meses?',
    why: 'Objetivo que ancla alcance y éxito',
    area: 'negocio',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['descubrimiento', 'funcional', 'cerrar_huecos'],
  },
  {
    field_key: 'problem.main_problem',
    question: '¿Cuál es el problema principal que queréis resolver hoy?',
    why: 'Núcleo de la propuesta y del ROI',
    area: 'problema',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['descubrimiento', 'roi', 'cerrar_huecos'],
  },
  {
    field_key: 'process.current_flow',
    question: '¿Cómo es el proceso actual, paso a paso, desde que entra la demanda hasta que se resuelve?',
    why: 'Mapa operativo para diseñar la solución',
    area: 'proceso',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['descubrimiento', 'funcional', 'cerrar_huecos'],
  },
  {
    field_key: 'volume.monthly_volume',
    question: '¿Qué volumen mensual manejáis (leads, llamadas, tickets, documentos…)? Dad una cifra aproximada.',
    why: 'Dimensiona infraestructura y ahorro',
    area: 'volumen',
    importance: 'critical',
    expected_type: 'number',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['descubrimiento', 'roi', 'presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'volume.channels',
    question: '¿Por qué canales entra ese volumen y en qué franja horaria hay más pico?',
    why: 'Canales y picos afectan diseño y coste',
    area: 'volumen',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['descubrimiento', 'roi', 'funcional'],
  },
  {
    field_key: 'roi.people_involved',
    question: '¿Cuántas personas intervienen hoy en este proceso y cuántas horas/semana dedican en total?',
    why: 'Base del cálculo de ahorro',
    area: 'roi',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['roi', 'presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'roi.hourly_cost',
    question: '¿Cuál es aproximadamente el coste por hora (o coste mensual del equipo) que interviene?',
    why: 'Convierte horas en € de ROI',
    area: 'roi',
    importance: 'important',
    expected_type: 'number',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['roi', 'presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'roi.lost_opportunity',
    question: '¿Qué se pierde hoy por no responder a tiempo o por errores (leads, ventas, reclamaciones)?',
    why: 'Impacto de no hacer el proyecto',
    area: 'roi',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['roi', 'cerrar_huecos'],
  },
  {
    field_key: 'users.roles',
    question: '¿Quién usará la solución y qué roles tienen (comercial, admin, cliente final…)?',
    why: 'Permisos, UX y alcance',
    area: 'usuarios',
    importance: 'important',
    expected_type: 'list',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['funcional', 'descubrimiento'],
  },
  {
    field_key: 'integrations.systems',
    question: '¿Qué sistemas usáis hoy (CRM, ERP, email, WhatsApp, teléfono, Excel…)?',
    why: 'Inventario de integraciones',
    area: 'integraciones',
    importance: 'critical',
    expected_type: 'list',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['integraciones', 'tecnico', 'descubrimiento', 'cerrar_huecos'],
  },
  {
    field_key: 'integrations.api_access',
    question: 'De esos sistemas, ¿hay API / webhooks disponibles y quién puede dar accesos?',
    why: 'Riesgo técnico y plazos',
    area: 'integraciones',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['integraciones', 'tecnico', 'cerrar_huecos'],
  },
  {
    field_key: 'data.sources',
    question: '¿Qué datos o documentos alimentarán la solución (PDFs, tickets, bases, históricos)?',
    why: 'Necesario para RAG / reglas / calidad',
    area: 'datos',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['tecnico', 'funcional', 'descubrimiento'],
    project_types: ['rag', 'text_agent', 'voice_agent', 'custom', 'unclear'],
  },
  {
    field_key: 'tech.environments',
    question: '¿Tenéis entorno de pruebas y producción separados? ¿Dónde debe alojarse la solución?',
    why: 'Arquitectura y compliance',
    area: 'tecnico',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['tecnico', 'cerrar_huecos'],
  },
  {
    field_key: 'security.gdpr',
    question: '¿Hay datos personales o sensibles? ¿Qué requisitos de RGPD / retención / consentimiento aplican?',
    why: 'Bloquea diseño y cláusulas',
    area: 'seguridad',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['tecnico', 'descubrimiento', 'cerrar_huecos'],
  },
  {
    field_key: 'scope.must_have',
    question: '¿Qué funcionalidades son imprescindibles en la v1 (must-have)?',
    why: 'Alcance cerrado para presupuestar',
    area: 'alcance',
    importance: 'critical',
    expected_type: 'list',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['funcional', 'presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'scope.out_of_scope',
    question: '¿Qué queda explícitamente fuera de esta fase?',
    why: 'Evita scope creep en la propuesta',
    area: 'alcance',
    importance: 'important',
    expected_type: 'list',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['funcional', 'presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'impl.timeline',
    question: '¿Hay una fecha objetivo o urgencia real de puesta en marcha?',
    why: 'Planificación y factor de riesgo',
    area: 'implantacion',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['presupuesto', 'descubrimiento', 'cerrar_huecos'],
  },
  {
    field_key: 'maint.expectations',
    question: '¿Qué esperáis de mantenimiento/soporte tras el go-live (horario, SLA, cambios)?',
    why: 'Mensualidad y compromiso',
    area: 'mantenimiento',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'budget.range',
    question: '¿Hay un rango de inversión o techo aproximado para el setup?',
    why: 'Encaja propuesta sin perder tiempo',
    area: 'presupuesto',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'budget.decision_makers',
    question: '¿Quién decide la compra y qué necesitan ver para aprobar?',
    why: 'Cierra el ciclo comercial',
    area: 'presupuesto',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['presupuesto', 'descubrimiento', 'cerrar_huecos'],
  },
  // Voice-specific
  {
    field_key: 'voice.inbound_outbound',
    question: '¿Las llamadas serán entrantes, salientes o ambas? ¿Duración media y simultaneidad esperada?',
    why: 'Dimensionado de voz / coste Retell',
    area: 'volumen',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['funcional', 'tecnico', 'presupuesto', 'cerrar_huecos'],
    project_types: ['voice_agent'],
  },
  {
    field_key: 'voice.transfer_rules',
    question: '¿Cuándo debe transferir a un humano y qué información debe recoger antes?',
    why: 'Reglas de negocio del agente de voz',
    area: 'alcance',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['funcional', 'cerrar_huecos'],
    project_types: ['voice_agent'],
  },
  // RAG-specific
  {
    field_key: 'rag.sources',
    question: '¿Cuáles son las fuentes de conocimiento (nº docs, formatos, frecuencia de actualización)?',
    why: 'Diseño RAG y coste de ingesta',
    area: 'datos',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['tecnico', 'funcional', 'cerrar_huecos'],
    project_types: ['rag'],
  },
]

export function questionsFor(
  mode: AuditMode,
  projectTypes: AuditProjectType[]
): CatalogQuestion[] {
  const types = projectTypes.length ? projectTypes : (['unclear'] as AuditProjectType[])
  return BASE_QUESTIONS.filter((q) => {
    if (!q.modes.includes(mode) && mode !== 'cerrar_huecos') {
      // en cerrar_huecos ya filtramos por modes arriba incluyendo cerrar_huecos
    }
    if (!q.modes.includes(mode)) return false
    if (!q.project_types || q.project_types.length === 0) return true
    return q.project_types.some((t) => types.includes(t) || types.includes('unclear'))
  })
}

export function pickNextCatalogQuestion(
  mode: AuditMode,
  projectTypes: AuditProjectType[],
  structured: AuditStructured,
  preferredArea?: AuditAreaId | null
): CurrentQuestion | null {
  const pool = questionsFor(mode, projectTypes)
  const unanswered = pool.filter((q) => {
    const f = structured[q.field_key]
    if (!f) return true
    // skipped/unknown/etc. no se vuelven a preguntar automáticamente (van a Pendientes)
    return f.status === 'empty' || f.status === 'partial'
  })

  const criticalFirst = [...unanswered].sort((a, b) => {
    const rank = { critical: 0, important: 1, recommended: 2, optional: 3 }
    return rank[a.importance] - rank[b.importance]
  })

  const inArea = preferredArea
    ? criticalFirst.filter((q) => q.area === preferredArea)
    : []
  const pick = inArea[0] || criticalFirst[0]
  if (!pick) return null

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

export function computeAreaProgress(structured: AuditStructured): {
  id: AuditAreaId
  label: string
  answered: number
  critical_missing: number
  sufficiency: number
}[] {
  return AUDIT_AREAS.map((area) => {
    const qs = BASE_QUESTIONS.filter((q) => q.area === area.id)
    if (qs.length === 0) {
      return { id: area.id, label: area.label, answered: 0, critical_missing: 0, sufficiency: 0 }
    }
    let answered = 0
    let criticalMissing = 0
    let weightDone = 0
    let weightTotal = 0
    for (const q of qs) {
      const w = q.importance === 'critical' ? 4 : q.importance === 'important' ? 2 : 1
      weightTotal += w
      const f = structured[q.field_key]
      const ok =
        f &&
        (f.status === 'answered' ||
          f.status === 'pending_confirmation' ||
          f.status === 'not_applicable')
      if (ok) {
        answered += 1
        weightDone += w * (f.status === 'pending_confirmation' ? 0.7 : 1)
      } else if (q.importance === 'critical') {
        criticalMissing += 1
      }
    }
    const sufficiency = weightTotal > 0 ? Math.round((weightDone / weightTotal) * 100) : 0
    return {
      id: area.id,
      label: area.label,
      answered,
      critical_missing: criticalMissing,
      sufficiency,
    }
  })
}
