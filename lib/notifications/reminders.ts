import { getPool } from '@/lib/db'
import { notify } from './notify'

/**
 * Recordatorios que se repiten hasta que la cosa se resuelve: una incidencia
 * (cada 6 h), un ticket (cada día) o una tarea que alguien ha pedido que se le
 * recuerde cada X horas. Cada recordatorio es de UNA cosa concreta, así que cada
 * ticket o incidencia tiene su propio aviso.
 *
 * Al revisar, si la cosa ya está resuelta (o caducó el plazo), el recordatorio se apaga.
 * Lo que sale es un aviso normal: el dueño puede apagarlo como cualquier otro
 * desde su chat («no me recuerdes los tickets»).
 */

export type ReminderEntity = 'incidencia' | 'ticket' | 'tarea_proyecto' | 'tarea_personal'

export interface ReminderSpec {
  /** Clave del aviso (rules.ts): decide a quién, por dónde y si está activo. */
  event: string
  entityType: ReminderEntity
  entityId: string | number
  title: string
  url: string
  everyHours: number
  /** Hasta cuándo se recuerda. null = hasta que se resuelva. */
  until?: Date | null
  /** Equipo: a quién le llega. null = los socios (todos). */
  userIds?: number[] | null
}

let ensured: Promise<void> | null = null

export function ensureReminderTable(): Promise<void> {
  if (!ensured) {
    ensured = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS notification_reminders (
           id           BIGSERIAL PRIMARY KEY,
           dedupe_key   TEXT NOT NULL UNIQUE,
           event        TEXT NOT NULL,
           entity_type  TEXT NOT NULL,
           entity_id    TEXT NOT NULL,
           title        TEXT NOT NULL,
           url          TEXT,
           every_hours  INTEGER NOT NULL,
           user_ids     INTEGER[],
           until_at     TIMESTAMPTZ,
           next_at      TIMESTAMPTZ NOT NULL,
           active       BOOLEAN NOT NULL DEFAULT TRUE,
           created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
         );
         CREATE INDEX IF NOT EXISTS idx_notification_reminders_due ON notification_reminders (active, next_at);`
      )
      .then(() => undefined)
      .catch((e) => {
        ensured = null
        throw e
      })
  }
  return ensured
}

/** Crea el recordatorio, o no hace nada si ya existe para esa misma cosa y destinatario. */
export async function scheduleReminder(spec: ReminderSpec, now = new Date()): Promise<void> {
  await ensureReminderTable()
  const who = (spec.userIds ?? []).slice().sort((a, b) => a - b).join(',') || 'socios'
  const dedupe = `${spec.event}:${spec.entityType}:${spec.entityId}:${who}`
  const every = Math.max(1, Math.round(spec.everyHours))
  await getPool().query(
    `INSERT INTO notification_reminders (dedupe_key, event, entity_type, entity_id, title, url, every_hours, user_ids, until_at, next_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      dedupe,
      spec.event,
      spec.entityType,
      String(spec.entityId),
      spec.title.slice(0, 300),
      spec.url,
      every,
      spec.userIds && spec.userIds.length ? spec.userIds : null,
      spec.until ?? null,
      new Date(now.getTime() + every * 60 * 60_000),
    ]
  )
}

/** Apaga los recordatorios de una cosa (p. ej. el de los socios cuando el ticket ya tiene dueño). */
export async function cancelReminders(event: string, entityType: ReminderEntity, entityId: string | number): Promise<void> {
  await ensureReminderTable()
  await getPool().query(
    `UPDATE notification_reminders SET active = FALSE WHERE event = $1 AND entity_type = $2 AND entity_id = $3`,
    [event, entityType, String(entityId)]
  )
}

/** ¿Sigue abierta la cosa? Si no existe o ya está resuelta, no hay que recordarla. */
export async function isStillOpen(entityType: ReminderEntity, entityId: string): Promise<boolean> {
  const pool = getPool()
  const q = {
    incidencia: `SELECT status FROM retencion_incidents WHERE id = $1::bigint`,
    ticket: `SELECT status FROM tickets WHERE id = $1::uuid`,
    tarea_proyecto: `SELECT status FROM project_dev_tasks WHERE id = $1::uuid`,
    tarea_personal: `SELECT status FROM crm_user_tasks WHERE id = $1::uuid`,
  }[entityType]
  const r = await pool.query<{ status: string }>(q, [entityId]).catch(() => ({ rows: [] as { status: string }[] }))
  const row = r.rows[0]
  if (!row) return false
  if (entityType === 'incidencia') return row.status === 'open'
  if (entityType === 'ticket') return row.status === 'open' || row.status === 'in_progress'
  return row.status !== 'done'
}

/** Revisa los recordatorios vencidos: los que siguen abiertos salen y se reprograman; el resto se apaga. */
export async function tickReminders(now = new Date()): Promise<number> {
  await ensureReminderTable()
  const pool = getPool()
  const due = await pool.query<{
    id: number
    event: string
    entity_type: ReminderEntity
    entity_id: string
    title: string
    url: string | null
    every_hours: number
    user_ids: number[] | null
    until_at: Date | null
  }>(
    `SELECT id, event, entity_type, entity_id, title, url, every_hours, user_ids, until_at
       FROM notification_reminders
      WHERE active AND next_at <= $1
      ORDER BY next_at ASC
      LIMIT 50`,
    [now]
  )
  let sent = 0
  for (const r of due.rows) {
    const expired = r.until_at !== null && r.until_at.getTime() < now.getTime()
    const open = expired ? false : await isStillOpen(r.entity_type, r.entity_id)
    if (!open) {
      await pool.query(`UPDATE notification_reminders SET active = FALSE WHERE id = $1`, [r.id])
      continue
    }
    await notify({
      event: r.event,
      subject: r.title,
      text: `${r.title}\n\nSigue sin resolver. Abrir: ${r.url ?? ''}`,
      url: r.url ?? undefined,
      userIds: r.user_ids ?? undefined,
      dedupeKey: `${r.event}:${r.entity_id}:${now.toISOString().slice(0, 13)}`,
    })
    sent++
    await pool.query(`UPDATE notification_reminders SET next_at = $2 WHERE id = $1`, [
      r.id,
      new Date(now.getTime() + r.every_hours * 60 * 60_000),
    ])
  }
  return sent
}
