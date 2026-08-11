import { openRouterChatCompletion, resolveModel } from '@/lib/openrouter'
import type { ConfiguradorConfig } from '@/lib/engranaje5/types'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import { getAuditByLeadId } from '@/lib/onboarding/audit/store'
import { buildProposalPayload } from '@/lib/onboarding/audit/proposal'
import { listMeetingsForLead } from '@/lib/integrations/fireflies/store'

export function encodeConfiguradorConfig(cfg: ConfiguradorConfig): string {
  return Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64')
}

/** Une config existente con parches sin perder el resto de campos. */
export function mergeLeadConfig(
  raw: string | null | undefined,
  patch: Partial<ConfiguradorConfig>
): { cfg: ConfiguradorConfig; encoded: string } {
  const existing = parseConfiguradorConfig(raw) || ({ mode: 'custom' } as ConfiguradorConfig)
  const cfg: ConfiguradorConfig = {
    ...existing,
    ...patch,
    mode: existing.mode || patch.mode || 'custom',
  }
  return { cfg, encoded: encodeConfiguradorConfig(cfg) }
}

/** Fuentes CRM (auditoría + reuniones) para enriquecer el contexto. */
export async function buildCrmContextSources(leadId: number): Promise<string> {
  const parts: string[] = []

  try {
    const audit = await getAuditByLeadId(leadId)
    if (audit) {
      const payload = buildProposalPayload(audit)
      parts.push('## Auditoría Buffalo (copiloto)\n' + payload.brief)
    }
  } catch {
    /* best-effort */
  }

  try {
    const meetings = await listMeetingsForLead(leadId)
    if (meetings.length) {
      const blocks = meetings.slice(0, 12).map((m, i) => {
        const when = m.started_at
          ? new Date(m.started_at).toLocaleString('es-ES', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : 'sin fecha'
        const lines = [
          `### Reunión ${i + 1}: ${m.title || 'Sin título'} (${when})`,
          m.summary_overview ? `Resumen:\n${m.summary_overview}` : null,
          m.summary_action_items ? `Action items:\n${m.summary_action_items}` : null,
        ].filter(Boolean)
        return lines.join('\n')
      })
      parts.push('## Reuniones Fireflies\n' + blocks.join('\n\n'))
    }
  } catch {
    /* best-effort */
  }

  return parts.join('\n\n').trim()
}

/**
 * Combina texto manual del comercial con fuentes CRM.
 * El texto del comercial va primero (prioridad).
 */
export function composeProjectContext(input: {
  manual: string
  sources?: string
}): string {
  const manual = stripCrmSourcesBlock(input.manual.trim())
  const sources = (input.sources || '').trim()
  if (manual && sources) {
    return `${manual}\n\n---\n\n# Fuentes CRM (auditoría / reuniones)\n\n${sources}`
  }
  return manual || sources
}

/** Quita el bloque de fuentes CRM de un contexto ya compuesto (evita duplicar al re-actualizar). */
export function stripCrmSourcesBlock(text: string): string {
  if (!text) return ''
  const markers = [
    /\n---\s*\n+# Fuentes CRM \(auditoría \/ reuniones\)/i,
    /\n# Fuentes CRM \(auditoría \/ reuniones\)/i,
  ]
  for (const re of markers) {
    const m = text.search(re)
    if (m >= 0) return text.slice(0, m).trim()
  }
  return text.trim()
}

/** Solo genera la definición pulida a partir del contexto. No inventa precios ni cambia otros campos. */
export async function generateDefinitionFromContext(input: {
  context: string
  projectName?: string | null
  clientName?: string | null
  clientCompany?: string | null
  previousDefinition?: string | null
}): Promise<string> {
  const context = input.context.trim()
  if (!context) {
    throw new Error('El contexto está vacío')
  }

  const system = `Eres el responsable de documentación de proyectos en Buffalo AI (agencia de automatización e IA).

Tu ÚNICA tarea: a partir del CONTEXTO bruto (auditoría, reuniones, notas previas, comentarios), escribir la DEFINICIÓN del proyecto.

La definición es el mismo contenido que el contexto, pero:
- Bien redactado, claro y profesional (español)
- Bien estructurado (párrafos cortos o viñetas cuando ayude)
- Explica qué es el proyecto, para quién, problema, objetivo, alcance y notas relevantes
- Sin inventar datos que no estén en el contexto
- Sin precios, sin tablas comerciales, sin propuesta de venta
- Sin markdown de título # excesivo; puedes usar ## o viñetas con moderación
- Longitud: completa pero legible (aprox. 200–600 palabras salvo que el contexto sea más corto)

Responde SOLO con el texto de la definición, sin preámbulos ni comillas.`

  const user = [
    input.projectName ? `Nombre del proyecto: ${input.projectName}` : null,
    input.clientCompany || input.clientName
      ? `Cliente: ${[input.clientCompany, input.clientName].filter(Boolean).join(' · ')}`
      : null,
    input.previousDefinition?.trim()
      ? `Definición anterior (puedes mejorar/reemplazar):\n${input.previousDefinition.trim()}`
      : null,
    '---',
    'CONTEXTO:',
    context,
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await openRouterChatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.3, maxTokens: 2500 }
  )

  const text = String(raw || '').trim()
  if (!text) throw new Error('La IA no devolvió una definición')
  return text.replace(/^```(?:markdown|md|text)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

/** Genera borrador de propuesta comercial (BRM / plantilla Buffalo) a partir de contexto + definición. */
export async function generateProposalFromContext(input: {
  context: string
  definition: string
  projectName?: string | null
  clientName?: string | null
  clientCompany?: string | null
  setupFee?: number | null
  monthlyFee?: number | null
  extraInstructions?: string | null
}): Promise<string> {
  const definition = input.definition.trim()
  const context = input.context.trim()
  if (!definition && !context) {
    throw new Error('Necesitas contexto o definición del proyecto para generar la propuesta')
  }

  const { PROPOSAL_GENERATE_SYSTEM } = await import('@/lib/onboarding/proposal-prompt')
  const { buildProposalContextPack } = await import(
    '@/lib/onboarding/proposal-context-pack'
  )

  const system = PROPOSAL_GENERATE_SYSTEM

  // Mismo pack que el editor: presupuesto de caracteres y recorte por párrafos, para
  // que una auditoría larga + 12 reuniones no desborden la ventana de contexto.
  const contextPack = buildProposalContextPack({
    definition,
    context,
    projectName: input.projectName,
    clientName: input.clientName,
    clientCompany: input.clientCompany,
    setupFee: input.setupFee,
    monthlyFee: input.monthlyFee,
    maxChars: 40_000,
  })

  const user = [
    input.extraInstructions?.trim()
      ? `Instrucciones del comercial (prioridad):\n${input.extraInstructions.trim()}`
      : null,
    '---',
    'OBJETIVO DEL DOCUMENTO:',
    'Genera una PROPUESTA COMERCIAL COMPLETA multi-sección (estilo ACCIÓ / plantilla Buffalo), NO un resumen corto ni un chat. Debe incluir todas las secciones obligatorias del system prompt, con prosa desarrollada, alternativas A/B si aplica, tabla económica, RGPD, mantenimiento, calendario, recomendación y aceptación.',
    '---',
    'CONTEXTO DEL CLIENTE (fuente — úsalo para anclar TODO el texto al cliente real):',
    contextPack.block,
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await openRouterChatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.4, maxTokens: 16000, model: resolveModel('heavy') }
  )

  const text = String(raw || '').trim()
  if (!text) throw new Error('La IA no devolvió una propuesta')
  const cleaned = text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const { polishProposalDraft } = await import('@/lib/onboarding/proposal-brm')
  return polishProposalDraft(cleaned, {
    clientName: input.clientName,
    clientCompany: input.clientCompany,
  })
}

/** Itera la propuesta con el agente de edición (herramientas + verificación). */
export async function reviseProposalWithChat(input: {
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
  lastTurn?: import('@/lib/onboarding/proposal-memory').ProposalTurnMemory | null
  onEvent?: import('@/lib/onboarding/proposal-agent').ProposalAgentEmit
  signal?: AbortSignal
}): Promise<{
  content: string
  note: string
  theme?: 'green' | 'light' | 'dark'
  stats?: import('@/lib/onboarding/proposal-verify').ProposalDiffStats
  intentSatisfied?: boolean
  turnMemory?: import('@/lib/onboarding/proposal-memory').ProposalTurnMemory
  cancelled?: boolean
}> {
  const { runProposalAgent } = await import('@/lib/onboarding/proposal-agent')
  const result = await runProposalAgent({
    draft: input.draft,
    instruction: input.instruction,
    context: input.context,
    definition: input.definition,
    projectName: input.projectName,
    clientName: input.clientName,
    clientCompany: input.clientCompany,
    setupFee: input.setupFee,
    monthlyFee: input.monthlyFee,
    history: input.history,
    lastTurn: input.lastTurn,
    onEvent: input.onEvent,
    signal: input.signal,
  })
  return {
    content: result.content,
    note: result.note,
    theme: result.theme,
    stats: result.stats,
    intentSatisfied: result.intentSatisfied,
    turnMemory: result.turnMemory,
    cancelled: result.cancelled,
  }
}

export type OnboardingDocKind = 'proposal' | 'contract' | 'pre_kickoff'

/** Genera contrato o pre-kick-off a partir de contexto + definición. */
export async function generateOnboardingDoc(input: {
  kind: Exclude<OnboardingDocKind, 'proposal'>
  context: string
  definition: string
  projectName?: string | null
  clientName?: string | null
  clientCompany?: string | null
  setupFee?: number | null
  monthlyFee?: number | null
  extraInstructions?: string | null
}): Promise<string> {
  const definition = input.definition.trim()
  const context = input.context.trim()
  if (!definition && !context) {
    throw new Error('Necesitas contexto o definición del proyecto')
  }

  const isContract = input.kind === 'contract'

  const system = isContract
    ? `Eres el responsable legal/comercial de Buffalo AI. Redactas borradores de contrato de prestación de servicios en español.

Estructura sugerida (adapta; no inventes cifras ni cláusulas ilegales):
1. Partes (Buffalo AI y Cliente)
2. Objeto del contrato
3. Alcance y entregables
4. Precio y forma de pago (solo si hay cifras; si no, “A definir”)
5. Plazos
6. Obligaciones de las partes
7. Confidencialidad y RGPD
8. Propiedad intelectual
9. Duración y resolución
10. Disposiciones generales

Tono claro y profesional. Markdown. Sin emojis. Es un BORRADOR para revisión humana.`
    : `Eres project manager de Buffalo AI. Redactas documentos de pre-kick-off para arrancar el proyecto con el cliente.

Estructura sugerida:
1. Objetivo de la reunión / kick-off
2. Resumen del proyecto (definición)
3. Stakeholders y roles
4. Alcance confirmado vs fuera de alcance
5. Datos / accesos / materiales que necesitamos del cliente
6. Dependencias e integraciones
7. Plan de fases y hitos tentativos
8. Riesgos y preguntas abiertas
9. Agenda propuesta del kick-off (30–45 min)
10. Próximos pasos post kick-off

Tono operativo, claro, en español. Markdown. Sin emojis.`

  const user = [
    input.projectName ? `Proyecto: ${input.projectName}` : null,
    input.clientCompany || input.clientName
      ? `Cliente: ${[input.clientCompany, input.clientName].filter(Boolean).join(' · ')}`
      : null,
    input.setupFee != null && input.setupFee > 0 ? `Setup (€): ${input.setupFee}` : null,
    input.monthlyFee != null && input.monthlyFee > 0 ? `Mensualidad (€): ${input.monthlyFee}` : null,
    input.extraInstructions?.trim()
      ? `Instrucciones extra:\n${input.extraInstructions.trim()}`
      : null,
    '---',
    'DEFINICIÓN:',
    definition || '(vacía)',
    '---',
    'CONTEXTO:',
    context || '(vacío)',
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await openRouterChatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.35, maxTokens: 4500 }
  )

  const text = String(raw || '').trim()
  if (!text) throw new Error(isContract ? 'La IA no devolvió un contrato' : 'La IA no devolvió el pre-kick-off')
  return text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

