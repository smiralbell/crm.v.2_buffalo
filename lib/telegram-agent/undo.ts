import type { PoolClient } from 'pg'
import { getPool } from '@/lib/db'

/**
 * Deshacer lo que hace el agente (borrados confirmados, cambios y altas).
 *
 * Cada acción guarda en agent_undo_log, por conversación, cómo volver atrás:
 *  - restore: filas borradas (con las que se borraron en cascada), para volver a insertarlas;
 *  - revert:  cómo estaba una fila antes de cambiarla;
 *  - remove:  una fila creada, para quitarla.
 * Las filas se guardan con to_jsonb y se recuperan con jsonb_populate_record(set),
 * así que los tipos de Postgres vuelven intactos.
 *
 * Seguridad: solo se deshace lo de la propia conversación, y un revert / remove
 * solo se aplica si la fila sigue EXACTAMENTE como la dejó el agente. Si alguien
 * la ha tocado después, no se pisa su cambio: se cancela todo y se avisa.
 */

export type UndoStep =
  | { op: 'restore'; table: string; rows: unknown[] }
  | { op: 'revert'; table: string; before: unknown; after: unknown }
  | { op: 'remove'; table: string; after: unknown }

export type UndoEntry = { id: number; label: string; created_at: string; undone: boolean }

/** Días que se puede deshacer algo. */
export const UNDO_DAYS = 7

let ensured: Promise<void> | null = null

