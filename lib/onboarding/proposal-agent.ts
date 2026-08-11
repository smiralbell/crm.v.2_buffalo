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
}

function emptyStats(draft: string): ProposalDiffStats {
  return diffProposalStats(draft, draft)
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
}): Promise<ProposalAgentResult> {
  const started = Date.now()
  const before = (input.draft || '').replace(/\r\n/g, '\n').trim()
  const polishOpts = {
    clientName: input.clientName,
    clientCompany: input.clientCompany,
  }

  let instruction = input.instruction.trim()
  if (!instruction) throw new Error('Instrucción vacía')

  if (isFeedbackOnly(instruction)) {
    if (input.lastTurn) {
      instruction = buildFeedbackRelaunch(input.lastTurn, instruction)
    } else {
      const stats = emptyStats(before)
      return {
        content: before,
        note: 'Dime qué cambio concreto quieres (punto, sección o pega el fragmento). No tengo el turno anterior anclado.',
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
      for (const p of local) toolsUsed.push(`local:${p.op}`)
    }
  }

  // Solo atajos locales si cubren al 100% (sin redacción / diseño / contenido)
  const localOnly = Boolean(local?.length) && !instructionNeedsAgent(instruction)
  if (localOnly) {
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
    const satisfied =
      resolved.satisfied || draft !== before || Boolean(theme)
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

  // 2) Bucle agéntico (también tras atajos parciales: p. ej. quitar saltos + ampliar)
  const skills = classifyProposalSkills(instruction)
  const skillBlock = formatSkillsForPrompt(skills)
  const system = `${buildProposalEditSystem(skillBlock)}\n\n${AGENT_RULES}`
  const sectionMap = formatSectionMapForEditor(draft)
  const model = resolveModel(proposalSkillsModelTier(skills))
  const toolSpecs = getProposalToolSpecs()
  const wantsFullDoc = skills.includes('language') || skills.includes('regenerate')
  const maxTokens = wantsFullDoc ? 32000 : 8000

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

  while (modelTurns < maxModelTurns && Date.now() - started < maxMs) {
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

    for (const tc of turn.toolCalls) {
      if (toolCallCount >= maxToolCalls) break
      toolCallCount += 1
      toolsUsed.push(tc.name)
      const result = await runProposalTool(tc.name, tc.arguments, state)
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      })
    }

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
    verifyRetries += 1
    messages.push({
      role: 'user',
      content: `VERIFICACIÓN FALLIDA: ${verify.reason || 'el cambio no cumple la intención'}. wordsDelta=${stats.wordsDelta}. Hazlo de verdad ahora (rewrite_section_freeform si hace falta), sección por sección.`,
    })
    modelTurns += 1
    const turn = await openRouterToolTurn(messages, toolSpecs, {
      model,
      temperature: 0.25,
      maxTokens,
    })
    messages.push(turn.assistantMessage)
    if (!turn.toolCalls.length) break
    for (const tc of turn.toolCalls) {
      if (toolCallCount >= maxToolCalls) break
      toolCallCount += 1
      toolsUsed.push(tc.name)
      const result = await runProposalTool(tc.name, tc.arguments, state)
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      })
    }
    draft = state.draft
    theme = state.theme || theme
    stats = diffProposalStats(before, draft)
    verify = verifyIntent(instruction, stats)
  }

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

  return {
    content: draft.trim() || before,
    note: resolved.note,
    theme,
    stats,
    intentSatisfied: resolved.satisfied,
    turnMemory,
    toolsUsed,
  }
}
