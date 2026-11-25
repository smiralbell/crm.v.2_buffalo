import { z } from 'zod'
import { getPool } from '@/lib/db'
import {
  PLAN_CHANNELS,
  PLAN_FORMATS,
  PLAN_PILLARS,
  PLAN_SECTORS,
  PLAN_STATUSES,
  type PlanGoals,
  type PlanItem,
  type PlanMonth,
} from '@/lib/marketing/plan.types'

/*
 * Planificación de marketing. Dos tablas NUEVAS (no tocan nada existente):
 *   marketing_plan_items  → cada pieza del calendario
 *   marketing_plan_goals  → objetivos de cada mes
 * Mismo SQL en prisma/CREATE_MARKETING_PLAN.sql. Idempotente: el CRM también las crea
 * la primera vez que alguien abre Planificación (CREATE TABLE IF NOT EXISTS).
 */

const SQL_CREATE = `
CREATE TABLE IF NOT EXISTS marketing_plan_items (
  id           SERIAL PRIMARY KEY,
  fecha        DATE NOT NULL,
  titulo       TEXT NOT NULL,
  formato      TEXT NOT NULL DEFAULT 'post',
  canal        TEXT NOT NULL DEFAULT 'instagram',
  pilar        TEXT,
  sector       TEXT,
  estado       TEXT NOT NULL DEFAULT 'idea',
  responsable  TEXT,
  enlace       TEXT,
  notas        TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_plan_items_fecha ON marketing_plan_items (fecha);
CREATE TABLE IF NOT EXISTS marketing_plan_goals (
  period              TEXT PRIMARY KEY,
  piezas_objetivo     INTEGER,
  reuniones_objetivo  INTEGER,
  clientes_objetivo   INTEGER,
  notas               TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`

let ensured: Promise<void> | null = null

export function ensureMarketingPlanTables(): Promise<void> {
  if (!ensured) {
    ensured = getPool()
      .query(SQL_CREATE)
      .then(() => undefined)
      .catch((e) => {
        ensured = null
        throw e
      })
  }
  return ensured
}

/** Solo lectura: ¿existen ya las tablas? (el Panel general no las crea) */
export async function marketingPlanTablesExist(): Promise<boolean> {
  const { rows } = await getPool().query<{ ok: boolean }>(
    `SELECT to_regclass('public.marketing_plan_items') IS NOT NULL AS ok`
  )
  return !!rows[0]?.ok
}

// ——— Validación ———

const ids = <T extends readonly { id: string }[]>(list: T) =>
  list.map((x) => x.id) as unknown as [T[number]['id'], ...T[number]['id'][]]

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))

export const planItemInput = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  titulo: z.string().trim().min(1, 'El título es obligatorio').max(300),
  formato: z.enum(ids(PLAN_FORMATS)),
  canal: z.enum(ids(PLAN_CHANNELS)),
  pilar: z.enum(ids(PLAN_PILLARS)).nullable().optional(),
  sector: z.enum(ids(PLAN_SECTORS)).nullable().optional(),
  estado: z.enum(ids(PLAN_STATUSES)).default('idea'),
  responsable: optText(120),
  enlace: optText(1000),
  notas: optText(5000),
})
export type PlanItemInput = z.infer<typeof planItemInput>

export const planItemPatch = planItemInput.partial()

export const planGoalsInput = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  piezas_objetivo: z.number().int().min(0).max(1000).nullable().optional(),
  reuniones_objetivo: z.number().int().min(0).max(1000).nullable().optional(),
  clientes_objetivo: z.number().int().min(0).max(1000).nullable().optional(),
  notas: optText(2000),
})

// ——— Lectura ———

const ITEM_COLS = `id, to_char(fecha, 'YYYY-MM-DD') AS fecha, titulo, formato, canal, pilar, sector, estado,
  responsable, enlace, notas, created_by, created_at::text AS created_at, updated_at::text AS updated_at`

