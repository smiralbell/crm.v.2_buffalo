import { prisma } from '@/lib/prisma'
import { normalizeSubtasks } from '@/lib/subtasks'

let columnEnsured = false

/** Crea la columna `subtasks` si aún no existe (mismo patrón que el checklist). */
export async function ensureProjectTaskSubtasksColumn(): Promise<void> {
  if (columnEnsured) return
  await prisma.$executeRawUnsafe(
    `ALTER TABLE project_dev_tasks ADD COLUMN IF NOT EXISTS subtasks JSONB NOT NULL DEFAULT '[]'::jsonb`
  )
  columnEnsured = true
}

/** Guarda la lista completa de subtareas y devuelve la fila actualizada. */
export async function saveProjectTaskSubtasks(
  projectId: string,
  taskId: string,
  subtasks: unknown
): Promise<Record<string, unknown> | null> {
  await ensureProjectTaskSubtasksColumn()
  const json = JSON.stringify(normalizeSubtasks(subtasks))
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE project_dev_tasks SET
      subtasks = ${json}::jsonb,
      updated_at = NOW()
    WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
    RETURNING *
  `
  return rows[0] ?? null
}
