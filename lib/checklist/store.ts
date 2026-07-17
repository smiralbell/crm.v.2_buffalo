import { prisma } from '@/lib/prisma'
import {
  isChecklistColumnId,
  type ChecklistColumnId,
  type ChecklistItem,
} from '@/lib/checklist/types'

type Row = {
  id: number
  title: string
  done: boolean
  column_key: string
  position: number
  created_at: Date
  updated_at: Date
  completed_at: Date | null
}

function mapRow(r: Row): ChecklistItem {
  return {
    id: r.id,
    title: r.title,
    done: r.done,
    column_key: isChecklistColumnId(r.column_key) ? r.column_key : 'inbox',
    position: r.position,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
    completed_at: r.completed_at ? r.completed_at.toISOString() : null,
  }
}

export async function listChecklistItems(): Promise<ChecklistItem[]> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, title, done, column_key, position, created_at, updated_at, completed_at
    FROM crm_checklist_items
    ORDER BY column_key ASC, position ASC, id ASC
  `
  return rows.map(mapRow)
}

export async function createChecklistItem(input: {
  title: string
  column_key?: ChecklistColumnId
  createdByUserId?: number | null
}): Promise<ChecklistItem> {
  const title = input.title.trim()
  if (!title) throw new Error('El título es obligatorio')
  const column = input.column_key && isChecklistColumnId(input.column_key) ? input.column_key : 'inbox'

  const posRows = await prisma.$queryRaw<{ next: number }[]>`
    SELECT COALESCE(MAX(position), -1) + 1 AS next
    FROM crm_checklist_items
    WHERE column_key = ${column}
  `
  const position = Number(posRows[0]?.next ?? 0)

  const rows = await prisma.$queryRaw<Row[]>`
    INSERT INTO crm_checklist_items (title, column_key, position, created_by_user_id)
    VALUES (${title}, ${column}, ${position}, ${input.createdByUserId ?? null})
    RETURNING id, title, done, column_key, position, created_at, updated_at, completed_at
  `
  return mapRow(rows[0])
}

export async function updateChecklistItem(
  id: number,
  patch: {
    title?: string
    done?: boolean
    column_key?: ChecklistColumnId
    position?: number
  }
): Promise<ChecklistItem | null> {
  const existing = await prisma.$queryRaw<Row[]>`
    SELECT id, title, done, column_key, position, created_at, updated_at, completed_at
    FROM crm_checklist_items WHERE id = ${id} LIMIT 1
  `
  const cur = existing[0]
  if (!cur) return null

  const title = patch.title != null ? patch.title.trim() : cur.title
  if (!title) throw new Error('El título es obligatorio')

  const done = patch.done ?? cur.done
  const column =
    patch.column_key && isChecklistColumnId(patch.column_key) ? patch.column_key : cur.column_key
  const position = patch.position ?? cur.position
  const completedAt = done ? cur.completed_at ?? new Date() : null

  const rows = await prisma.$queryRaw<Row[]>`
    UPDATE crm_checklist_items SET
      title = ${title},
      done = ${done},
      column_key = ${column},
      position = ${position},
      completed_at = ${completedAt},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, title, done, column_key, position, created_at, updated_at, completed_at
  `
  return rows[0] ? mapRow(rows[0]) : null
}

export async function moveChecklistItem(input: {
  id: number
  column_key: ChecklistColumnId
  position: number
}): Promise<ChecklistItem | null> {
  return updateChecklistItem(input.id, {
    column_key: input.column_key,
    position: Math.max(0, Math.floor(input.position)),
  })
}

export async function deleteChecklistItem(id: number): Promise<boolean> {
  const result = await prisma.$executeRaw`
    DELETE FROM crm_checklist_items WHERE id = ${id}
  `
  return Number(result) > 0
}
