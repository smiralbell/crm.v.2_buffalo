import { queryChat } from '@/lib/db-chat'
import { inWebFormPeriod } from '@/lib/marketing/web-form-submissions.types'
import type {
  FormacionDiagnosticoRow,
  FormacionIntent,
} from '@/lib/marketing/formacion-diagnosticos.types'

export type { FormacionDiagnosticoRow, FormacionIntent } from '@/lib/marketing/formacion-diagnosticos.types'
export { FORMACION_INTENT_LABELS } from '@/lib/marketing/formacion-diagnosticos.types'

type DbRow = {
  id: string | number
  intent: string
  nombre: string
  empresa: string
  email: string
  telefono: string | null
  trabajadores: string
  funcion: string
  uso_ia: string
  credito_fundae: string
  objetivo: string
  consentimiento: boolean
  created_at: Date | string
}

function mapRow(row: DbRow): FormacionDiagnosticoRow {
  const created =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString()
  return {
    id: Number(row.id),
    intent: (row.intent === 'fundae' ? 'fundae' : 'diagnostico') as FormacionIntent,
    nombre: String(row.nombre || '').trim(),
    empresa: String(row.empresa || '').trim(),
    email: String(row.email || '').trim(),
    telefono: row.telefono != null ? String(row.telefono).trim() || null : null,
    trabajadores: String(row.trabajadores || ''),
    funcion: String(row.funcion || ''),
    uso_ia: String(row.uso_ia || ''),
    credito_fundae: String(row.credito_fundae || ''),
    objetivo: String(row.objetivo || ''),
    consentimiento: Boolean(row.consentimiento),
    created_at: created,
  }
}

export async function isFormacionDiagnosticosAvailable(): Promise<boolean> {
  try {
    await queryChat(`SELECT 1 FROM formacion_diagnosticos LIMIT 1`)
    return true
  } catch {
    return false
  }
}

export async function listFormacionDiagnosticos(
  period: string,
  limit = 200
): Promise<FormacionDiagnosticoRow[]> {
  if (!(await isFormacionDiagnosticosAvailable())) return []

  try {
    const { rows } = await queryChat<DbRow>(
      `SELECT id, intent, nombre, empresa, email, telefono, trabajadores, funcion,
              uso_ia, credito_fundae, objetivo, consentimiento, created_at
         FROM formacion_diagnosticos
        ORDER BY created_at DESC
        LIMIT $1`,
      [Math.max(limit * 3, 500)]
    )
    return rows
      .map(mapRow)
      .filter((r) => inWebFormPeriod(r.created_at, period))
      .slice(0, limit)
  } catch (err) {
    console.error('[formacion_diagnosticos] list', err)
    return []
  }
}

/** Respuestas recientes (p.ej. para alertas del dashboard). */
export async function listRecentFormacionDiagnosticos(
  withinDays = 3,
  limit = 30
): Promise<FormacionDiagnosticoRow[]> {
  if (!(await isFormacionDiagnosticosAvailable())) return []
  try {
    const { rows } = await queryChat<DbRow>(
      `SELECT id, intent, nombre, empresa, email, telefono, trabajadores, funcion,
              uso_ia, credito_fundae, objetivo, consentimiento, created_at
         FROM formacion_diagnosticos
        WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
        ORDER BY created_at DESC
        LIMIT $2`,
      [withinDays, limit]
    )
    return rows.map(mapRow)
  } catch (err) {
    console.error('[formacion_diagnosticos] recent', err)
    return []
  }
}

export async function countFormacionDiagnosticosToday(): Promise<number> {
  if (!(await isFormacionDiagnosticosAvailable())) return 0
  try {
    const { rows } = await queryChat<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM formacion_diagnosticos
        WHERE created_at::date = CURRENT_DATE`
    )
    return parseInt(rows[0]?.count || '0', 10)
  } catch {
    return 0
  }
}
