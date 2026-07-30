import { openRouterChatCompletion, parseJsonFromModelOutput } from '@/lib/openrouter'
import {
  auditAiResponseSchema,
  normalizeAiMode,
  type AuditAIResponse,
} from './schemas'
import { buildExtractSystemPrompt, buildGapsSystemPrompt, buildModeSystemPrompt } from './prompts'
import type { AuditStructured, ProjectAudit } from './types'
import { questionsFor } from './catalog'
import { modeLabel } from './types'
import { planNextQuestion } from './planner'
import { topicFromFieldKey, type AuditTopicId } from './topics'
import { isSolutionFieldKey, readyForStrategies } from './blocks'
import { gateQuestionAgainstPrematureSolution } from './followups'

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

function blockedTopicIds(audit: ProjectAudit, extraFieldKeys: string[] = []): AuditTopicId[] {
  const topics = new Set<AuditTopicId>()
  for (const k of doNotAskAgainKeys(audit)) topics.add(topicFromFieldKey(k))
  for (const k of extraFieldKeys) topics.add(topicFromFieldKey(k))
  return Array.from(topics)
}

/** Detecta si la pregunta nueva pide un dato/tema ya conocido u omitido. */
export function isRedundantQuestion(
  audit: ProjectAudit,
  text: string,
  fieldKey?: string | null
): boolean {
  if (fieldKey && isFieldCovered(audit.structured, fieldKey)) return true

  if (fieldKey) {
    const topic = topicFromFieldKey(fieldKey)
    const blocked = new Set(blockedTopicIds(audit))
    if (blocked.has(topic) && topic !== 'otro') return true
  }

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
    // Mismo tema que una pregunta ya cerrada/omitida
    if (
      fieldKey &&
      topicFromFieldKey(q.field_key) === topicFromFieldKey(fieldKey) &&
      q.status !== 'open' &&
      q.status !== 'pending'
    ) {
      return true
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
  const blocked_topics = blockedTopicIds(audit)
  return {
    project_types: audit.project_types,
    active_mode: audit.active_mode,
    ready_for_strategies: readyForStrategies(audit),
    known_facts: knownFactsSummary(audit),
    do_not_ask_again,
    blocked_topics,
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
    // Solo pendientes reales (no skipped) para no empujar a reabrir omitidas
    open_or_pending_questions: audit.questions
      .filter((q) => ['open', 'pending'].includes(q.status))
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

function questionFromPlan(
  audit: ProjectAudit,
  isFirst: boolean,
  excludeFieldKeys: string[],
  skippedFieldKey?: string | null
): AuditAIResponse {
  const planned = planNextQuestion(audit, {
    excludeFieldKeys,
    skippedFieldKey: skippedFieldKey || null,
  })
  const intro =
    isFirst && audit.active_mode === 'descubrimiento'
      ? 'Vamos a hacer una auditoría breve para entender el negocio y el proceso actual.'
      : ''

  if (!planned.question) {
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

  const next = planned.question
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

/** Evita doble burbuja y preguntas repetidas. */
export function sanitizeAiTurn(
  audit: ProjectAudit,
  ai: AuditAIResponse,
  opts?: { isFirst?: boolean; excludeFieldKeys?: string[]; skippedFieldKey?: string | null }
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
    if (
      (fk && excluded.has(fk)) ||
      isRedundantQuestion(audit, next.question.text, fk) ||
      (fk && isSolutionFieldKey(fk) && !readyForStrategies(audit))
    ) {
      return catalogFallback(audit, isFirst, Array.from(excluded), {
        skippedFieldKey: opts?.skippedFieldKey,
      })
    }
    const gated = gateQuestionAgainstPrematureSolution(audit, {
      id: next.question.id || `tmp_${fk || 'q'}`,
      field_key: fk || '',
      question: next.question.text,
      why: next.question.reason || '',
      area: next.question.category || 'negocio',
      importance: next.question.importance || 'important',
      answer_type: next.question.answerType || 'textarea',
    })
    if (!gated) {
      return catalogFallback(audit, isFirst, Array.from(excluded), {
        skippedFieldKey: opts?.skippedFieldKey,
      })
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
  opts?: { temperature?: number; maxTokens?: number; allowRepair?: boolean }
): Promise<AuditAIResponse> {
  const maxTokens = opts?.maxTokens ?? 900
  const raw = await openRouterChatCompletion(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: typeof userPayload === 'string' ? userPayload : JSON.stringify(userPayload),
      },
    ],
    { temperature: opts?.temperature ?? 0.2, maxTokens }
  )

  let json: unknown
  try {
    json = parseJsonFromModelOutput(raw)
  } catch {
    if (opts?.allowRepair === false) throw new Error('JSON inválido')
    const repair = await openRouterChatCompletion(
      [
        {
          role: 'system',
          content:
            'Repara la siguiente salida para que sea SOLO JSON válido según AuditAIResponse. Sin markdown.',
        },
        { role: 'user', content: raw },
      ],
      { temperature: 0, maxTokens }
    )
    json = parseJsonFromModelOutput(repair)
  }

  let validated = validateAuditAiResponse(json)
  if (!validated.ok) {
    if (opts?.allowRepair === false) throw new Error(`IA inválida: ${validated.error}`)
    // Un solo intento de repair (antes había 2)
    const repair = await openRouterChatCompletion(
      [
        {
          role: 'system',
          content: `${system}\n\nTu salida anterior falló validación: ${validated.error}. Devuelve JSON corregido. assistantMessage vacío si hay question.`,
        },
        { role: 'user', content: JSON.stringify({ previous: json, context: userPayload }) },
      ],
      { temperature: 0, maxTokens }
    )
    validated = validateAuditAiResponse(parseJsonFromModelOutput(repair))
    if (!validated.ok) throw new Error(`IA inválida: ${validated.error}`)
  }
  return validated.data
}

/** Extracción de hechos (sin pregunta). */
export async function extractFactsFromAnswer(
  audit: ProjectAudit,
  lastAnswer: string
): Promise<AuditAIResponse['contextUpdates']> {
  try {
    const raw = await callAuditAi(
      buildExtractSystemPrompt(),
      {
        instruction:
          'Extrae TODOS los hechos útiles de last_answer hacia contextUpdates con paths del catálogo (business.*, problem.*, process.*, volume.*, roi.*, etc.). question:null. assistantMessage:"".',
        last_answer: lastAnswer,
        audit: compactAuditForAi(audit),
      },
      { temperature: 0.1, maxTokens: 700, allowRepair: false }
    )
    return raw.contextUpdates || []
  } catch {
    return []
  }
}

export async function generateNextAiTurn(
  audit: ProjectAudit,
  extras?: {
    instruction?: string
    lastAnswer?: string
    isFirst?: boolean
    lastAction?: string
    skippedFieldKey?: string
    preferCatalog?: boolean
  }
): Promise<AuditAIResponse> {
  const exclude = [
    ...doNotAskAgainKeys(audit),
    ...(extras?.skippedFieldKey ? [extras.skippedFieldKey] : []),
  ]

  // Preferencia: planner + catálogo (rápido). Extracción LLM solo si la respuesta es rica.
  if (extras?.preferCatalog !== false) {
    let contextUpdates: AuditAIResponse['contextUpdates'] = []
    const answer = (extras?.lastAnswer || '').trim()
    if (extras?.lastAction === 'save_continue' && answer.length >= 40) {
      contextUpdates = await extractFactsFromAnswer(audit, answer)
    }
    const planned = questionFromPlan(audit, Boolean(extras?.isFirst), exclude, extras?.skippedFieldKey)
    return {
      ...planned,
      contextUpdates,
    }
  }

  try {
    const planned = planNextQuestion(audit, {
      excludeFieldKeys: exclude,
      skippedFieldKey: extras?.skippedFieldKey || null,
    })
    const raw = await callAuditAi(buildModeSystemPrompt(audit.active_mode), {
      instruction:
        extras?.instruction ||
        'Genera el siguiente turno. assistantMessage="" si hay pregunta. No repitas datos de known_facts ni do_not_ask_again ni blocked_topics.',
      is_first: Boolean(extras?.isFirst),
      last_answer: extras?.lastAnswer || null,
      last_action: extras?.lastAction || null,
      skipped_field_key: extras?.skippedFieldKey || null,
      forced_field_key: planned.question?.field_key || null,
      forced_topic: planned.topic,
      audit: compactAuditForAi(audit),
    }, { maxTokens: 900 })
    // Si la IA inventa otro fieldKey, forzamos el del planner
    if (planned.question && raw.question) {
      raw.question.fieldKey = planned.question.field_key
      if (isRedundantQuestion(audit, raw.question.text, planned.question.field_key)) {
        return questionFromPlan(audit, Boolean(extras?.isFirst), exclude, extras?.skippedFieldKey)
      }
    }
    return sanitizeAiTurn(audit, raw, {
      isFirst: extras?.isFirst,
      excludeFieldKeys: exclude,
      skippedFieldKey: extras?.skippedFieldKey,
    })
  } catch {
    return catalogFallback(audit, extras?.isFirst, exclude, {
      skippedFieldKey: extras?.skippedFieldKey,
    })
  }
}

export async function analyzeGapsAi(audit: ProjectAudit): Promise<AuditAIResponse> {
  try {
    return await callAuditAi(buildGapsSystemPrompt(), { audit: compactAuditForAi(audit) }, { temperature: 0.15, maxTokens: 1200 })
  } catch {
    return catalogFallback(audit, false)
  }
}

export function catalogFallback(
  audit: ProjectAudit,
  isFirst?: boolean,
  excludeFieldKeys: string[] = [],
  opts?: { skippedFieldKey?: string | null }
): AuditAIResponse {
  return questionFromPlan(audit, Boolean(isFirst), excludeFieldKeys, opts?.skippedFieldKey)
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

// re-export for tests that imported questionsFor usage indirectly
export { questionsFor }
