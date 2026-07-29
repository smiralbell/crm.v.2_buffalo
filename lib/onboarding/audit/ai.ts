import { openRouterChatCompletion, parseJsonFromModelOutput } from '@/lib/openrouter'
import {
  auditAiResponseSchema,
  normalizeAiMode,
  type AuditAIResponse,
} from './schemas'
import { buildGapsSystemPrompt, buildModeSystemPrompt } from './prompts'
import type { AuditStructured, ProjectAudit } from './types'
import { pickNextCatalogQuestion, questionsFor } from './catalog'
import { modeLabel } from './types'

const COVERED_STATUSES = new Set([
  'answered',
  'confirmed',
  'estimated',
  'pending_confirmation',
  'not_applicable',
  'unknown',
  'buffalo_later',
  'skipped',
])

export function isFieldCovered(structured: AuditStructured, fieldKey: string): boolean {
  const f = structured[fieldKey]
  return Boolean(f && COVERED_STATUSES.has(f.status))
}

export function doNotAskAgainKeys(audit: ProjectAudit): string[] {
  const keys = new Set<string>()
  for (const [k, v] of Object.entries(audit.structured || {})) {
    if (COVERED_STATUSES.has(v.status)) keys.add(k)
  }
  for (const q of audit.questions || []) {
    if (['skipped', 'answered', 'not_applicable', 'unknown', 'buffalo_later', 'resolved'].includes(q.status)) {
      keys.add(q.field_key)
    }
  }
  return Array.from(keys)
}

function knownFactsSummary(audit: ProjectAudit): string[] {
  return Object.entries(audit.structured || {})
    .filter(([, v]) => COVERED_STATUSES.has(v.status) && v.value != null && v.value !== '')
    .map(([k, v]) => `${k} = ${Array.isArray(v.value) ? v.value.join(', ') : String(v.value)} (${v.status})`)
    .slice(0, 40)
}

/** Detecta si la pregunta nueva pide un dato ya conocido (p.ej. volumen/leads). */
export function isRedundantQuestion(
  audit: ProjectAudit,
  text: string,
  fieldKey?: string | null
): boolean {
  if (fieldKey && isFieldCovered(audit.structured, fieldKey)) return true

  const t = text.toLowerCase()
  const facts = knownFactsSummary(audit).join(' ').toLowerCase()
  const coveredKeys = doNotAskAgainKeys(audit).join(' ').toLowerCase()

  const volumeAsked = /volumen|leads?\b|tickets?|llamadas|documentos.*mes|mensual/.test(t)
  const volumeKnown =
    /volume\.|volumen|monthly_volume|monthly_leads/.test(coveredKeys) ||
    (/\b\d{2,}\b/.test(facts) && /(lead|volumen|mensual|ticket|llamad)/.test(facts))
  if (volumeAsked && volumeKnown) return true

  const recent = (audit.questions || []).slice(-8)
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[¿?¡!.,;:()]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const nText = norm(text)
  for (const q of recent) {
    if (!['skipped', 'answered', 'pending', 'open', 'unknown', 'buffalo_later'].includes(q.status)) {
      continue
    }
    const nq = norm(q.text)
    if (nq === nText) return true
    const words = new Set(nText.split(' ').filter((w) => w.length > 3))
    const shared = nq.split(' ').filter((w) => words.has(w)).length
    if (words.size >= 4 && shared / words.size >= 0.7) return true
    if (fieldKey && q.field_key === fieldKey && q.status !== 'open') return true
  }

  return false
}

function compactAuditForAi(audit: ProjectAudit) {
  const do_not_ask_again = doNotAskAgainKeys(audit)
  return {
    project_types: audit.project_types,
    active_mode: audit.active_mode,
    known_facts: knownFactsSummary(audit),
    do_not_ask_again,
    structured: Object.fromEntries(
      Object.entries(audit.structured).map(([k, v]) => [
        k,
        { value: v.value, status: v.status, source: v.source, area: v.area },
      ])
    ),
    recent_conversation: audit.conversation.slice(-24).map((t) => ({
      id: t.id,
      role: t.role,
      content: t.content,
      mode: t.mode,
      question_id: t.question_id,
      message_type: t.message_type,
    })),
    open_or_pending_questions: audit.questions
      .filter((q) =>
        ['open', 'pending', 'skipped', 'unknown', 'buffalo_later'].includes(q.status)
      )
      .slice(0, 20)
      .map((q) => ({
        id: q.id,
        text: q.text,
        status: q.status,
        mode: q.mode,
        importance: q.importance,
        field_key: q.field_key,
      })),
    gaps: audit.gaps.filter((g) => g.status === 'open').slice(0, 12),
    progress: audit.progress,
  }
}

