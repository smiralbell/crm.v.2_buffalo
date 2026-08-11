/**
 * Agente de edición de propuestas: tools → observar → verificar → reintentar.
 */

import {
  openRouterToolTurn,
  resolveModel,
  type ORMessage,
} from '@/lib/openrouter'
import { buildProposalContextPack } from '@/lib/onboarding/proposal-context-pack'
import {
  applyProposalPatches,
  instructionNeedsAgent,
  tryLocalPatches,
  type ProposalTheme,
} from '@/lib/onboarding/proposal-patches'
import {
  classifyProposalSkills,
  formatSkillsForPrompt,
  proposalSkillsModelTier,
  type ProposalSkillId,
} from '@/lib/onboarding/proposal-skills'
import { buildProposalEditSystem } from '@/lib/onboarding/proposal-prompt'
import { formatSectionMapForEditor } from '@/lib/onboarding/proposal-brm'
import {
  diffProposalStats,
  resolveEditorNote,
  verifyIntent,
  type ProposalDiffStats,
} from '@/lib/onboarding/proposal-verify'
import {
  buildFeedbackRelaunch,
  isFeedbackOnly,
  type ProposalTurnMemory,
} from '@/lib/onboarding/proposal-memory'
import {
  getProposalToolSpecs,
  runProposalTool,
  type ProposalToolState,
} from '@/lib/onboarding/proposal-tools'
import {
  throwIfAborted,
  toolCallTarget,
  type ProposalAgentEvent,
} from '@/lib/onboarding/proposal-agent-events'

const AGENT_RULES = `════════════════════════
MODO AGENTE (herramientas)
════════════════════════
Eres el editor de propuestas de Buffalo. Tienes herramientas.
- Antes de reescribir una sección, LÉELA con read_section.
- Antes de afirmar un dato del cliente, búscalo con get_client_context.
- Después de editar, mira el resultado (wordsDelta). Si es pequeño y pedían ampliar, reintenta más agresivo (rewrite_section_freeform).
- Si una herramienta falla, no te rindas ni se lo cuentes al usuario: prueba otra vía.
- Orden de escape: (1) herramienta específica → (2) read_section + replace_section → (3) rewrite_section_freeform.
- No anuncies lo que vas a hacer: hazlo. El usuario solo verá el resultado final.
- Nunca digas que has ampliado algo si el wordsDelta que te devolvió la herramienta es pequeño.
- Lo que SÍ controlas: contenido BRM, bloques ::: , saltos, tema, títulos.
- Lo que NO controlas (plantilla visual): tipografías, logo, márgenes, colores exactos — dilo y ofrece la alternativa BRM más cercana.
- Traducir / regenerar TODO → replace_document (una sola llamada con el BRM completo).
- Cuando termines, responde con un breve texto sin más tool calls.`

export type ProposalAgentResult = {
  content: string
  note: string
  theme?: ProposalTheme
  stats?: ProposalDiffStats
  intentSatisfied?: boolean
  turnMemory: ProposalTurnMemory
  toolsUsed: string[]
  cancelled?: boolean
}

export type ProposalAgentEmit = (event: ProposalAgentEvent) => void

function emptyStats(draft: string): ProposalDiffStats {
  return diffProposalStats(draft, draft)
}

function emitSafe(emit: ProposalAgentEmit | undefined, event: ProposalAgentEvent): void {
  try {
    emit?.(event)
  } catch {
    // el stream no debe tumbar el agente
  }
}

