/**
 * Convierte el texto de una incidencia en algo legible.
 *
 * Los paneles de los clientes mandan un texto plano del estilo:
 *   [api/derivar] Error: Derivación sin teléfono: … Stack: Error: … at u (…) at … Contexto: {"call_id":"…"} Entorno: production · 2026-11-20T17:13:45.568Z
 * Aquí se separa en título, ruta, detalle técnico, contexto y entorno.
 */

export type ParsedIncident = {
  /** Lo que se lee primero: el mensaje sin «Error:» ni la traza */
  title: string
  /** Ruta o etiqueta entre corchetes al principio ([api/derivar], [PRUEBA]) */
  tag: string | null
  /** Líneas de la traza (Stack) */
  stack: string[]
  /** Contexto como pares clave/valor si venía en JSON; si no, el texto tal cual */
  context: { key: string; value: string }[]
  contextRaw: string | null
  environment: string | null
  /** Fecha que manda el cliente dentro del texto */
  reportedAt: string | null
}

const MARKERS = ['Stack:', 'Contexto:', 'Context:', 'Entorno:', 'Environment:']

function sectionAfter(text: string, marker: string): string | null {
  const i = text.indexOf(marker)
  if (i < 0) return null
  let end = text.length
  for (const m of MARKERS) {
    if (m === marker) continue
    const j = text.indexOf(m, i + marker.length)
    if (j >= 0 && j < end) end = j
  }
  return text.slice(i + marker.length, end).trim()
}

function firstMarkerIndex(text: string): number {
  let min = text.length
  for (const m of MARKERS) {
    const j = text.indexOf(m)
    if (j >= 0 && j < min) min = j
  }
  return min
}

function stringify(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

export function parseIncidentText(raw: string): ParsedIncident {
  let text = (raw || '').replace(/\s+/g, ' ').trim()

  let tag: string | null = null
  const tagMatch = /^\[([^\]]{1,80})\]\s*/.exec(text)
  if (tagMatch) {
    tag = tagMatch[1].trim()
    text = text.slice(tagMatch[0].length)
  }

  const head = text.slice(0, firstMarkerIndex(text)).trim()
  const title = head.replace(/^(Error|TypeError|ReferenceError|RangeError|SyntaxError):\s*/i, '').trim() || head || raw

  const stackRaw = sectionAfter(text, 'Stack:')
  const stack = stackRaw
    ? stackRaw
        .split(/\s+(?=at\s)/)
        .map((l) => l.trim())
        .filter(Boolean)
    : []

  const contextRaw = sectionAfter(text, 'Contexto:') ?? sectionAfter(text, 'Context:')
  let context: { key: string; value: string }[] = []
  if (contextRaw) {
    try {
      const parsed = JSON.parse(contextRaw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        context = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({ key, value: stringify(value) }))
      }
    } catch {
      context = []
    }
  }

  const envRaw = sectionAfter(text, 'Entorno:') ?? sectionAfter(text, 'Environment:')
  let environment: string | null = null
  let reportedAt: string | null = null
  if (envRaw) {
    const [env, ...rest] = envRaw.split('·').map((s) => s.trim())
    environment = env || null
    const date = rest.join(' ').trim()
    reportedAt = date && !Number.isNaN(new Date(date).getTime()) ? new Date(date).toISOString() : null
  }

  return { title, tag, stack, context, contextRaw: context.length ? null : contextRaw, environment, reportedAt }
}