/** Evita doble burbuja y preguntas repetidas. */
export function sanitizeAiTurn(
  audit: ProjectAudit,
  ai: AuditAIResponse,
  opts?: { isFirst?: boolean; excludeFieldKeys?: string[] }
): AuditAIResponse {
  let next: AuditAIResponse = { ...ai }

  const hasQuestion = Boolean(next.question?.text)
  const isFirst = Boolean(opts?.isFirst) && (audit.questions || []).length === 0

  if (hasQuestion) {
    if (!isFirst) {
      next = { ...next, assistantMessage: '' }
    } else if (next.assistantMessage && /[¿?]/.test(next.assistantMessage)) {
      next = {
        ...next,
        assistantMessage: next.assistantMessage.replace(/[¿?][\s\S]*$/, '').trim(),
      }
    }
  }

  if (next.question?.text) {
    const fk = next.question.fieldKey
    const excluded = new Set([...(opts?.excludeFieldKeys || []), ...doNotAskAgainKeys(audit)])
    if ((fk && excluded.has(fk)) || isRedundantQuestion(audit, next.question.text, fk)) {
      return catalogFallback(audit, isFirst, Array.from(excluded))
    }
  }

  return next
}

export function validateAuditAiResponse(raw: unknown): {
  ok: true
  data: AuditAIResponse
} | { ok: false; error: string } {
  const parsed = auditAiResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') }
  }
  const data = parsed.data
  if (data.question?.mode) {
    data.question.mode = normalizeAiMode(data.question.mode) || data.question.mode
  }
  return { ok: true, data }
}

async function callAuditAi(
  system: string,
  userPayload: unknown,
  opts?: { temperature?: number }
): Promise<AuditAIResponse> {
  const raw = await openRouterChatCompletion(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: typeof userPayload === 'string' ? userPayload : JSON.stringify(userPayload),
      },
    ],
    { temperature: opts?.temperature ?? 0.25, maxTokens: 2200 }
  )

  let json: unknown
  try {
    json = parseJsonFromModelOutput(raw)
  } catch {
    const repair = await openRouterChatCompletion(
      [
        {
          role: 'system',
          content:
            'Repara la siguiente salida para que sea SOLO JSON válido según AuditAIResponse. Sin markdown.',
        },
        { role: 'user', content: raw },
      ],
      { temperature: 0, maxTokens: 2200 }
    )
    json = parseJsonFromModelOutput(repair)
  }

  let validated = validateAuditAiResponse(json)
  if (!validated.ok) {
    const repair = await openRouterChatCompletion(
      [
        {
          role: 'system',
          content: `${system}\n\nTu salida anterior falló validación: ${validated.error}. Devuelve JSON corregido. assistantMessage vacío si hay question.`,
        },
        { role: 'user', content: JSON.stringify({ previous: json, context: userPayload }) },
      ],
      { temperature: 0, maxTokens: 2200 }
    )
    validated = validateAuditAiResponse(parseJsonFromModelOutput(repair))
    if (!validated.ok) throw new Error(`IA inválida: ${validated.error}`)
  }
  return validated.data
}