export function ensureUndoTable(): Promise<void> {
  if (!ensured) {
    ensured = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS agent_undo_log (
           id          SERIAL PRIMARY KEY,
           chat_id     BIGINT NOT NULL,
           label       TEXT NOT NULL,
           steps       JSONB NOT NULL,
           created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           undone_at   TIMESTAMPTZ,
           result      JSONB
         );
         CREATE INDEX IF NOT EXISTS idx_agent_undo_log_chat ON agent_undo_log (chat_id, id DESC);`
      )
      .then(() => undefined)
      .catch((e) => {
        ensured = null
        throw e
      })
  }
  return ensured
}

function ident(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`identificador inválido: ${name}`)
  return `"${name}"`
}

type Queryable = Pick<PoolClient, 'query'>

/** Columnas que se pueden escribir (sin las generadas) y la clave primaria. */
async function tableInfo(c: Queryable, table: string): Promise<{ cols: string[]; pk: string[] }> {
  const r = await c.query<{ attname: string; is_pk: boolean }>(
    `SELECT a.attname,
            EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY(i.indkey)) AS is_pk
     FROM pg_attribute a
     WHERE a.attrelid = ('public.' || quote_ident($1))::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
     ORDER BY a.attnum`,
    [table]
  )
  return { cols: r.rows.map((x) => x.attname), pk: r.rows.filter((x) => x.is_pk).map((x) => x.attname) }
}

/** Foto de las filas que cumplen un filtro (el filtro usa $1, $2… de params). */
export async function snapshotWhere(c: Queryable, table: string, where: string, params: unknown[]): Promise<unknown[]> {
  const r = await c.query<{ j: unknown }>(`SELECT to_jsonb(_t) AS j FROM public.${ident(table)} _t WHERE ${where}`, params)
  return r.rows.map((x) => x.j)
}

/** Foto de una fila por su id (uuid o número). */
export async function snapshotById(table: string, id: unknown, c: Queryable = getPool()): Promise<unknown | null> {
  if (id === undefined || id === null || String(id).trim() === '') return null
  const rows = await snapshotWhere(c, table, 'id::text = $1', [String(id).trim()])
  return rows[0] ?? null
}

/**
 * Antes de un DELETE (en la misma transacción): las filas que se van a borrar y
 * las que caerían en cascada (ON DELETE CASCADE), y las que se quedarían sin
 * referencia (ON DELETE SET NULL), hasta 3 niveles. Devuelve los pasos para deshacerlo.
 */
export async function captureDelete(c: Queryable, table: string, where: string, params: unknown[], depth = 0): Promise<UndoStep[]> {
  const rows = await snapshotWhere(c, table, where, params)
  if (!rows.length) return []
  const steps: UndoStep[] = [{ op: 'restore', table, rows }]
  if (depth >= 3) return steps
  const fks = await c.query<{ child: string; child_cols: string[]; parent_cols: string[]; action: string }>(
    `SELECT ch.relname AS child,
            ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(n, o)
                  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n ORDER BY k.o) AS child_cols,
            ARRAY(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY k(n, o)
                  JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n ORDER BY k.o) AS parent_cols,
            con.confdeltype AS action
     FROM pg_constraint con
     JOIN pg_class ch ON ch.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = ch.relnamespace
     WHERE con.contype = 'f' AND n.nspname = 'public'
       AND con.confrelid = ('public.' || quote_ident($1))::regclass
       AND con.confdeltype IN ('c', 'n')`,
    [table]
  )
  for (const fk of fks.rows) {
    const childCols = fk.child_cols.map(ident).join(', ')
    const parentCols = fk.parent_cols.map(ident).join(', ')
    const childWhere = `(${childCols}) IN (SELECT ${parentCols} FROM public.${ident(table)} WHERE ${where})`
    if (fk.action === 'c') {
      steps.push(...(await captureDelete(c, fk.child, childWhere, params, depth + 1)))
    } else {
      for (const before of await snapshotWhere(c, fk.child, childWhere, params)) {
        const after = { ...(before as Record<string, unknown>) }
        for (const col of fk.child_cols) after[col] = null
        steps.push({ op: 'revert', table: fk.child, before, after })
      }
    }
  }
  return steps
}

export async function recordUndo(chatId: number, label: string, steps: UndoStep[]): Promise<number | null> {
  if (!steps.length) return null
  await ensureUndoTable()
  const r = await getPool().query<{ id: number }>(
    `INSERT INTO agent_undo_log (chat_id, label, steps) VALUES ($1, $2, $3) RETURNING id`,
    [chatId, label.slice(0, 500), JSON.stringify(steps)]
  )
  return Number(r.rows[0].id)
}

export async function listUndo(chatId: number, limit = 10): Promise<UndoEntry[]> {
  await ensureUndoTable()
  const r = await getPool().query(
    `SELECT id, label, created_at, undone_at FROM agent_undo_log
     WHERE chat_id = $1 AND created_at > NOW() - ($2 || ' days')::interval
     ORDER BY id DESC LIMIT $3`,
    [chatId, String(UNDO_DAYS), limit]
  )
  return r.rows.map((x) => ({
    id: Number(x.id),
    label: String(x.label),
    created_at: new Date(x.created_at).toISOString(),
    undone: x.undone_at != null,
  }))
}

async function applyStep(c: PoolClient, step: UndoStep): Promise<string | null> {
  const t = `public.${ident(step.table)}`
  const { cols, pk } = await tableInfo(c, step.table)
  const colList = cols.map(ident).join(', ')
  if (step.op === 'restore') {
    const r = await c.query(
      `INSERT INTO ${t} (${colList}) OVERRIDING SYSTEM VALUE
       SELECT ${colList} FROM jsonb_populate_recordset(NULL::${t}, $1::jsonb)
       ON CONFLICT DO NOTHING`,
      [JSON.stringify(step.rows)]
    )
    if ((r.rowCount || 0) < step.rows.length) return `ya había ${step.rows.length - (r.rowCount || 0)} fila(s) en ${step.table}`
    return null
  }
  if (!pk.length) return `${step.table} no tiene clave primaria`
  const pkList = pk.map(ident).join(', ')
  if (step.op === 'revert') {
    const r = await c.query(
      `UPDATE ${t} _t SET (${colList}) = (SELECT ${colList} FROM jsonb_populate_record(NULL::${t}, $1::jsonb))
       WHERE (${pk.map((k) => `_t.${ident(k)}`).join(', ')}) = (SELECT ${pkList} FROM jsonb_populate_record(NULL::${t}, $1::jsonb))
         AND to_jsonb(_t) = $2::jsonb`,
      [JSON.stringify(step.before), JSON.stringify(step.after)]
    )
    return r.rowCount ? null : `alguien ha cambiado ${step.table} después`
  }
  const r = await c.query(
    `DELETE FROM ${t} _t
     WHERE (${pk.map((k) => `_t.${ident(k)}`).join(', ')}) = (SELECT ${pkList} FROM jsonb_populate_record(NULL::${t}, $1::jsonb))
       AND to_jsonb(_t) = $1::jsonb`,
    [JSON.stringify(step.after)]
  )
  return r.rowCount ? null : `alguien ha cambiado ${step.table} después`
}

/**
 * Deshace una acción de esta conversación (la última si no se dice cuál).
 * Todo o nada: si un paso no se puede aplicar, no se cambia nada.
 */
export async function undoAction(
  chatId: number,
  id?: number
): Promise<{ ok: true; deshecho: string } | { ok: false; error: string }> {
  await ensureUndoTable()
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const r = await client.query(
      `SELECT id, label, steps, undone_at FROM agent_undo_log
       WHERE chat_id = $1 AND ($2::int IS NULL OR id = $2)
         AND created_at > NOW() - ($3 || ' days')::interval
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [chatId, id ?? null, String(UNDO_DAYS)]
    )
    const entry = r.rows[0]
    if (!entry) {
      await client.query('ROLLBACK')
      return { ok: false, error: id ? 'No hay ningún cambio con ese número para deshacer.' : 'No hay nada reciente que deshacer.' }
    }
    if (entry.undone_at) {
      await client.query('ROLLBACK')
      return { ok: false, error: `«${entry.label}» ya estaba deshecho.` }
    }
    await client.query(`SET LOCAL statement_timeout = 25000`)
    // Primero se quita lo creado; luego vuelven las filas borradas (el padre antes que
    // sus hijas, en el orden en que se apuntaron) y al final se restauran los cambios.
    const steps = entry.steps as UndoStep[]
    const ordered = [
      ...steps.filter((s) => s.op === 'remove').reverse(),
      ...steps.filter((s) => s.op === 'restore'),
      ...steps.filter((s) => s.op === 'revert').reverse(),
    ]
    for (const step of ordered) {
      const problem = await applyStep(client, step)
      if (problem) {
        await client.query('ROLLBACK')
        return { ok: false, error: `No se ha deshecho nada: ${problem}.` }
      }
    }
    await client.query(`UPDATE agent_undo_log SET undone_at = NOW(), result = $2 WHERE id = $1`, [
      entry.id,
      JSON.stringify({ ok: true }),
    ])
    await client.query('COMMIT')
    return { ok: true, deshecho: String(entry.label) }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    return { ok: false, error: `No se ha deshecho nada: ${e instanceof Error ? e.message : String(e)}` }
  } finally {
    client.release()
  }
}

