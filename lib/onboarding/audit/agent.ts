import type {
  AuditAnswer,
  AuditAnswerAction,
  AuditAreaId,
  AuditConversationTurn,
  AuditFieldSource,
  AuditFieldStatus,
  AuditGap,
  AuditMode,
  AuditQuestion,
  AuditQuestionStatus,
  CurrentQuestion,
  ProjectAudit,
} from './types'
import { emptyContext, modeLabel } from './types'
import type { AuditAIResponse } from './schemas'
import { catalogFallback, generateExampleHelp, generateNextAiTurn, analyzeGapsAi } from './ai'
import { computeAreaProgress, computeProgressFromStructured, mergeProgress } from './progress'
import { pickNextCatalogQuestion } from './catalog'

export { computeAreaProgress }

function nowIso() {
  return new Date().toISOString()
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function ensureCollections(audit: ProjectAudit): ProjectAudit {
  return {
    ...audit,
    questions: audit.questions || [],
    answers: audit.answers || [],
    gaps: audit.gaps || [],
    progress: audit.progress || {},
    active_question_id: audit.active_question_id ?? null,
    started_at: audit.started_at ?? null,
    completed_at: audit.completed_at ?? null,
    context: audit.context?.sections ? audit.context : { ...emptyContext(), ...audit.context, sections: audit.context?.sections || {} },
  }
}

/** Colapsa asistentes consecutivos (legacy). Conserva separadores system. */
export function normalizeConversation(turns: AuditConversationTurn[]): AuditConversationTurn[] {
  const out: AuditConversationTurn[] = []
  for (const t of turns) {
    if (
      t.role === 'assistant' &&
      t.message_type !== 'mode_separator' &&
      out.length > 0 &&
      out[out.length - 1].role === 'assistant' &&
      out[out.length - 1].message_type !== 'mode_separator' &&
      out[out.length - 1].message_type !== 'example'
    ) {
      out[out.length - 1] = t
      continue
    }
    out.push(t)
  }
  return out
}

export function peekNextQuestion(audit: ProjectAudit): CurrentQuestion | null {
  const open = (audit.questions || []).find(
    (q) => q.id === audit.active_question_id && (q.status === 'open' || q.status === 'pending')
  )
  if (open) return questionToCurrent(open)
  const lastOpen = [...(audit.questions || [])]
    .reverse()
    .find((q) => q.status === 'open')
  if (lastOpen) return questionToCurrent(lastOpen)
  return null
}

function questionToCurrent(q: AuditQuestion): CurrentQuestion {
  return {
    id: q.id,
    field_key: q.field_key,
    question: q.text,
    help_text: q.help_text,
    why: q.reason || '',
    area: q.category,
    importance: q.importance,
    answer_type: q.answer_type,
    options: q.options,
    allow_other: q.allow_other,
    unit: q.unit,
  }
}

function mapStatusFromAi(
  status: string
): AuditFieldStatus {
  if (status === 'confirmed') return 'confirmed'
  if (status === 'estimated') return 'estimated'
  if (status === 'pending_confirmation') return 'pending_confirmation'
  if (status === 'unknown') return 'unknown'
  if (status === 'not_applicable') return 'not_applicable'
  if (status === 'answered') return 'answered'
  return 'partial'
}

function mapSourceFromAi(source: string): AuditFieldSource {
  if (source === 'client') return 'client'
  if (source === 'buffalo') return 'buffalo'
  if (source === 'ai_inference' || source === 'ai_assumption') return 'ai_inference'
  if (source === 'client_estimate') return 'client_estimate'
  return 'unknown'
}

function pathToArea(path: string): AuditAreaId {
  const p = path.toLowerCase()
  if (p.includes('roi') || p.includes('cost') || p.includes('hour')) return 'roi'
  if (p.includes('integrat') || p.includes('system')) return 'integraciones'
  if (p.includes('security') || p.includes('rgpd') || p.includes('gdpr')) return 'seguridad'
  if (p.includes('tech') || p.includes('api') || p.includes('infra')) return 'tecnico'
  if (p.includes('volume') || p.includes('volumen') || p.includes('monthly')) return 'volumen'
  if (p.includes('process') || p.includes('proceso')) return 'proceso'
  if (p.includes('problem') || p.includes('problema')) return 'problema'
  if (p.includes('user') || p.includes('role')) return 'usuarios'
  if (p.includes('budget') || p.includes('presupuesto')) return 'presupuesto'
  if (p.includes('goal') || p.includes('objetivo')) return 'negocio'
  return 'negocio'
}

function sectionForPath(path: string): keyof NonNullable<ProjectAudit['context']['sections']> {
  const area = pathToArea(path)
  const map: Record<string, keyof NonNullable<ProjectAudit['context']['sections']>> = {
    negocio: 'empresa',
    problema: 'problema',
    proceso: 'proceso',
    volumen: 'volumen',
    roi: 'roi',
    usuarios: 'usuarios',
    integraciones: 'integraciones',
    datos: 'datos',
    tecnico: 'tecnico',
    seguridad: 'seguridad',
    presupuesto: 'presupuesto',
    funcionalidades: 'funcionalidades',
    solucion: 'solucion',
  }
  return map[area] || 'empresa'
}

export function applyContextUpdates(
  audit: ProjectAudit,
  updates: AuditAIResponse['contextUpdates'],
  messageId?: string | null
): ProjectAudit {
  const structured = { ...audit.structured }
  const sections = { ...(audit.context.sections || {}) }

  for (const u of updates) {
    const area = pathToArea(u.path)
    const status = mapStatusFromAi(u.status)
    const source = mapSourceFromAi(u.source)
    const value =
      typeof u.value === 'string' ||
      typeof u.value === 'number' ||
      typeof u.value === 'boolean' ||
      Array.isArray(u.value)
        ? (u.value as string | number | boolean | string[])
        : u.value == null
          ? null
          : JSON.stringify(u.value)

    structured[u.path] = {
      value,
      raw_answer: typeof u.value === 'string' ? u.value : structured[u.path]?.raw_answer,
      status,
      source,
      confidence: u.confidence ?? 0.7,
      importance: structured[u.path]?.importance || 'important',
      area,
      updated_at: nowIso(),
      message_id: messageId || null,
    }

    const sectionKey = sectionForPath(u.path)
    const list = [...(sections[sectionKey] || [])]
    const label = u.path.split('.').pop() || u.path
    const display =
      value == null ? '—' : Array.isArray(value) ? value.join(', ') : String(value)
    const idx = list.findIndex((x) => x.path === u.path)
    const item = {
      path: u.path,
      label,
      value: display,
      status,
      source,
      confidence: u.confidence ?? 0.7,
      updated_at: nowIso(),
      message_id: messageId || null,
    }
    if (idx >= 0) list[idx] = item
    else list.push(item)
    sections[sectionKey] = list
  }

  const key_facts = Object.values(sections)
    .flat()
    .filter((i) => ['confirmed', 'answered', 'estimated', 'pending_confirmation'].includes(i.status))
    .slice(0, 12)
    .map((i) => `${i.label}: ${i.value}`)

  const assumptions = Object.values(sections)
    .flat()
    .filter((i) => i.source === 'ai_inference' || i.source === 'ai_assumption')
    .map((i) => `${i.label}: ${i.value}`)

  return {
    ...audit,
    structured,
    context: {
      ...audit.context,
      sections,
      key_facts,
      assumptions,
      pending_client: audit.context.pending_client,
      risks: audit.context.risks,
      integrations: sections.integraciones?.map((i) => `${i.label}: ${i.value}`) || audit.context.integrations,
      decisions: audit.context.decisions,
      contradictions: audit.context.contradictions,
      next_hint: audit.context.next_hint,
    },
  }
}

function applyGapsAndProgress(
  audit: ProjectAudit,
  ai: AuditAIResponse
): ProjectAudit {
  let gaps = [...(audit.gaps || [])]
  for (const g of ai.detectedGaps || []) {
    gaps.push({
      id: uid('gap'),
      title: g.title,
      description: g.description,
      category: g.category || 'general',
      importance: g.importance,
      owner: g.owner,
      status: 'open',
      created_at: nowIso(),
    })
  }
  // de-dupe by title
  const seen = new Set<string>()
  gaps = gaps.filter((g) => {
    const k = g.title.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(-40)

  const contradictions = [
    ...(audit.context.contradictions || []),
    ...(ai.contradictions || []).map((c) => c.description),
  ].slice(0, 12)

  let progress = computeProgressFromStructured(audit.structured)
  progress = mergeProgress(progress, ai.progressUpdates || [])

  return {
    ...audit,
    gaps,
    progress,
    context: {
      ...audit.context,
      contradictions,
      risks: Array.from(
        new Set([
          ...(audit.context.risks || []),
          ...gaps.filter((g) => g.importance === 'critical').map((g) => g.title),
        ])
      ).slice(0, 12),
      pending_client: Array.from(
        new Set([
          ...(audit.context.pending_client || []),
          ...gaps.filter((g) => g.owner === 'client' && g.status === 'open').map((g) => g.title),
        ])
      ).slice(0, 12),
    },
  }
}

function appendQuestionFromAi(
  audit: ProjectAudit,
  ai: AuditAIResponse,
  mode: AuditMode,
  opts?: { allowIntro?: boolean }
): { audit: ProjectAudit; current: CurrentQuestion | null } {
  if (!ai.question?.text) {
    return {
      audit: {
        ...audit,
        active_question_id: null,
        context: {
          ...audit.context,
          next_hint: ai.assistantMessage || audit.context.next_hint,
        },
      },
      current: null,
    }
  }

  const qid = ai.question.id && !String(ai.question.id).startsWith('cat_') ? ai.question.id : uid('q')
  const fieldKey =
    ai.question.fieldKey ||
    `auto.${(ai.question.category || 'general').replace(/\s+/g, '_')}.${qid.slice(-6)}`

  const mid = uid('m')
  const turns: AuditConversationTurn[] = [...audit.conversation]

  // Solo intro al empezar (1 frase). Nunca una segunda pregunta en assistantMessage.
  const allowIntro = Boolean(opts?.allowIntro) && turns.filter((t) => t.message_type === 'question').length === 0
  const intro = allowIntro ? (ai.assistantMessage || '').trim() : ''
  if (intro && !/[¿?]/.test(intro)) {
    turns.push({
      id: uid('m'),
      role: 'assistant',
      content: intro,
      mode,
      area: (ai.question.category as AuditAreaId) || audit.active_area,
      message_type: 'text',
      created_at: nowIso(),
    })
  }

  turns.push({
    id: mid,
    role: 'assistant',
    content: ai.question.text,
    mode,
    area: (ai.question.category as AuditAreaId) || audit.active_area,
    field_key: fieldKey,
    question_id: qid,
    message_type: 'question',
    created_at: nowIso(),
    meta: {
      answer_type: ai.question.answerType,
      options: ai.question.options,
      allow_other: ai.question.allowOther,
      help_text: ai.question.helpText,
      reason: ai.question.reason,
      importance: ai.question.importance,
      unit: ai.question.unit,
    },
  })

  const question: AuditQuestion = {
    id: qid,
    message_id: mid,
    mode,
    category: ai.question.category || 'negocio',
    field_key: fieldKey,
    text: ai.question.text,
    help_text: ai.question.helpText || null,
    reason: ai.question.reason || null,
    importance: ai.question.importance || 'important',
    answer_type: ai.question.answerType || 'textarea',
    options: ai.question.options,
    allow_other: ai.question.allowOther,
    unit: ai.question.unit || null,
    status: 'open',
    order: (audit.questions?.length || 0) + 1,
    created_at: nowIso(),
  }

  const nextAudit: ProjectAudit = {
    ...audit,
    conversation: turns,
    questions: [...(audit.questions || []), question],
    active_question_id: qid,
    active_area: (ai.question.category as AuditAreaId) || audit.active_area,
    active_mode: mode,
    context: {
      ...audit.context,
      next_hint: ai.question.helpText || `Siguiente: ${ai.question.text}`,
    },
    updated_at: nowIso(),
  }

  return { audit: nextAudit, current: questionToCurrent(question) }
}

function statusFromAction(action: AuditAnswerAction): AuditQuestionStatus {
  switch (action) {
    case 'skip':
      return 'skipped'
    case 'not_applicable':
      return 'not_applicable'
    case 'unknown':
      return 'unknown'
    case 'buffalo_later':
      return 'buffalo_later'
    case 'resolve':
      return 'resolved'
    default:
      return 'answered'
  }
}

function fieldStatusFromAction(action: AuditAnswerAction, answer: string): {
  status: AuditFieldStatus
  source: AuditFieldSource
} {
  switch (action) {
    case 'skip':
      return { status: 'skipped', source: 'unknown' }
    case 'not_applicable':
      return { status: 'not_applicable', source: 'client' }
    case 'unknown':
      return { status: 'unknown', source: 'client' }
    case 'buffalo_later':
      return { status: 'buffalo_later', source: 'buffalo' }
    default: {
      const provisional = /creo|aprox|aproximadamente|unos|alrededor|pendiente/i.test(answer)
      return {
        status: provisional ? 'pending_confirmation' : 'answered',
        source: provisional ? 'client_estimate' : 'client',
      }
    }
  }
}

/** Guarda respuesta del usuario SIN generar aún la siguiente pregunta IA. */
export function applyUserAnswerLocal(
  auditIn: ProjectAudit,
  input: {
    question_id: string
    answer: string
    action: AuditAnswerAction
    value?: string | number | boolean | string[] | null
    late?: boolean
  }
): { audit: ProjectAudit; question: AuditQuestion | null } {
  const audit = ensureCollections(auditIn)
  const q = audit.questions.find((x) => x.id === input.question_id)
  if (!q) return { audit, question: null }

  const answerId = uid('a')
  const msgId = uid('m')
  const qStatus = statusFromAction(input.action)
  const fieldMeta = fieldStatusFromAction(input.action, input.answer)
  const display =
    input.action === 'save_continue'
      ? input.answer.trim() ||
        (Array.isArray(input.value) ? input.value.join(', ') : input.value != null ? String(input.value) : '')
      : `[${input.action}] ${input.answer.trim()}`.trim()

  const answerRow: AuditAnswer = {
    id: answerId,
    question_id: q.id,
    message_id: msgId,
    value: input.value ?? input.answer.trim() ?? null,
    raw_text: input.answer.trim(),
    answered_by: input.action === 'buffalo_later' ? 'buffalo' : 'client',
    status: qStatus,
    created_at: nowIso(),
    updated_at: nowIso(),
    late: Boolean(input.late),
  }

  const questions: AuditQuestion[] = audit.questions.map((x) =>
    x.id === q.id
      ? {
          ...x,
          status: (qStatus === 'answered' ? 'answered' : qStatus) as AuditQuestionStatus,
          answered_at: ['answered', 'not_applicable', 'resolved'].includes(qStatus)
            ? nowIso()
            : x.answered_at,
          skipped_at: qStatus === 'skipped' ? nowIso() : x.skipped_at,
        }
      : x
  )

  const turns = [...audit.conversation]
  if (!input.late) {
    turns.push({
      id: msgId,
      role: 'user',
      content: display || qStatus,
      mode: audit.active_mode,
      area: (q.category as AuditAreaId) || audit.active_area,
      field_key: q.field_key,
      question_id: q.id,
      answer_id: answerId,
      message_type: 'answer',
      created_at: nowIso(),
      meta: { action: input.action, late: false },
    })
  } else {
    turns.push({
      id: msgId,
      role: 'user',
      content: `Respondida posteriormente: ${display || qStatus}`,
      mode: q.mode,
      area: (q.category as AuditAreaId) || audit.active_area,
      field_key: q.field_key,
      question_id: q.id,
      answer_id: answerId,
      message_type: 'answer',
      created_at: nowIso(),
      meta: { action: input.action, late: true, original_message_id: q.message_id },
    })
  }

  let structured = { ...audit.structured }
  if (input.action !== 'ask_example') {
    structured[q.field_key] = {
      value: answerRow.value,
      raw_answer: answerRow.raw_text,
      status: fieldMeta.status,
      source: fieldMeta.source,
      confidence: fieldMeta.status === 'answered' ? 0.9 : 0.5,
      importance: q.importance,
      area: (q.category as AuditAreaId) || 'negocio',
      updated_at: nowIso(),
      question_id: q.id,
      message_id: msgId,
      note:
        input.action === 'unknown'
          ? 'El cliente no lo sabe'
          : input.action === 'buffalo_later'
            ? 'Pendiente interno Buffalo'
            : null,
      follow_up_owner:
        input.action === 'unknown' || input.action === 'skip'
          ? 'client'
          : input.action === 'buffalo_later'
            ? 'buffalo'
            : null,
    }
  }

  let next: ProjectAudit = {
    ...audit,
    questions,
    answers: [...audit.answers, answerRow],
    conversation: turns,
    structured,
    active_question_id:
      audit.active_question_id === q.id && input.action !== 'ask_example'
        ? null
        : audit.active_question_id,
    progress: computeProgressFromStructured(structured),
    updated_at: nowIso(),
  }

  next = applyContextUpdates(
    next,
    [
      {
        path: q.field_key,
        value: answerRow.value,
        status:
          fieldMeta.status === 'answered'
            ? 'confirmed'
            : fieldMeta.status === 'pending_confirmation'
              ? 'pending_confirmation'
              : fieldMeta.status === 'unknown'
                ? 'unknown'
                : fieldMeta.status === 'not_applicable'
                  ? 'not_applicable'
                  : 'estimated',
        source:
          fieldMeta.source === 'client_estimate'
            ? 'client_estimate'
            : fieldMeta.source === 'buffalo'
              ? 'buffalo'
              : 'client',
        confidence: fieldMeta.status === 'answered' ? 0.9 : 0.55,
      },
    ],
    msgId
  )

  return { audit: next, question: questions.find((x) => x.id === q.id) || null }
}

export async function continueAfterAnswer(
  auditIn: ProjectAudit,
  lastAnswer: string,
  opts?: { action?: AuditAnswerAction; skippedFieldKey?: string }
): Promise<{ audit: ProjectAudit; current: CurrentQuestion | null; aiError?: string }> {
  const audit = ensureCollections(auditIn)
  const skipped = opts?.action === 'skip' || Boolean(opts?.skippedFieldKey)
  try {
    const ai = await generateNextAiTurn(audit, {
      instruction: skipped
        ? `El usuario OMITIÓ la pregunta (fieldKey=${opts?.skippedFieldKey || 'desconocido'}). NO la repitas ni la reformules. Pasa a OTRA pregunta distinta del modo ${audit.active_mode}. assistantMessage="" .`
        : `El cliente acaba de responder (${opts?.action || 'save_continue'}). Extrae contexto y formula UNA siguiente pregunta del modo activo. assistantMessage="". No repitas known_facts ni do_not_ask_again.`,
      lastAnswer,
      lastAction: opts?.action,
      skippedFieldKey: opts?.skippedFieldKey,
    })
    let next = applyContextUpdates(audit, ai.contextUpdates || [])
    next = applyGapsAndProgress(next, ai)
    return appendQuestionFromAi(next, ai, audit.active_mode)
  } catch (e) {
    const ai = catalogFallback(audit, false, opts?.skippedFieldKey ? [opts.skippedFieldKey] : [])
    let next = applyGapsAndProgress(audit, ai)
    const result = appendQuestionFromAi(next, ai, audit.active_mode)
    return {
      ...result,
      aiError: e instanceof Error ? e.message : 'Error IA',
    }
  }
}

export async function startMeetingTurn(
  auditIn: ProjectAudit
): Promise<{ audit: ProjectAudit; current: CurrentQuestion | null }> {
  let audit = ensureCollections(auditIn)
  audit = {
    ...audit,
    active_mode: 'descubrimiento',
    started_at: audit.started_at || nowIso(),
    status: 'in_progress',
  }
  const ai = await generateNextAiTurn(audit, {
    isFirst: true,
    instruction:
      'Empieza la reunión en Descubrimiento. assistantMessage = 1 frase corta SIN pregunta. question = primera pregunta de negocio.',
  })
  let next = applyContextUpdates(audit, ai.contextUpdates || [])
  next = applyGapsAndProgress(next, ai)
  return appendQuestionFromAi(next, ai, 'descubrimiento', { allowIntro: true })
}

export async function changeModeTurn(
  auditIn: ProjectAudit,
  mode: AuditMode
): Promise<{ audit: ProjectAudit; current: CurrentQuestion | null }> {
  let audit = ensureCollections(auditIn)

  // Pregunta abierta actual → pendiente (no desaparece)
  if (audit.active_question_id) {
    audit = {
      ...audit,
      questions: audit.questions.map((q) =>
        q.id === audit.active_question_id && q.status === 'open'
          ? { ...q, status: 'pending' as const }
          : q
      ),
    }
  }

  const sep: AuditConversationTurn = {
    id: uid('m'),
    role: 'system',
    content: `Enfoque cambiado a ${modeLabel(mode)}`,
    mode,
    area: audit.active_area,
    message_type: 'mode_separator',
    created_at: nowIso(),
  }

  audit = {
    ...audit,
    active_mode: mode,
    conversation: [...audit.conversation, sep],
    active_question_id: null,
    updated_at: nowIso(),
  }

  const ai = await generateNextAiTurn(audit, {
    instruction: `Modo cambiado a ${mode}. Genera la siguiente pregunta con ese enfoque. assistantMessage="". Usa known_facts: NO repitas datos ya conocidos (volumen, empresa, problema, etc.). No hagas intro larga.`,
  })
  let next = applyContextUpdates(audit, ai.contextUpdates || [])
  next = applyGapsAndProgress(next, ai)
  return appendQuestionFromAi(next, ai, mode)
}

export async function askExampleTurn(
  auditIn: ProjectAudit,
  questionId: string
): Promise<ProjectAudit> {
  const audit = ensureCollections(auditIn)
  const q = audit.questions.find((x) => x.id === questionId)
  if (!q) return audit
  const help = await generateExampleHelp(audit, q.text)
  return {
    ...audit,
    conversation: [
      ...audit.conversation,
      {
        id: uid('m'),
        role: 'assistant',
        content: help,
        mode: audit.active_mode,
        area: (q.category as AuditAreaId) || audit.active_area,
        question_id: q.id,
        message_type: 'example',
        created_at: nowIso(),
      },
    ],
    updated_at: nowIso(),
  }
}

export async function runAnalyzeGaps(
  auditIn: ProjectAudit
): Promise<{ audit: ProjectAudit; analysis: { message: string; enough_for_proposal: boolean; gaps: AuditGap[] } }> {
  const audit = ensureCollections(auditIn)
  const ai = await analyzeGapsAi(audit)
  let next = applyContextUpdates(audit, ai.contextUpdates || [])
  next = applyGapsAndProgress(next, ai)
  next = {
    ...next,
    context: {
      ...next.context,
      next_hint: ai.assistantMessage || next.context.next_hint,
    },
    status: next.gaps.some((g) => g.importance === 'critical' && g.status === 'open')
      ? next.status
      : 'ready_for_proposal',
    updated_at: nowIso(),
  }
  const openGaps = next.gaps.filter((g) => g.status === 'open')
  return {
    audit: next,
    analysis: {
      message: ai.assistantMessage || 'Análisis listo.',
      enough_for_proposal: !openGaps.some((g) => g.importance === 'critical'),
      gaps: openGaps,
    },
  }
}

export async function convertGapToQuestion(
  auditIn: ProjectAudit,
  gapId: string
): Promise<{ audit: ProjectAudit; current: CurrentQuestion | null }> {
  const audit = ensureCollections(auditIn)
  const gap = audit.gaps.find((g) => g.id === gapId)
  if (!gap) return { audit, current: peekNextQuestion(audit) }

  const gaps = audit.gaps.map((g) => (g.id === gapId ? { ...g, status: 'converted' as const } : g))
  const withGaps = { ...audit, gaps }
  const ai = await generateNextAiTurn(withGaps, {
    instruction: `Convierte este hueco en la siguiente pregunta: ${gap.title}. ${gap.description}`,
  })
  let next = applyGapsAndProgress(withGaps, ai)
  return appendQuestionFromAi(next, ai, audit.active_mode)
}

/** Compat: resume sin IA (peek). */
export function startOrResumeQuestion(audit: ProjectAudit): {
  audit: ProjectAudit
  next: CurrentQuestion | null
} {
  const cleaned = ensureCollections({
    ...audit,
    conversation: normalizeConversation(audit.conversation || []),
  })
  const current = peekNextQuestion(cleaned)
  if (current) return { audit: cleaned, next: current }

  // Sin pregunta activa: no inventar en GET; el cliente debe pedir generate
  return { audit: cleaned, next: null }
}

export function buildAuditSnapshot(audit: ProjectAudit) {
  const a = ensureCollections(audit)
  return {
    areas: computeAreaProgress(a.structured),
    progress: a.progress,
    pending_questions: a.questions.filter((q) =>
      ['pending', 'skipped', 'unknown', 'buffalo_later', 'open'].includes(q.status)
    ).length,
    gaps_open: a.gaps.filter((g) => g.status === 'open').length,
  }
}

/** Legacy export used by old paths — maps to catalog peek */
export function getCatalogNext(audit: ProjectAudit): CurrentQuestion | null {
  const n =
    pickNextCatalogQuestion(audit.active_mode, audit.project_types, audit.structured, audit.active_area) ||
    pickNextCatalogQuestion(audit.active_mode, audit.project_types, audit.structured, null)
  if (!n) return null
  return {
    id: `cat_${n.field_key}`,
    field_key: n.field_key,
    question: n.question,
    why: n.why,
    area: n.area,
    importance: n.importance,
    answer_type: 'textarea',
  }
}
