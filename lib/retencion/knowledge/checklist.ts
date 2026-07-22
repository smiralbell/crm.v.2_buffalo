import { extractKnowledgeSection } from './render'
import { KNOWLEDGE_SECTIONS } from './template'

export type ChecklistItemId = 'db_access' | 'roi_resolved' | 'project_understood'

export type ChecklistItemState = {
  ok: boolean
  detail: string
  checked_at?: string
  /** agent = marcado explícitamente por el agente; auto = heurística */
  source?: 'agent' | 'auto'
}

export type AuditChecklist = Record<ChecklistItemId, ChecklistItemState>

export const CHECKLIST_META: Record<
  ChecklistItemId,
  { title: string; question: string }
> = {
  db_access: {
    title: 'Base de datos',
    question: '¿Acceso a Postgres y entiende las columnas clave?',
  },
  roi_resolved: {
    title: 'ROI / coste manual',
    question: '¿Preguntas de tiempo, dinero y recursos resueltas?',
  },
  project_understood: {
    title: 'Proyecto entendido',
    question: '¿Entiende el producto, flujos y operativa del proyecto?',
  },
}

const EMPTY: AuditChecklist = {
  db_access: { ok: false, detail: 'Pendiente', source: 'auto' },
  roi_resolved: { ok: false, detail: 'Pendiente', source: 'auto' },
  project_understood: { ok: false, detail: 'Pendiente', source: 'auto' },
}

function looksPending(text: string | null | undefined): boolean {
  if (!text?.trim()) return true
  const t = text.toLowerCase()
  if (t.includes('pendiente entrevista')) return true
  if (t.includes('_pendiente')) return true
  if (t.includes('pendiente: explorar')) return true
  if (t.includes('pendiente calcular')) return true
  // plantilla con puntos suspensivos sin cifras
  const hasNumbers = /\d/.test(t)
  const mostlyTemplate =
    (t.includes('coste_manual_mes = …') || t.includes('coste_manual_mes = ...')) && !hasNumbers
  return mostlyTemplate
}

function sectionBody(knowledge: string, sectionId: string): string {
  const meta = KNOWLEDGE_SECTIONS.find((s) => s.id === sectionId)
  if (!meta) return ''
  return extractKnowledgeSection(knowledge, meta.title) || ''
}

function parseStored(raw: unknown): Partial<AuditChecklist> {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const out: Partial<AuditChecklist> = {}
  for (const id of Object.keys(CHECKLIST_META) as ChecklistItemId[]) {
    const item = o[id]
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    out[id] = {
      ok: it.ok === true,
      detail: typeof it.detail === 'string' ? it.detail : '',
      checked_at: typeof it.checked_at === 'string' ? it.checked_at : undefined,
      source: it.source === 'agent' ? 'agent' : 'auto',
    }
  }
  return out
}

