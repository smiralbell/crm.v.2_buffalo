import { createHash, timingSafeEqual } from 'crypto'
import type { NextApiRequest } from 'next'
import { query } from '@/lib/db'
import {
  inWebFormPeriod,
  isWebFormEmpty,
  normalizeWebFormPayload,
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
  SITE_LABELS,
  buildWebFormMarkdown,
  extraFormFields,
  isWebFormEmpty,
  normalizeWebFormPayload,
  parseWebFormSubmission,
  webFormWebhookUrl,
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

function envSecret(name: string): string | null {
  return process.env[name]?.trim() || null
}

export function webFormWebhookToken(): string | null {
  return envSecret('WEBFORM_WEBHOOK_TOKEN') || envSecret('INGEST_TOKEN') || 'buf-webform-2026'
}

export function webFormBearerMatches(req: NextApiRequest): boolean {
  const expected = webFormWebhookToken()
  if (!expected) return false
  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!provided) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

let tableEnsured = false
export async function ensureWebFormSubmissionsTable(): Promise<void> {
  if (tableEnsured) return
  await query(`
    CREATE TABLE IF NOT EXISTS web_form_submissions (
      id            SERIAL PRIMARY KEY,
      payload       JSONB NOT NULL,
      estado        TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'contactado', 'descartado')),
      notas         TEXT,
      responded_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_web_form_submissions_created_at
      ON web_form_submissions (created_at DESC)
  `)
  tableEnsured = true
}

export async function isWebFormSubmissionsTableAvailable(): Promise<boolean> {
  try {
    await ensureWebFormSubmissionsTable()
    await query(`SELECT 1 FROM web_form_submissions LIMIT 1`)
    return true
  } catch {
    return false
  }
}

export async function insertWebFormSubmission(raw: unknown): Promise<WebFormSubmissionRow> {
  await ensureWebFormSubmissionsTable()
  const item = normalizeWebFormPayload(raw)
  if (isWebFormEmpty(item)) {
    throw new Error('El formulario está vacío: hace falta al menos un campo en form')
  }
  const stored = {
    site: item.site,
    page: item.page,
    etiqueta: item.etiqueta,
    form: item.cuerpo,
    cuerpo: item.cuerpo,
  }
  const result = await query<DbRow>(
    `INSERT INTO web_form_submissions (payload)
     VALUES ($1::jsonb)
     RETURNING id, payload, estado, notas, responded_at, created_at`,
    [JSON.stringify(stored)]
  )
  const row = result.rows[0]
  if (!row) throw new Error('No se pudo guardar el formulario')
  return mapDbRow(row)
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
