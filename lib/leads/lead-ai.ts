import { openRouterChatCompletion } from '@/lib/openrouter'
import { collectLeadContext, contextToMarkdown, fileNameFor } from '@/lib/leads/context-sources'

const MAX_AI_CONTEXT_CHARS = 24_000

/**
 * Todo lo que sabemos de un lead en Markdown (datos, canal de entrada, correos, reuniones,
 * mensajes, notas, documentos, facturas y proyecto). Sirve para exportarlo o pasárselo a la IA.
 */
export async function buildLeadContextMarkdown(
  leadId: number,
  opts: { includePrices: boolean }
): Promise<{ markdown: string; fileName: string } | null> {
  const ctx = await collectLeadContext(leadId, opts)
  if (!ctx) return null
  return { markdown: contextToMarkdown(ctx), fileName: fileNameFor(ctx) }
}

const SYSTEM =
  'Eres el asistente interno de Buffalo AI. Trabajas solo con la información del lead que se te da. ' +
  'Responde en español de España, claro y breve. Si un dato no aparece, dilo sin inventar nada.'

async function aiContext(leadId: number, includePrices: boolean): Promise<string> {
  const ctx = await collectLeadContext(leadId, { includePrices })
  if (!ctx) throw new Error('Lead no encontrado')
  const md = contextToMarkdown(ctx, { maxBodyChars: 2500 })
  return md.length > MAX_AI_CONTEXT_CHARS ? `${md.slice(0, MAX_AI_CONTEXT_CHARS)}…` : md
}

/** Responde una pregunta sobre el lead con todo su contexto. */
export async function askAboutLead(leadId: number, question: string, includePrices: boolean): Promise<string> {
  const ctx = await aiContext(leadId, includePrices)
  return openRouterChatCompletion([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${ctx}\n\n## Pregunta\n${question.trim()}` },
  ])
}

/** Propone un texto de contexto para revisarlo y guardarlo. No guarda nada. */
export async function draftLeadSummary(leadId: number, includePrices: boolean): Promise<string> {
  const ctx = await aiContext(leadId, includePrices)
  return openRouterChatCompletion([
    {
      role: 'system',
      content:
        SYSTEM +
        ' Escribe un resumen en texto plano (sin markdown): quién es, qué quiere, en qué punto está, ' +
        'qué se ha hablado y qué queda pendiente. Máximo 12 líneas.',
    },
    { role: 'user', content: ctx },
  ])
}
