import { query } from '@/lib/db'
import {
  inWebFormPeriod,
  periodBounds,
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
  extractWebAttribution,
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
  const rows = await listPeriodRows(period)
  return rows.length
}

export async function countPendingWebFormSubmissions(period: string): Promise<number> {
  const rows = await listPeriodRows(period)
  return rows.filter((r) => r.estado === 'pendiente').length
}

/** Margen alrededor del mes: la fecha del envío (cuerpo.timestamp) puede diferir algo de created_at. */
const PERIOD_MARGIN_DAYS = 3

/**
 * Envíos del mes. El rango se filtra en SQL (antes se traían los últimos 500 y se filtraba
 * en memoria, así que un mes antiguo podía salir incompleto) y se afina por fecha de envío.
 */
async function listPeriodRows(period: string): Promise<WebFormSubmissionRow[]> {
  if (!/^\d{4}-\d{2}$/.test(period)) return []
  const { start, end } = periodBounds(period)
  try {
    const result = await query<DbRow>(
      `SELECT id, payload, estado, notas, responded_at, created_at
         FROM web_form_submissions
        WHERE created_at >= $1::timestamptz - make_interval(days => $3)
          AND created_at <= $2::timestamptz + make_interval(days => $3)
        ORDER BY created_at DESC`,
      [start.toISOString(), end.toISOString(), PERIOD_MARGIN_DAYS]
    )
    return result.rows.map(mapDbRow).filter((r) => inWebFormPeriod(r.submitted_at, period))
  } catch (e) {
    if (e instanceof Error && e.message.includes('web_form_submissions') && e.message.includes('does not exist')) return []
    throw e
  }
}

export async function listWebFormSubmissions(
  period: string,
  limit = 200
): Promise<WebFormSubmissionRow[]> {
  // Mismo orden que antes (más recientes primero por created_at)
  const rows = await listPeriodRows(period)
  return rows.slice(0, limit)
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
