import { prisma } from '@/lib/prisma'
import { ensureChecklistSchema } from '@/lib/checklist/store'
import { CHECKLIST_COLUMNS, type ChecklistColumnId } from '@/lib/checklist/types'
import {
  planChecklistImport,
  suggestOwners,
  taskFromChecklistItem,
  type ImportMap,
  type ImportUser,
  type ImportableItem,
} from '@/lib/checklist/to-tareas'
import { listCrmUsers } from '@/lib/crm-users'
import { createPersonalTask } from '@/lib/tareas/store'

/**
 * Pasa lo del Checklist a Tareas (tareas sueltas de cada persona). Lo que se
 * pasa no se borra: se marca (imported_at / imported_task_id) y deja de verse y
 * de recordarse en el Checklist. Se puede repetir sin duplicar.
 */

type Row = ImportableItem & { imported_at: Date | null }

async function loadItems(): Promise<Row[]> {
  await ensureChecklistSchema()
  return prisma.$queryRaw<Row[]>`
    SELECT id, title, done, column_key, subtasks, imported_at
      FROM crm_checklist_items
     ORDER BY column_key ASC, position ASC, id ASC
  `
}

async function importUsers(): Promise<ImportUser[]> {
  const users = await listCrmUsers()
  return users
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }))
    .sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.name.localeCompare(b.name, 'es'))
}

export type ChecklistImportPreview = {
  columns: { id: ChecklistColumnId; label: string; pending: number; done: number; imported: number }[]
  users: ImportUser[]
  suggested: ImportMap
}

export async function getChecklistImportPreview(): Promise<ChecklistImportPreview> {
  const [items, users] = await Promise.all([loadItems(), importUsers()])
  const columns = CHECKLIST_COLUMNS.map((c) => {
    const mine = items.filter((i) => i.column_key === c.id)
    const open = mine.filter((i) => !i.imported_at)
    return {
      id: c.id,
      label: c.label,
      pending: open.filter((i) => !i.done).length,
      done: open.filter((i) => i.done).length,
      imported: mine.length - open.length,
    }
  })
  return { columns, users, suggested: suggestOwners(users) }
}

export type ChecklistImportResult = {
  created: number
  byUser: { id: number; name: string; count: number }[]
  skippedDone: number
  skippedUnassigned: number
  failed: { title: string; error: string }[]
}

export async function importChecklistToTareas(input: {
  map: ImportMap
  includeDone: boolean
  actor: { id: number; name: string }
}): Promise<ChecklistImportResult> {
  const users = await importUsers()
  const byId = new Map(users.map((u) => [u.id, u]))
  for (const id of Object.values(input.map)) {
    if (id != null && !byId.has(id)) throw new Error('Uno de los usuarios elegidos no existe o está desactivado')
  }

  const items = (await loadItems()).filter((i) => !i.imported_at)
  const plan = planChecklistImport(items, input.map, input.includeDone)
  const result: ChecklistImportResult = {
    created: 0,
    byUser: [],
    skippedDone: plan.skippedDone,
    skippedUnassigned: plan.skippedUnassigned,
    failed: [],
  }
  const counts = new Map<number, number>()

  for (const { item, ownerId } of plan.create) {
    // Se reserva antes de crear la tarea: si alguien pulsa dos veces, no se duplica
    const claimed = await prisma.$executeRaw`
      UPDATE crm_checklist_items SET imported_at = NOW()
       WHERE id = ${item.id} AND imported_at IS NULL
    `
    if (!claimed) continue
    try {
      const fields = taskFromChecklistItem(item)
      const task = await createPersonalTask({
        user_id: ownerId,
        title: fields.title,
        description: fields.description,
        status: fields.status,
        subtasks: fields.subtasks,
        created_by_id: input.actor.id > 0 ? input.actor.id : null,
        created_by_name: input.actor.name,
      })
      await prisma.$executeRaw`
        UPDATE crm_checklist_items SET imported_task_id = ${String(task.id)} WHERE id = ${item.id}
      `
      result.created += 1
      counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1)
    } catch (e) {
      await prisma.$executeRaw`UPDATE crm_checklist_items SET imported_at = NULL WHERE id = ${item.id}`
      result.failed.push({ title: item.title, error: e instanceof Error ? e.message : 'Error' })
    }
  }

  result.byUser = Array.from(counts.entries()).map(([id, count]) => ({ id, name: byId.get(id)?.name ?? `#${id}`, count }))
  return result
}