function monthBounds(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` }
}

function emptyGoals(period: string): PlanGoals {
  return { period, piezas_objetivo: null, reuniones_objetivo: null, clientes_objetivo: null, notas: null }
}

/** Lectura del mes. Si las tablas no existen devuelve ready=false sin crearlas. */
export async function getPlanMonth(period: string, opts: { create?: boolean } = {}): Promise<PlanMonth> {
  if (opts.create) await ensureMarketingPlanTables()
  else if (!(await marketingPlanTablesExist())) {
    return { period, items: [], goals: emptyGoals(period), ready: false }
  }
  const { from, to } = monthBounds(period)
  const pool = getPool()
  const [items, goals] = await Promise.all([
    pool.query<PlanItem>(
      `SELECT ${ITEM_COLS} FROM marketing_plan_items WHERE fecha BETWEEN $1 AND $2 ORDER BY fecha, id`,
      [from, to]
    ),
    pool.query<PlanGoals>(
      `SELECT period, piezas_objetivo, reuniones_objetivo, clientes_objetivo, notas
       FROM marketing_plan_goals WHERE period = $1`,
      [period]
    ),
  ])
  return { period, items: items.rows, goals: goals.rows[0] ?? emptyGoals(period), ready: true }
}

// ——— Escritura (solo sobre las tablas de planificación) ———

export async function createPlanItem(input: PlanItemInput, by: string | null): Promise<PlanItem> {
  await ensureMarketingPlanTables()
  const { rows } = await getPool().query<PlanItem>(
    `INSERT INTO marketing_plan_items
       (fecha, titulo, formato, canal, pilar, sector, estado, responsable, enlace, notas, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING ${ITEM_COLS}`,
    [
      input.fecha,
      input.titulo,
      input.formato,
      input.canal,
      input.pilar ?? null,
      input.sector ?? null,
      input.estado,
      input.responsable ?? null,
      input.enlace ?? null,
      input.notas ?? null,
      by,
    ]
  )
  return rows[0]
}

const PATCHABLE = [
  'fecha',
  'titulo',
  'formato',
  'canal',
  'pilar',
  'sector',
  'estado',
  'responsable',
  'enlace',
  'notas',
] as const

export async function updatePlanItem(id: number, patch: z.infer<typeof planItemPatch>): Promise<PlanItem | null> {
  await ensureMarketingPlanTables()
  const sets: string[] = []
  const vals: unknown[] = []
  for (const k of PATCHABLE) {
    if (k in patch) {
      vals.push((patch as Record<string, unknown>)[k] ?? null)
      sets.push(`${k} = $${vals.length}`)
    }
  }
  if (!sets.length) return null
  vals.push(id)
  const { rows } = await getPool().query<PlanItem>(
    `UPDATE marketing_plan_items SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${vals.length} RETURNING ${ITEM_COLS}`,
    vals
  )
  return rows[0] ?? null
}

/** Borra UNA pieza del calendario (solo de marketing_plan_items, por id). */
export async function deletePlanItem(id: number): Promise<boolean> {
  await ensureMarketingPlanTables()
  const { rowCount } = await getPool().query(`DELETE FROM marketing_plan_items WHERE id = $1`, [id])
  return (rowCount ?? 0) > 0
}

export async function savePlanGoals(input: z.infer<typeof planGoalsInput>): Promise<PlanGoals> {
  await ensureMarketingPlanTables()
  const { rows } = await getPool().query<PlanGoals>(
    `INSERT INTO marketing_plan_goals (period, piezas_objetivo, reuniones_objetivo, clientes_objetivo, notas, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (period) DO UPDATE SET
       piezas_objetivo = EXCLUDED.piezas_objetivo,
       reuniones_objetivo = EXCLUDED.reuniones_objetivo,
       clientes_objetivo = EXCLUDED.clientes_objetivo,
       notas = EXCLUDED.notas,
       updated_at = NOW()
     RETURNING period, piezas_objetivo, reuniones_objetivo, clientes_objetivo, notas`,
    [
      input.period,
      input.piezas_objetivo ?? null,
      input.reuniones_objetivo ?? null,
      input.clientes_objetivo ?? null,
      input.notas ?? null,
    ]
  )
  return rows[0]
}