export async function runProposalAgent(input: {
  draft: string
  instruction: string
  context?: string | null
  definition?: string | null
  projectName?: string | null
  clientName?: string | null
  clientCompany?: string | null
  setupFee?: number | null
  monthlyFee?: number | null
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  lastTurn?: ProposalTurnMemory | null
  onEvent?: ProposalAgentEmit
  signal?: AbortSignal
}): Promise<ProposalAgentResult> {
  const started = Date.now()
  const before = (input.draft || '').replace(/\r\n/g, '\n').trim()
  const polishOpts = {
    clientName: input.clientName,
    clientCompany: input.clientCompany,
  }
  const emit = input.onEvent
  const signal = input.signal

  let instruction = input.instruction.trim()
  if (!instruction) throw new Error('Instrucción vacía')

  throwIfAborted(signal)

  if (isFeedbackOnly(instruction)) {
    if (input.lastTurn) {
      instruction = buildFeedbackRelaunch(input.lastTurn, instruction)
    } else {
      const stats = emptyStats(before)
      const note =
        'Dime qué cambio concreto quieres (punto, sección o pega el fragmento). No tengo el turno anterior anclado.'
      emitSafe(emit, {
        type: 'start',
        skills: ['general'],
        model: 'fast',
      })
      emitSafe(emit, {
        type: 'done',
        content: before,
        note,
        theme: null,
        stats,
        intentSatisfied: false,
      })
      return {
        content: before,
        note,
        stats,
        intentSatisfied: false,
        toolsUsed: [],
        turnMemory: {
          instruction: input.instruction,
          tools: [],
          sections: [],
          stats,
          satisfied: false,
        },
      }
    }
  }

  const contextPack = buildProposalContextPack({
    definition: input.definition,
    context: input.context,
    projectName: input.projectName,
    clientName: input.clientName,
    clientCompany: input.clientCompany,
    setupFee: input.setupFee,
    monthlyFee: input.monthlyFee,
  })

  const toolsUsed: string[] = []
  let draft = before
  let theme: ProposalTheme | undefined

  // 1) Atajos locales (pueden ser varios)
  const local = tryLocalPatches(instruction, polishOpts)
  if (local?.length) {
    const applied = applyProposalPatches(draft, local, polishOpts)
    if (applied.applied > 0) {
      draft = applied.draft
      if (applied.theme) theme = applied.theme
      for (const p of local) {
        toolsUsed.push(`local:${p.op}`)
        emitSafe(emit, { type: 'tool', name: `local:${p.op}`, target: p.op })
      }
    }
  }

  throwIfAborted(signal)

  // Solo atajos locales si cubren al 100% (sin redacción / diseño / contenido)
  const localOnly = Boolean(local?.length) && !instructionNeedsAgent(instruction)
  if (localOnly) {
    const skills: ProposalSkillId[] = classifyProposalSkills(instruction)
    emitSafe(emit, {
      type: 'start',
      skills,
      model: proposalSkillsModelTier(skills),
    })
    const stats = diffProposalStats(before, draft)
    const ops = new Set(local!.map((p) => p.op))
    let modelNote = 'Cambio estructural aplicado.'
    if (ops.has('ensure_section_pagebreaks')) {
      modelNote = 'He puesto un salto de página entre cada punto (cada uno en su hoja).'
    } else if (ops.has('remove_pagebreaks') || ops.has('set_page_mode')) {
      const mode = local!.find((p) => p.op === 'set_page_mode') as
        | { op: 'set_page_mode'; mode: 'flow' | 'sections' }
        | undefined
      modelNote =
        mode?.mode === 'sections'
          ? 'Cada punto vuelve a ir en su propia hoja.'
          : 'He quitado los saltos entre puntos: van seguidos en la misma hoja.'
    } else if (ops.has('shorten_cover')) {
      modelNote = 'He acortado la descripción de la portada.'
    } else if (ops.has('ensure_signatures')) {
      modelNote = 'He reestructurado la sección de aceptación y firmas.'
    } else if (ops.has('set_theme') && theme) {
      modelNote = `Tema cambiado a ${theme}.`
    } else if (ops.has('compact_blank_lines')) {
      modelNote = 'He compactado las líneas en blanco.'
    }

    const resolved = resolveEditorNote({
      instruction: input.instruction,
      modelNote,
      stats,
    })
    const satisfied = resolved.satisfied || draft !== before || Boolean(theme)
    const turnMemory: ProposalTurnMemory = {
      instruction: input.instruction,
      tools: toolsUsed,
      sections: stats.sectionsTouched,
      stats,
      satisfied,
    }
    console.info('[proposal-agent]', {
      instruction: input.instruction.slice(0, 80),
      tools: toolsUsed,
      wordsDelta: stats.wordsDelta,
      satisfied,
      mode: 'local-only',
    })
    emitSafe(emit, {
      type: 'done',
      content: draft,
      note: resolved.note,
      theme: theme || null,
      stats,
      intentSatisfied: satisfied,
    })
    return {
      content: draft,
      note: resolved.note,
      theme,
      stats,
      intentSatisfied: satisfied,
      turnMemory,
      toolsUsed,
    }
  }

  // 2) Bucle agéntico
  const skills = classifyProposalSkills(instruction)
  const skillBlock = formatSkillsForPrompt(skills)
  const system = `${buildProposalEditSystem(skillBlock)}\n\n${AGENT_RULES}`
  const sectionMap = formatSectionMapForEditor(draft)
  const modelTier = proposalSkillsModelTier(skills)
  const model = resolveModel(modelTier)
  const toolSpecs = getProposalToolSpecs()
  const wantsFullDoc = skills.includes('language') || skills.includes('regenerate')
  const maxTokens = wantsFullDoc ? 32000 : 8000

  emitSafe(emit, { type: 'start', skills, model: modelTier })

  const state: ProposalToolState = {
    draft,
    contextPack,
    polishOpts,
    theme,
  }

  const messages: ORMessage[] = [{ role: 'system', content: system }]
  for (const m of (input.history || []).slice(-8)) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({
    role: 'user',
    content: [
      `CONTEXTO DEL CLIENTE:\n${contextPack.block}`,
      `MAPA DE SECCIONES:\n${sectionMap}`,
      `DOCUMENTO ACTUAL (BRM):\n${state.draft || '(vacío)'}`,
      `─────\nINSTRUCCIÓN:\n${instruction}`,
      local?.length
        ? `(Ya se aplicaron atajos locales: ${local.map((p) => p.op).join(', ')}. Continúa con el resto de la instrucción.)`
        : null,
      wantsFullDoc
        ? 'Esta instrucción pide documento entero: usa replace_document con el BRM completo.'
        : null,
      'Usa herramientas. Cuando hayas terminado, responde sin tool calls.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  })

  let toolCallCount = 0
  let modelTurns = 0
  const maxToolCalls = 14
  const maxModelTurns = 3
  const maxMs = 180_000
  let verifyRetries = 0
  const maxVerifyRetries = 2

  const runToolBatch = async (
    toolCalls: Array<{ id: string; name: string; arguments: unknown }>
  ) => {
    for (const tc of toolCalls) {
      throwIfAborted(signal)
      if (toolCallCount >= maxToolCalls) break
      toolCallCount += 1
      toolsUsed.push(tc.name)
      const target = toolCallTarget(tc.name, tc.arguments)
      emitSafe(emit, { type: 'tool', name: tc.name, target })
      emitSafe(emit, {
        type: 'progress',
        done: toolCallCount,
        total: maxToolCalls,
        label: target || tc.name,
      })
      const result = await runProposalTool(tc.name, tc.arguments, state)
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      })
    }
  }

  while (modelTurns < maxModelTurns && Date.now() - started < maxMs) {
    throwIfAborted(signal)
    modelTurns += 1
    const turn = await openRouterToolTurn(messages, toolSpecs, {
      model,
      temperature: 0.2,
      maxTokens,
    })
    messages.push(turn.assistantMessage)

    if (!turn.toolCalls.length) {
      break
    }

    await runToolBatch(turn.toolCalls)

    if (toolCallCount >= maxToolCalls) break

    const midStats = diffProposalStats(before, state.draft)
    const mid = verifyIntent(instruction, midStats)
    if (mid.satisfied && (midStats.wordsDelta !== 0 || midStats.sectionsTouched.length > 0)) {
      break
    }
  }

  draft = state.draft
  theme = state.theme || theme

  let stats = diffProposalStats(before, draft)
  let verify = verifyIntent(instruction, stats)

  while (
    !verify.satisfied &&
    verifyRetries < maxVerifyRetries &&
    modelTurns < maxModelTurns &&
    Date.now() - started < maxMs &&
    toolCallCount < maxToolCalls
  ) {
    throwIfAborted(signal)
    verifyRetries += 1
    const reason =
      verify.reason || 'la ampliación fue insuficiente, reintentando'
    emitSafe(emit, { type: 'retry', reason })
    messages.push({
      role: 'user',
      content: `VERIFICACIÓN FALLIDA: ${reason}. wordsDelta=${stats.wordsDelta}. Hazlo de verdad ahora (rewrite_section_freeform si hace falta), sección por sección.`,
    })
    modelTurns += 1
    const turn = await openRouterToolTurn(messages, toolSpecs, {
      model,
      temperature: 0.25,
      maxTokens,
    })
    messages.push(turn.assistantMessage)
    if (!turn.toolCalls.length) break
    await runToolBatch(turn.toolCalls)
    draft = state.draft
    theme = state.theme || theme
    stats = diffProposalStats(before, draft)
    verify = verifyIntent(instruction, stats)
  }

  throwIfAborted(signal)

  const resolved = resolveEditorNote({
    instruction,
    modelNote: '',
    stats,
  })

  const turnMemory: ProposalTurnMemory = {
    instruction: input.instruction,
    tools: toolsUsed,
    sections: stats.sectionsTouched,
    stats,
    satisfied: resolved.satisfied,
  }

  console.info('[proposal-agent]', {
    instruction: input.instruction.slice(0, 100),
    tools: toolsUsed,
    iterations: modelTurns,
    toolCalls: toolCallCount,
    wordsDelta: stats.wordsDelta,
    satisfied: resolved.satisfied,
    ms: Date.now() - started,
  })

  const content = draft.trim() || before
  emitSafe(emit, {
    type: 'done',
    content,
    note: resolved.note,
    theme: theme || null,
    stats,
    intentSatisfied: resolved.satisfied,
  })

  return {
    content,
    note: resolved.note,
    theme,
    stats,
    intentSatisfied: resolved.satisfied,
    turnMemory,
    toolsUsed,
  }
}