// ——— Cambios que hacen las herramientas del agente ———

const TASK_TABLES = ['crm_user_tasks', 'project_dev_tasks']

type UndoSpec =
  | { kind: 'update'; tables: string[]; label: string }
  | { kind: 'create'; tables: string[]; label: string; createdId: (result: Record<string, unknown>) => unknown }
  | { kind: 'delete'; tables: string[]; label: string }

const pick = (path: string[]) => (r: Record<string, unknown>) =>
  path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), r)

/** Herramientas (de los dos agentes) que se pueden deshacer, y cómo. */
const UNDOABLE: Record<string, UndoSpec> = {
  tarea_crear: { kind: 'create', tables: TASK_TABLES, label: 'Crear la tarea', createdId: pick(['creada', 'id']) },
  tareas_crear: { kind: 'create', tables: TASK_TABLES, label: 'Crear la tarea', createdId: pick(['creada', 'id']) },
  tarea_editar: { kind: 'update', tables: TASK_TABLES, label: 'Cambiar la tarea' },
  tareas_editar: { kind: 'update', tables: TASK_TABLES, label: 'Cambiar la tarea' },
  tarea_mover: { kind: 'update', tables: TASK_TABLES, label: 'Mover la tarea' },
  tareas_mover: { kind: 'update', tables: TASK_TABLES, label: 'Mover la tarea' },
  tarea_subtareas: { kind: 'update', tables: TASK_TABLES, label: 'Cambiar las subtareas' },
  tareas_subtareas: { kind: 'update', tables: TASK_TABLES, label: 'Cambiar las subtareas' },
  instruccion_guardar: {
    kind: 'create',
    tables: ['agent_personal_instructions'],
    label: 'Guardar la preferencia',
    createdId: pick(['instruccion', 'id']),
  },
  instruccion_cambiar: { kind: 'update', tables: ['agent_personal_instructions'], label: 'Cambiar la preferencia' },
  instruccion_quitar: { kind: 'delete', tables: ['agent_personal_instructions'], label: 'Quitar la preferencia' },
  avisos_programar: { kind: 'create', tables: ['telegram_agent_reminders'], label: 'Programar el aviso', createdId: pick(['aviso', 'id']) },
  avisos_cambiar: { kind: 'update', tables: ['telegram_agent_reminders'], label: 'Cambiar el aviso' },
  avisos_pausar: { kind: 'update', tables: ['telegram_agent_reminders'], label: 'Pausar o reactivar el aviso' },
  incidencia_resolver: { kind: 'update', tables: ['retencion_incidents'], label: 'Marcar la incidencia como solucionada' },
}

