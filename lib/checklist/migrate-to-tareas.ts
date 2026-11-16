import { prisma } from '@/lib/prisma'
import { listCrmUsers } from '@/lib/crm-users'
import { sendOpsAlert } from '@/lib/ops-alerts'
import { createPersonalTask } from '@/lib/tareas/store'
import { findSocio, ownersForColumn, taskFromChecklistItem, type ChecklistRow } from '@/lib/checklist/to-tareas'

/**
 * Pasa el antiguo Checklist a Tareas, una sola vez, en el servidor donde corre
 * el CRM. Espera a que Santi y Sergi existan en Usuarios (rol admin); hasta
 * entonces lo vuelve a intentar cada cierto tiempo. La tabla crm_checklist_items
 * no se borra: cada fila pasada queda marcada (imported_at / imported_task_id).
 */

export type ChecklistMigrationResult =
  | { status: 'no_table' | 'nothing' }
  | { status: 'waiting_socios'; missing: string[] }
  | { status: 'done'; created: number; byUser: Record<string, number>; failed: number }

export async function migrateChecklistToTareas(): Promise<ChecklistMigrationResult> {
  const exists = await prisma.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('public.crm_checklist_items')::text AS t`
  if (!exists[0]?.t) return { status: 'no_table' }

  await prisma.$executeRawUnsafe(`ALTER TABLE crm_checklist_items ADD COLUMN IF NOT EXISTS imported_task_id TEXT`)
  await prisma.$executeRawUnsafe(`ALTER TABLE crm_checklist_items ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ`)
  await prisma.$executeRawUnsafe(
    `ALTER TABLE crm_checklist_items ADD COLUMN IF NOT EXISTS subtasks JSONB NOT NULL DEFAULT '[]'::jsonb`
  )

  const rows = await prisma.$queryRaw<ChecklistRow[]>`
    SELECT id, title, done, column_key, subtasks
      FROM crm_checklist_items
     WHERE imported_at IS NULL
     ORDER BY column_key ASC, position ASC, id ASC
  `
  if (!rows.length) return { status: 'nothing' }

  const users = (await listCrmUsers()).filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, role: u.role }))
  const santi = findSocio(users, 'santi')
  const sergi = findSocio(users, 'sergi')
  if (!santi || !sergi) {
    return { status: 'waiting_socios', missing: [!santi && 'Santi', !sergi && 'Sergi'].filter(Boolean) as string[] }
  }
  const names = new Map(users.map((u) => [u.id, u.name]))

  const byUser: Record<string, number> = {}
  let created = 0
  let failed = 0
  for (const row of rows) {
    // Reservar la fila: si dos procesos arrancan a la vez, solo uno la pasa
    const claimed = await prisma.$executeRaw`
      UPDATE crm_checklist_items SET imported_at = NOW() WHERE id = ${row.id} AND imported_at IS NULL
    `
    if (!claimed) continue
    const fields = taskFromChecklistItem(row)
    const ids: string[] = []
    try {
      for (const owner of ownersForColumn(row.column_key, { santi, sergi })) {
        const task = await createPersonalTask({
          user_id: owner,
          title: fields.title,
          description: fields.description,
          status: fields.status,
          subtasks: fields.subtasks,
          created_by_id: null,
          created_by_name: 'Checklist',
        })
        ids.push(String(task.id))
        const name = names.get(owner) ?? `#${owner}`
        byUser[name] = (byUser[name] ?? 0) + 1
        created += 1
      }
      await prisma.$executeRaw`UPDATE crm_checklist_items SET imported_task_id = ${ids.join(',')} WHERE id = ${row.id}`
    } catch (e) {
      failed += 1
      console.warn('[checklist→tareas]', row.id, e instanceof Error ? e.message : e)
      // Si no se creó ninguna copia, se libera para el siguiente intento
      if (!ids.length) {
        await prisma.$executeRaw`UPDATE crm_checklist_items SET imported_at = NULL WHERE id = ${row.id}`
      } else {
        await prisma.$executeRaw`UPDATE crm_checklist_items SET imported_task_id = ${ids.join(',')} WHERE id = ${row.id}`
      }
    }
  }
  return { status: 'done', created, byUser, failed }
}

declare global {
  // eslint-disable-next-line no-var
  var __buffaloChecklistMigration: { finished: boolean; lastTry: number; running: boolean } | undefined
}

const RETRY_MS = 10 * 60_000

/** Se llama al arrancar y con cada carga del CRM; trabaja como mucho cada 10 minutos hasta terminar. */
export function startChecklistMigration(): void {
  const g = (globalThis.__buffaloChecklistMigration ??= { finished: false, lastTry: 0, running: false })
  if (g.finished || g.running || Date.now() - g.lastTry < RETRY_MS) return
  g.running = true
  g.lastTry = Date.now()
  void migrateChecklistToTareas()
    .then(async (r) => {
      if (r.status === 'waiting_socios') {
        console.log(`[checklist→tareas] esperando a que existan en Usuarios: ${r.missing.join(' y ')}`)
        return
      }
      g.finished = r.status !== 'done' || r.failed === 0
      if (r.status !== 'done' || r.created === 0) return
      const detail = Object.entries(r.byUser)
        .map(([name, n]) => `${name}: ${n}`)
        .join(' · ')
      console.log(`[checklist→tareas] ${r.created} tareas creadas (${detail})`)
      await sendOpsAlert({
        subject: `Checklist pasado a Tareas: ${r.created} tareas`,
        text: `El antiguo Checklist ya está en Tareas.\n\n${detail}${
          r.failed ? `\n\nNo se pudieron pasar ${r.failed}; se reintentará en unos minutos.` : ''
        }`,
        url: '/tareas',
      }).catch(() => {})
    })
    .catch((e) => console.warn('[checklist→tareas]', e instanceof Error ? e.message : e))
    .finally(() => {
      g.running = false
    })
}