/** Evalúa checklist: respeta marcas del agente; completa el resto con heurística. */
export function evaluateAuditChecklist(input: {
  knowledge: string
  schemaSummary: string
  dbConnected: boolean
  stored?: unknown
}): AuditChecklist {
  const stored = parseStored(input.stored)
  const knowledge = input.knowledge || ''
  const schema = input.schemaSummary || ''

  const datos = sectionBody(knowledge, 'datos')
  const baseline = sectionBody(knowledge, 'baseline_manual')
  const roi = sectionBody(knowledge, 'roi_ahorro')
  const producto = sectionBody(knowledge, 'producto')
  const onboarding = sectionBody(knowledge, 'onboarding_dev')
  const operativa = sectionBody(knowledge, 'operativa')

  // --- DB ---
  let dbAuto: ChecklistItemState
  if (!input.dbConnected) {
    dbAuto = {
      ok: false,
      detail: 'Postgres del cliente no conectado',
      source: 'auto',
    }
  } else if (schema.trim().length < 120 && looksPending(datos)) {
    dbAuto = {
      ok: false,
      detail: 'DB conectada, pero aún no hay mapa de tablas/columnas',
      source: 'auto',
    }
  } else if (schema.trim().length >= 120 || (!looksPending(datos) && datos.length > 200)) {
    dbAuto = {
      ok: true,
      detail: 'Hay resumen de schema / sección de datos documentada',
      source: 'auto',
    }
  } else {
    dbAuto = {
      ok: false,
      detail: 'Falta documentar columnas clave tras explorar la DB',
      source: 'auto',
    }
  }

  // --- ROI ---
  const baselineOk =
    !looksPending(baseline) &&
    baseline.length > 120 &&
    (/\d/.test(baseline) || /hora|persona|fte|€|eur/i.test(baseline))
  const roiOk =
    !looksPending(roi) &&
    roi.length > 80 &&
    (/\d/.test(roi) || /ahorro|roi|payback|coste_buffalo/i.test(roi))

  let roiAuto: ChecklistItemState
  if (baselineOk && roiOk) {
    roiAuto = {
      ok: true,
      detail: 'Baseline (tiempo/dinero/recursos) y comparación ROI documentados',
      source: 'auto',
    }
  } else if (baselineOk && !roiOk) {
    roiAuto = {
      ok: false,
      detail: 'Baseline ok; falta calcular/guardar ROI (sección 12)',
      source: 'auto',
    }
  } else if (!baselineOk && roiOk) {
    roiAuto = {
      ok: false,
      detail: 'Hay ROI parcial; falta completar coste manual (sección 11)',
      source: 'auto',
    }
  } else {
    roiAuto = {
      ok: false,
      detail: 'Pendiente entrevista ROI (tiempo, dinero, personas/recursos)',
      source: 'auto',
    }
  }

  // --- Proyecto ---
  const filledCore =
    knowledge.trim().length >= 900 &&
    producto.length > 80 &&
    !looksPending(producto) &&
    (onboarding.length > 60 || operativa.length > 60 || knowledge.length > 2500)

  let projectAuto: ChecklistItemState
  if (filledCore) {
    projectAuto = {
      ok: true,
      detail: 'Contexto de producto/operativa suficientemente rico',
      source: 'auto',
    }
  } else if (knowledge.trim().length > 200) {
    projectAuto = {
      ok: false,
      detail: 'Hay seed CRM, pero faltan matices de producto/flujos/operativa',
      source: 'auto',
    }
  } else {
    projectAuto = {
      ok: false,
      detail: 'Sin contexto suficiente todavía',
      source: 'auto',
    }
  }

  const merge = (id: ChecklistItemId, auto: ChecklistItemState): ChecklistItemState => {
    const s = stored[id]
    // Si el agente marcó explícitamente, manda (aunque auto diga lo contrario)
    if (s?.source === 'agent') {
      return {
        ok: s.ok,
        detail: s.detail || (s.ok ? 'Validado por el agente' : 'Marcado pendiente por el agente'),
        checked_at: s.checked_at,
        source: 'agent',
      }
    }
    return auto
  }

  return {
    db_access: merge('db_access', dbAuto),
    roi_resolved: merge('roi_resolved', roiAuto),
    project_understood: merge('project_understood', projectAuto),
  }
}

export function mergeChecklistPatch(
  currentStored: unknown,
  patch: Partial<Record<ChecklistItemId, { ok: boolean; detail?: string }>>
): AuditChecklist {
  const base = { ...EMPTY, ...parseStored(currentStored) } as AuditChecklist
  const now = new Date().toISOString()
  for (const id of Object.keys(patch) as ChecklistItemId[]) {
    const p = patch[id]
    if (!p) continue
    base[id] = {
      ok: p.ok === true,
      detail: (p.detail || '').trim() || (p.ok ? 'Validado por el agente' : 'Pendiente'),
      checked_at: now,
      source: 'agent',
    }
  }
  return base
}

export function checklistAllGreen(c: AuditChecklist): boolean {
  return c.db_access.ok && c.roi_resolved.ok && c.project_understood.ok
}