export async function generateNextAiTurn(
  audit: ProjectAudit,
  extras?: {
    instruction?: string
    lastAnswer?: string
    isFirst?: boolean
    lastAction?: string
    skippedFieldKey?: string
  }
): Promise<AuditAIResponse> {
  const exclude = [
    ...doNotAskAgainKeys(audit),
    ...(extras?.skippedFieldKey ? [extras.skippedFieldKey] : []),
  ]
  try {
    const raw = await callAuditAi(buildModeSystemPrompt(audit.active_mode), {
      instruction:
        extras?.instruction ||
        'Genera el siguiente turno. assistantMessage="" si hay pregunta. No repitas datos de known_facts ni do_not_ask_again.',
      is_first: Boolean(extras?.isFirst),
      last_answer: extras?.lastAnswer || null,
      last_action: extras?.lastAction || null,
      skipped_field_key: extras?.skippedFieldKey || null,
      audit: compactAuditForAi(audit),
    })
    return sanitizeAiTurn(audit, raw, { isFirst: extras?.isFirst, excludeFieldKeys: exclude })
  } catch {
    return catalogFallback(audit, extras?.isFirst, exclude)
  }
}

export async function analyzeGapsAi(audit: ProjectAudit): Promise<AuditAIResponse> {
  try {
    return await callAuditAi(buildGapsSystemPrompt(), { audit: compactAuditForAi(audit) }, { temperature: 0.15 })
  } catch {
    return catalogFallback(audit, false)
  }
}

export function catalogFallback(
  audit: ProjectAudit,
  isFirst?: boolean,
  excludeFieldKeys: string[] = []
): AuditAIResponse {
  const excluded = new Set([...excludeFieldKeys, ...doNotAskAgainKeys(audit)])
  const tryPick = (area: typeof audit.active_area | null) => {
    const n = pickNextCatalogQuestion(audit.active_mode, audit.project_types, audit.structured, area)
    if (!n || excluded.has(n.field_key)) return null
    return n
  }

  let next = tryPick(audit.active_area) || tryPick(null)

  if (!next) {
    const pool = questionsFor(audit.active_mode, audit.project_types).filter(
      (q) => !excluded.has(q.field_key) && !isFieldCovered(audit.structured, q.field_key)
    )
    const pick = pool[0]
    if (pick) {
      next = {
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
  }

  const intro =
    isFirst && audit.active_mode === 'descubrimiento'
      ? 'Vamos a hacer una auditoría breve para entender el negocio y el proceso actual.'
      : ''

  if (!next) {
    return {
      assistantMessage:
        intro ||
        `En ${modeLabel(audit.active_mode)} no hay más preguntas pendientes. Cambia de modo o pulsa Analizar huecos.`,
      question: null,
      contextUpdates: [],
      detectedGaps: [],
      contradictions: [],
      progressUpdates: [],
    }
  }

  const answerType =
    next.expected_type === 'number'
      ? ('number' as const)
      : next.expected_type === 'boolean'
        ? ('yes_no' as const)
        : next.expected_type === 'list'
          ? ('multi_select' as const)
          : ('textarea' as const)

  return {
    assistantMessage: intro,
    question: {
      id: `cat_${next.field_key}`,
      text: next.question,
      helpText: undefined,
      reason: next.why,
      mode: audit.active_mode,
      category: next.area,
      fieldKey: next.field_key,
      importance: next.importance,
      answerType,
      options:
        answerType === 'yes_no'
          ? [
              { id: 'yes', label: 'Sí', value: 'yes' },
              { id: 'no', label: 'No', value: 'no' },
            ]
          : undefined,
      allowOther: answerType === 'multi_select',
    },
    contextUpdates: [],
    detectedGaps: [],
    contradictions: [],
    progressUpdates: [],
  }
}

export async function generateExampleHelp(
  audit: ProjectAudit,
  questionText: string
): Promise<string> {
  try {
    const raw = await openRouterChatCompletion(
      [
        {
          role: 'system',
          content:
            'Eres el copiloto Buffalo. Explica en 2-4 frases qué tipo de respuesta esperas y da UN ejemplo breve adaptado al contexto. Español. Sin JSON.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            question: questionText,
            mode: audit.active_mode,
            known: Object.fromEntries(
              Object.entries(audit.structured)
                .slice(0, 20)
                .map(([k, v]) => [k, v.value])
            ),
          }),
        },
      ],
      { temperature: 0.3, maxTokens: 400 }
    )
    return String(raw || '').trim().slice(0, 600)
  } catch {
    return 'Ejemplo: “Recibimos unos 80 leads/mes por formulario web y WhatsApp; los revisa comercial en Excel y responde en 24–48h.”'
  }
}
