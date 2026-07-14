export type WebFormSubmissionEstado = 'pendiente' | 'contactado' | 'descartado'

export interface WebFormCuerpo {
  fullname?: string | null
  email?: string | null
  company?: string | null
  phone?: string | null
  service?: string | null
  calls?: string | null
  source?: string | null
  page_url?: string | null
  timestamp?: string | null
  [key: string]: unknown
}

export interface WebFormPayloadItem {
  cuerpo?: WebFormCuerpo | null
  etiqueta?: string | null
}

export interface WebFormSubmissionRow {
  id: number
  etiqueta: string
  fullname: string | null
  email: string | null
  company: string | null
  phone: string | null
  service: string | null
  calls: string | null
  source: string | null
  page_url: string | null
  submitted_at: string
  estado: WebFormSubmissionEstado
  notas: string | null
  responded_at: string | null
  created_at: string
  payload: WebFormPayloadItem
}

export const ETIQUETA_LABELS: Record<string, string> = {
  footer: 'Footer',
  contacto: 'Contacto',
  agente_llamadas: 'Agente llamadas',
  agente_texto: 'Agente texto',
  automatizaciones: 'Automatizaciones',
}

export const ESTADO_LABELS: Record<WebFormSubmissionEstado, string> = {
  pendiente: 'Pendiente',
  contactado: 'Contactado',
  descartado: 'Descartado',
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

/** Normaliza payload: array n8n [{ cuerpo, etiqueta }] u objeto suelto */
export function normalizeWebFormPayload(raw: unknown): WebFormPayloadItem {
  if (raw == null) return { cuerpo: {}, etiqueta: 'automatizaciones' }

  if (Array.isArray(raw)) {
    const first = raw[0]
    if (first && typeof first === 'object') return first as WebFormPayloadItem
    return { cuerpo: {}, etiqueta: 'automatizaciones' }
  }

  if (typeof raw === 'object') return raw as WebFormPayloadItem

  if (typeof raw === 'string') {
    try {
      return normalizeWebFormPayload(JSON.parse(raw))
    } catch {
      return { cuerpo: {}, etiqueta: 'automatizaciones' }
    }
  }

  return { cuerpo: {}, etiqueta: 'automatizaciones' }
}

export function parseWebFormSubmission(
  id: number,
  payloadRaw: unknown,
  meta: {
    estado: string
    notas: string | null
    responded_at: Date | string | null
    created_at: Date | string
  }
): WebFormSubmissionRow {
  const item = normalizeWebFormPayload(payloadRaw)
  const cuerpo = item.cuerpo ?? {}
  const etiqueta = (item.etiqueta || 'automatizaciones').toLowerCase()

  let submittedAt: Date
  if (cuerpo.timestamp) {
    const d = new Date(cuerpo.timestamp)
    submittedAt = Number.isNaN(d.getTime()) ? new Date(meta.created_at) : d
  } else {
    submittedAt =
      meta.created_at instanceof Date ? meta.created_at : new Date(meta.created_at)
  }

  return {
    id,
    etiqueta,
    fullname: str(cuerpo.fullname),
    email: str(cuerpo.email),
    company: str(cuerpo.company),
    phone: str(cuerpo.phone),
    service: str(cuerpo.service),
    calls: str(cuerpo.calls),
    source: str(cuerpo.source),
    page_url: str(cuerpo.page_url),
    submitted_at: submittedAt.toISOString(),
    estado: meta.estado as WebFormSubmissionEstado,
    notas: meta.notas,
    responded_at: meta.responded_at
      ? meta.responded_at instanceof Date
        ? meta.responded_at.toISOString()
        : new Date(meta.responded_at).toISOString()
      : null,
    created_at:
      meta.created_at instanceof Date
        ? meta.created_at.toISOString()
        : new Date(meta.created_at).toISOString(),
    payload: item,
  }
}

export function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number)
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m, 0, 23, 59, 59, 999)
  return { start, end }
}

export function inWebFormPeriod(submittedAt: string, period: string): boolean {
  const { start, end } = periodBounds(period)
  const t = new Date(submittedAt).getTime()
  return t >= start.getTime() && t <= end.getTime()
}
