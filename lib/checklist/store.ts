import { prisma } from '@/lib/prisma'
import { normalizeRemindTime, normalizeWeekday } from '@/lib/checklist/remind'
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
  remind_every_days: number | null
  remind_weekday: number | null
  remind_time: string | Date | null
  last_reminded_at: Date | null
  created_at: Date
  updated_at: Date
  completed_at: Date | null
}

function mapTime(v: string | Date | null): string | null {
  if (v == null) return null
  if (v instanceof Date) {
    const h = String(v.getUTCHours()).padStart(2, '0')
    const m = String(v.getUTCMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  return normalizeRemindTime(String(v).slice(0, 8))
}

function mapRow(r: Row): ChecklistItem {
  return {
    id: r.id,
    title: r.title,
    done: r.done,
    column_key: isChecklistColumnId(r.column_key) ? r.column_key : 'inbox',
    position: r.position,
    remind_every_days: Number.isFinite(Number(r.remind_every_days)) ? Number(r.remind_every_days) : 1,
    remind_weekday: normalizeWeekday(r.remind_weekday),
    remind_time: mapTime(r.remind_time),
    last_reminded_at: r.last_reminded_at ? r.last_reminded_at.toISOString() : null,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
    completed_at: r.completed_at ? r.completed_at.toISOString() : null,
  }
}

let schemaEnsured = false
export async function ensureChecklistSchema(): Promise<void> {
  if (schemaEnsured) return
  await prisma.$executeRawUnsafe(
    `ALTER TABLE crm_checklist_items ADD COLUMN IF NOT EXISTS remind_every_days INT NOT NULL DEFAULT 1`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE crm_checklist_items ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE crm_checklist_items ADD COLUMN IF NOT EXISTS remind_weekday INT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE crm_checklist_items ADD COLUMN IF NOT EXISTS remind_time TEXT`
  )
  schemaEnsured = true
}

export async function listChecklistItems(): Promise<ChecklistItem[]> {
  await ensureChecklistSchema()
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, title, done, column_key, position, remind_every_days, remind_weekday, remind_time,
           last_reminded_at, created_at, updated_at, completed_at
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
  await ensureChecklistSchema()
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
    INSERT INTO crm_checklist_items (title, column_key, position, created_by_user_id, remind_every_days, remind_time)
    VALUES (${title}, ${column}, ${position}, ${input.createdByUserId ?? null}, 1, '09:00')
    RETURNING id, title, done, column_key, position, remind_every_days, remind_weekday, remind_time,
              last_reminded_at, created_at, updated_at, completed_at
  `
  return mapRow(rows[0])
}

export type ChecklistItemPatch = {
  title?: string
  done?: boolean
  column_key?: ChecklistColumnId
  position?: number
  remind_every_days?: number
  remind_weekday?: number | null
  remind_time?: string | null
}

export async function updateChecklistItem(
  id: number,
  patch: ChecklistItemPatch
): Promise<ChecklistItem | null> {
  await ensureChecklistSchema()
  const existing = await prisma.$queryRaw<Row[]>`
    SELECT id, title, done, column_key, position, remind_every_days, remind_weekday, remind_time,
           last_reminded_at, created_at, updated_at, completed_at
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
  const remindEvery =
    patch.remind_every_days != null && Number.isFinite(patch.remind_every_days)
      ? Math.max(0, Math.min(365, Math.floor(patch.remind_every_days)))
      : Number(cur.remind_every_days ?? 1)
  const weekday =
    'remind_weekday' in patch ? normalizeWeekday(patch.remind_weekday) : normalizeWeekday(cur.remind_weekday)
  const time =
    'remind_time' in patch ? normalizeRemindTime(patch.remind_time) : mapTime(cur.remind_time)
  const completedAt = done ? cur.completed_at ?? new Date() : null

  const rows = await prisma.$queryRaw<Row[]>`
    UPDATE crm_checklist_items SET
      title = ${title},
      done = ${done},
      column_key = ${column},
      position = ${position},
      remind_every_days = ${remindEvery},
      remind_weekday = ${weekday},
      remind_time = ${time},
      completed_at = ${completedAt},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, title, done, column_key, position, remind_every_days, remind_weekday, remind_time,
              last_reminded_at, created_at, updated_at, completed_at
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
