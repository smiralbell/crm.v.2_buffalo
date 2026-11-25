import { createHash } from 'crypto'
import { query } from '@/lib/db'
import { openRouterChatCompletion } from '@/lib/openrouter'
import { STABLE_SOURCES, VALUE_SOURCES, collectLeadContext, contextToMarkdown, type LeadContext } from '@/lib/leads/context-sources'

/**
 * Resumen con IA de un lead, arriba de su ficha.
 * Solo se regenera cuando cambia el contenido de valor (correos, reuniones, mensajes,
 * notas, documentos o el contexto escrito). Que el lead entre o cambie de estado no cuenta.
 */

export type LeadSummary = {
  summary: string | null
  generated_at: string | null
  /** Hay contenido nuevo desde el último resumen */
  stale: boolean
  /** Hay algo de valor con lo que hacer un resumen */
  has_content: boolean
}

let ready = false
async function ensureTable(): Promise<void> {
  if (ready) return
  await query(`
    CREATE TABLE IF NOT EXISTS lead_ai_summaries (
      lead_id      INTEGER PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
      summary      TEXT NOT NULL,
      fingerprint  TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
  ready = true
}

/** Huella del contenido de valor: cambia solo si llega o cambia algo que merece un resumen nuevo. */
export function valueFingerprint(ctx: LeadContext): { fingerprint: string; hasContent: boolean } {
  const parts: string[] = []
  let count = 0
  for (const s of ctx.sources) {
    if (!VALUE_SOURCES.includes(s.id)) continue
    for (const it of s.items) {
      count++
      parts.push(
        STABLE_SOURCES.includes(s.id) ? `${s.id}:${it.id}` : `${s.id}:${it.id}:${it.date ?? ''}:${(it.body ?? '').length}`
      )
    }
  }
  return { fingerprint: createHash('sha1').update(parts.sort().join('|')).digest('hex'), hasContent: count > 0 }
}

async function readStored(leadId: number): Promise<{ summary: string; fingerprint: string; generated_at: Date } | null> {
  await ensureTable()
  const { rows } = await query<{ summary: string; fingerprint: string; generated_at: Date }>(
    `SELECT summary, fingerprint, generated_at FROM lead_ai_summaries WHERE lead_id = $1`,
    [leadId]
  )
  return rows[0] ?? null
}

export async function getLeadSummary(leadId: number, includePrices: boolean): Promise<LeadSummary | null> {
  const ctx = await collectLeadContext(leadId, { includePrices })
  if (!ctx) return null
  const { fingerprint, hasContent } = valueFingerprint(ctx)
  const stored = await readStored(leadId)
  return {
    summary: stored?.summary ?? null,
    generated_at: stored ? new Date(stored.generated_at).toISOString() : null,
    stale: hasContent && (!stored || stored.fingerprint !== fingerprint),
    has_content: hasContent,
  }
}

const SYSTEM = [
  'Eres el asistente interno de Buffalo AI. Resumes el contexto de un lead para el equipo comercial.',
  'Usa solo la información que se te da. No inventes datos, cifras ni nombres.',
  'Escribe en español de España, en texto plano y sin markdown, como máximo 6 frases cortas:',
  'quién es y qué necesita, en qué punto está, qué se ha hablado (correos y reuniones) y qué queda pendiente.',
  'Si tiene proyecto o facturas, ya es cliente aunque su estado diga otra cosa: cuenta qué se le ha hecho,',
  'cómo va el proyecto (tareas, tickets) y si hay cobros pendientes, en vez de tratarlo como un lead por cerrar.',
  'No digas que falta información ni enumeres lo que no hay.',
  'Termina con una línea que empiece por «Siguiente paso:».',
].join(' ')

export async function regenerateLeadSummary(leadId: number, includePrices: boolean): Promise<LeadSummary | null> {
  const ctx = await collectLeadContext(leadId, { includePrices })
  if (!ctx) return null
  const { fingerprint, hasContent } = valueFingerprint(ctx)
  if (!hasContent) return { summary: null, generated_at: null, stale: false, has_content: false }

  const markdown = contextToMarkdown(ctx, { maxBodyChars: 2500 }).slice(0, 24_000)
  const text = (
    await openRouterChatCompletion(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: markdown },
      ],
      { temperature: 0.2, maxTokens: 500 }
    )
  ).trim()

  await ensureTable()
  const { rows } = await query<{ generated_at: Date }>(
    `INSERT INTO lead_ai_summaries (lead_id, summary, fingerprint, generated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (lead_id) DO UPDATE
       SET summary = EXCLUDED.summary, fingerprint = EXCLUDED.fingerprint, generated_at = NOW()
     RETURNING generated_at`,
    [leadId, text, fingerprint]
  )
  return { summary: text, generated_at: new Date(rows[0].generated_at).toISOString(), stale: false, has_content: true }
}