export function isUndoable(tool: string): boolean {
  return tool in UNDOABLE
}

async function findSnapshot(tables: string[], id: unknown): Promise<{ table: string; row: unknown } | null> {
  for (const table of tables) {
    const row = await snapshotById(table, id).catch(() => null)
    if (row) return { table, row }
  }
  return null
}

function describeFrom(spec: UndoSpec, args: Record<string, unknown>, row: unknown): string {
  const r = (row || {}) as Record<string, unknown>
  const name = r.title ?? r.texto ?? r.error_text ?? args.titulo ?? args.texto
  return name ? `${spec.label} «${String(name).slice(0, 80)}»` : spec.label
}

/**
 * Ejecuta una herramienta y, si va bien y se puede deshacer, apunta cómo.
 * Devuelve el resultado con `deshacer` si quedó apuntado.
 */
export async function runWithUndo(
  chatId: number,
  tool: string,
  args: Record<string, unknown>,
  run: () => Promise<unknown>
): Promise<unknown> {
  const spec = UNDOABLE[tool]
  if (!spec) return run()
  const before = spec.kind === 'create' ? null : await findSnapshot(spec.tables, args.id)
  const result = await run()
  const res = result as Record<string, unknown> | null
  if (!res || typeof res !== 'object' || res.ok === false) return result
  try {
    let steps: UndoStep[] = []
    let label = spec.label
    if (spec.kind === 'create') {
      const found = await findSnapshot(spec.tables, spec.createdId(res))
      if (found) {
        steps = [{ op: 'remove', table: found.table, after: found.row }]
        label = describeFrom(spec, args, found.row)
      }
    } else if (before) {
      label = describeFrom(spec, args, before.row)
      if (spec.kind === 'delete') {
        steps = [{ op: 'restore', table: before.table, rows: [before.row] }]
      } else {
        const after = await snapshotById(before.table, args.id)
        if (after && JSON.stringify(after) !== JSON.stringify(before.row)) {
          steps = [{ op: 'revert', table: before.table, before: before.row, after }]
        }
      }
    }
    const undoId = await recordUndo(chatId, label, steps)
    return undoId ? { ...res, deshacer: `Se puede deshacer (cambio #${undoId}).` } : result
  } catch (e) {
    console.warn('[agent-undo]', tool, e instanceof Error ? e.message : e)
    return result
  }
}

export const UNDO_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'deshacer',
      description:
        'Deshace un cambio que ha hecho el agente en esta conversación: un borrado confirmado, una tarea creada o cambiada, un aviso, una preferencia… Sin id, el último. Con listar=true, enseña los últimos cambios que se pueden deshacer. Solo si la persona lo pide («deshaz eso», «vuelve atrás», «me he equivocado»).',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number' }, listar: { type: 'boolean' } },
        required: [],
      },
    },
  },
]

/** «deshacer», «deshazlo», «/deshacer»: se atiende sin pasar por la IA. */
export function isUndoRequest(text: string): boolean {
  return /^\/?(deshacer|deshaz(lo| eso)?|vuelve atr[aá]s)[.!]*$/i.test(text.trim())
}

/** Texto de respuesta a un «deshacer» directo. */
export async function undoLastReply(chatId: number): Promise<string> {
  const res = await undoAction(chatId)
  return res.ok ? `Deshecho: ${res.deshecho}.` : res.error
}

export async function runUndoTool(chatId: number, args: Record<string, unknown>): Promise<unknown> {
  if (args.listar === true) {
    const list = await listUndo(chatId)
    return { ok: true, cambios: list.map((e) => ({ id: e.id, que: e.label, cuando: e.created_at, deshecho: e.undone })) }
  }
  const id = args.id === undefined || args.id === null || args.id === '' ? undefined : Number(args.id)
  return undoAction(chatId, Number.isInteger(id) ? id : undefined)
}
