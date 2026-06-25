export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface IngestedTicket {
  title: string
  description: string | null
  priority: TicketPriority
  status: TicketStatus
  reporter_name: string | null
  reporter_email: string | null
  source: string
  external_id: string | null
  payload: Record<string, unknown>
  custom_fields: Record<string, unknown>
}

const PRIORITY_MAP: Record<string, TicketPriority> = {
  low: 'low',
  baja: 'low',
  menor: 'low',
  medium: 'medium',
  media: 'medium',
  med: 'medium',
  normal: 'medium',
  high: 'high',
  alta: 'high',
  urgent: 'high',
  urgente: 'high',
  critical: 'critical',
  critica: 'critical',
  crítica: 'critical',
}

const STATUS_MAP: Record<string, TicketStatus> = {
  open: 'open',
  abierto: 'open',
  nuevo: 'open',
  new: 'open',
  in_progress: 'in_progress',
  progress: 'in_progress',
  en_progreso: 'in_progress',
  working: 'in_progress',
  resolved: 'resolved',
  resuelto: 'resolved',
  fixed: 'resolved',
  closed: 'closed',
  cerrado: 'closed',
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return null
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return null
}

function normalizePriority(raw: unknown): TicketPriority {
  if (typeof raw !== 'string') return 'medium'
  return PRIORITY_MAP[raw.toLowerCase().trim()] ?? 'medium'
}

function normalizeStatus(raw: unknown): TicketStatus {
  if (typeof raw !== 'string') return 'open'
  return STATUS_MAP[raw.toLowerCase().trim()] ?? 'open'
}

function extractCustomFields(body: Record<string, unknown>): Record<string, unknown> {
  const fields = asRecord(body.fields)
  if (fields) return fields
  const custom = asRecord(body.custom_fields)
  if (custom) return custom
  const metadata = asRecord(body.metadata)
  if (metadata) return metadata
  const extra = asRecord(body.extra)
  if (extra) return extra

  const reserved = new Set([
    'title', 'description', 'priority', 'status', 'reporter', 'reporter_name',
    'reporter_email', 'fields', 'custom_fields', 'metadata', 'extra', 'source',
    'external_id', 'project_id', 'projectId', 'project_ref', 'projectRef',
    'config_ref', 'configRef', 'id',
  ])
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (!reserved.has(k) && v !== undefined && v !== null) out[k] = v
  }
  return out
}

export function ingestTicketPayload(body: unknown): IngestedTicket {
  const raw = asRecord(body) ?? {}
  const fields = extractCustomFields(raw)
  const reporter = asRecord(raw.reporter)

  const title =
    firstString(raw.title, raw.subject, raw.titulo, fields.titulo, fields.title, fields.asunto) ||
    firstString(raw.description, raw.descripcion)?.slice(0, 120) ||
    'Incidencia sin título'

  const description = firstString(
    raw.description,
    raw.descripcion,
    raw.body,
    raw.message,
    raw.mensaje,
    fields.descripcion,
    fields.description
  )

  const reporter_name = firstString(
    reporter?.name,
    reporter?.nombre,
    raw.reporter_name,
    raw.reporterName,
    fields.usuario,
    fields.user_name,
    fields.nombre_usuario
  )

  const reporter_email = firstString(
    reporter?.email,
    raw.reporter_email,
    raw.reporterEmail,
    fields.email,
    fields.user_email
  )

  return {
    title,
    description,
    priority: normalizePriority(raw.priority ?? fields.prioridad ?? fields.priority),
    status: normalizeStatus(raw.status ?? fields.estado ?? fields.status),
    reporter_name,
    reporter_email,
    source: firstString(raw.source, fields.source) || 'dashboard',
    external_id: firstString(raw.external_id, raw.externalId, raw.id, fields.external_id),
    payload: raw,
    custom_fields: fields,
  }
}

export function flattenCustomFieldsForDisplay(
  fields: Record<string, unknown>
): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = []

  function walk(obj: Record<string, unknown>, prefix = '') {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k
      if (v === null || v === undefined) continue
      if (typeof v === 'object' && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, key)
      } else if (Array.isArray(v)) {
        rows.push({ key, value: JSON.stringify(v) })
      } else {
        rows.push({ key, value: String(v) })
      }
    }
  }

  walk(fields)
  return rows.sort((a, b) => a.key.localeCompare(b.key))
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Abierto',
  in_progress: 'En progreso',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}
