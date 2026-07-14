import { query } from '@/lib/db'
import {
  inWebFormPeriod,
  parseWebFormSubmission,
  type WebFormSubmissionEstado,
  type WebFormSubmissionRow,
} from '@/lib/marketing/web-form-submissions.types'

export type {
  WebFormCuerpo,
  WebFormPayloadItem,
  WebFormSubmissionEstado,
  WebFormSubmissionRow,
} from '@/lib/marketing/web-form-submissions.types'

export {
  ESTADO_LABELS,
  ETIQUETA_LABELS,
  normalizeWebFormPayload,
  parseWebFormSubmission,
} from '@/lib/marketing/web-form-submissions.types'

type DbRow = {
  id: number
  payload: unknown
  estado: string
  notas: string | null
  responded_at: Date | null
  created_at: Date
}

function mapDbRow(row: DbRow): WebFormSubmissionRow {
  return parseWebFormSubmission(row.id, row.payload, {
    estado: row.estado,
    notas: row.notas,
    responded_at: row.responded_at,
    created_at: row.created_at,
  })
}

export async function isWebFormSubmissionsTableAvailable(): Promise<boolean> {
  try {
    await query(`SELECT 1 FROM web_form_submissions LIMIT 1`)
    return true
  } catch {
    return false
  }
}

export async function countWebFormSubmissions(period: string): Promise<number> {
  const rows = await listWebFormSubmissions(period, 10000)
  return rows.length
}

export async function countPendingWebFormSubmissions(period: string): Promise<number> {
  const rows = await listWebFormSubmissions(period, 10000)
  return rows.filter((r) => r.estado === 'pendiente').length
}

export async function listWebFormSubmissions(
  period: string,
  limit = 200
): Promise<WebFormSubmissionRow[]> {
  if (!(await isWebFormSubmissionsTableAvailable())) return []

  const result = await query<DbRow>(
    `SELECT id, payload, estado, notas, responded_at, created_at
     FROM web_form_submissions
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(limit * 3, 500)]
  )

  return result.rows
    .map(mapDbRow)
    .filter((r) => inWebFormPeriod(r.submitted_at, period))
    .slice(0, limit)
}

export async function updateWebFormSubmissionStatus(
  id: number,
  estado: WebFormSubmissionEstado,
  notas?: string | null
): Promise<WebFormSubmissionRow | null> {
  const result = await query<DbRow>(
    `UPDATE web_form_submissions SET
       estado = $2,
       notas = COALESCE($3, notas),
       responded_at = CASE WHEN $2 = 'contactado' THEN COALESCE(responded_at, NOW()) ELSE responded_at END
     WHERE id = $1
     RETURNING id, payload, estado, notas, responded_at, created_at`,
    [id, estado, notas ?? null]
  )
  const row = result.rows[0]
  return row ? mapDbRow(row) : null
}
