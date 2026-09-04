import type { ParsedUrlQuery } from 'querystring'

function parsePositiveInt(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Lead actual según la ruta o `?lead=` / `?leadId=`. */
export function leadIdFromRoute(pathname: string, query: ParsedUrlQuery): number | null {
  const fromQuery = parsePositiveInt(query.lead) ?? parsePositiveInt(query.leadId)
  if (fromQuery) return fromQuery

  const leadPath = pathname.match(/^\/leads\/(\d+)(?:\/|$)/)
  if (leadPath) return parsePositiveInt(leadPath[1])

  const projectPath = pathname.match(/^\/onboarding\/proyectos\/(\d+)(?:\/|$)/)
  if (projectPath) return parsePositiveInt(projectPath[1])

  return null
}

export function leadContextHref(leadId: number): string {
  return `/leads/${leadId}#contexto`
}

export function leadNewNoteHref(leadId: number): string {
  return `/onboarding/notas?lead=${leadId}&nueva=1`
}
