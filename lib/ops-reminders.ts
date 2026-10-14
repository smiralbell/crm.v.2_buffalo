import { query } from '@/lib/db'
import { ensureChecklistSchema } from '@/lib/checklist/store'
import { type ChecklistColumnId, isChecklistColumnId } from '@/lib/checklist/types'
import { prisma } from '@/lib/prisma'
import { opsLink, sendOpsAlert } from '@/lib/ops-alerts'
import { ensureIncidentsTable } from '@/lib/retencion/incidents'

const TZ = 'Europe/Madrid'

export function madridYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Días de calendario (Madrid) entre two dates. 0 = mismo día. */
export function madridCalendarDaysBetween(from: Date, to: Date): number {
  const a = madridYmd(from)
  const b = madridYmd(to)
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  return Math.round((db - da) / 86_400_000)
}

function personLabel(column: ChecklistColumnId): string {
  if (column === 'santi') return 'Santi'
  if (column === 'sergi') return 'Sergi'
  return 'Equipo'
}

function checklistLine(column: ChecklistColumnId, title: string): string {
  if (column === 'inbox') return `En Checklist (sin asignar) falta: ${title}`
  return `${personLabel(column)} te falta hacer: ${title}`
}

type DueIncident = {
  id: string
  proyecto_id: string
  proyecto_name: string
  error_text: string
  created_at: Date
}

type DueTask = {
  id: number
  title: string
  column_key: ChecklistColumnId
}

async function claimDueIncidents(): Promise<DueIncident[]> {
  await ensureIncidentsTable()
  const claimed = await query<{
    id: string
    proyecto_id: string
    error_text: string
    created_at: Date
  }>(
    `WITH due AS (
       SELECT id
         FROM retencion_incidents
        WHERE status = 'open'
          AND (created_at AT TIME ZONE '${TZ}')::date
              < (NOW() AT TIME ZONE '${TZ}')::date
          AND (
            last_nagged_at IS NULL
            OR (last_nagged_at AT TIME ZONE '${TZ}')::date
               < (NOW() AT TIME ZONE '${TZ}')::date
          )
        FOR UPDATE SKIP LOCKED
     )
     UPDATE retencion_incidents i
        SET last_nagged_at = NOW()
       FROM due
      WHERE i.id = due.id
     RETURNING i.id::text, i.proyecto_id::text, i.error_text, i.created_at`
  )
  if (!claimed.rows.length) return []

  const ids = Array.from(new Set(claimed.rows.map((r) => r.proyecto_id)))
  const names = await query<{ id: string; name: string }>(
    `SELECT id::text, name FROM proyectos WHERE id = ANY($1::uuid[])`,
    [ids]
  )
  const nameById = new Map(names.rows.map((r) => [r.id, r.name]))
  return claimed.rows.map((r) => ({
    id: r.id,
    proyecto_id: r.proyecto_id,
    proyecto_name: nameById.get(r.proyecto_id) || 'Cliente',
    error_text: r.error_text,
    created_at: r.created_at,
  }))
}

async function claimDueChecklist(): Promise<DueTask[]> {
  await ensureChecklistSchema()
  const rows = await prisma.$queryRaw<
    { id: number; title: string; column_key: string }[]
  >`
    WITH due AS (
      SELECT id
        FROM crm_checklist_items
       WHERE done = FALSE
         AND remind_every_days > 0
         AND (
           (COALESCE(last_reminded_at, created_at) AT TIME ZONE 'Europe/Madrid')::date
           + (remind_every_days * INTERVAL '1 day')
         ) <= (NOW() AT TIME ZONE 'Europe/Madrid')::date
       FOR UPDATE SKIP LOCKED
    )
    UPDATE crm_checklist_items i
       SET last_reminded_at = NOW()
      FROM due
     WHERE i.id = due.id
    RETURNING i.id, i.title, i.column_key
  `
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    column_key: isChecklistColumnId(r.column_key) ? r.column_key : 'inbox',
  }))
}

function buildDigest(incidents: DueIncident[], tasks: DueTask[]): {
  subject: string
  text: string
  html: string
  telegramHtml: string
} | null {
  if (!incidents.length && !tasks.length) return null

  const now = new Date()
  const incLines = incidents.map((i) => {
    const days = Math.max(1, madridCalendarDaysBetween(new Date(i.created_at), now))
    const err = i.error_text.replace(/\s+/g, ' ').trim().slice(0, 220)
    const link = opsLink(`/retencion/proyectos/${i.proyecto_id}?tab=incidencias`)
    return {
      title: `${i.proyecto_name} · ${days} día${days === 1 ? '' : 's'} abierta`,
      err,
      link,
    }
  })
  const taskLines = tasks.map((t) => checklistLine(t.column_key, t.title.trim()))
  const checkLink = opsLink('/checklist')

  const textParts: string[] = []
  if (incLines.length) {
    textParts.push('INCIDENCIAS ABIERTAS')
    for (const l of incLines) textParts.push(`• ${l.title}\n  ${l.err}\n  ${l.link}`)
  }
  if (taskLines.length) {
    textParts.push('CHECKLIST')
    for (const l of taskLines) textParts.push(`• ${l}`)
    textParts.push(checkLink)
  }

  const htmlParts: string[] = ['<p>Recordatorios del CRM Buffalo.</p>']
  if (incLines.length) {
    htmlParts.push('<p><b>Incidencias abiertas</b></p><ul>')
    for (const l of incLines) {
      htmlParts.push(
        `<li><a href="${l.link}">${esc(l.title)}</a><br/>${esc(l.err)}</li>`
      )
    }
    htmlParts.push('</ul>')
  }
  if (taskLines.length) {
    htmlParts.push('<p><b>Checklist</b></p><ul>')
    for (const l of taskLines) htmlParts.push(`<li>${esc(l)}</li>`)
    htmlParts.push('</ul>')
    htmlParts.push(`<p><a href="${checkLink}">Abrir checklist</a></p>`)
  }

  const tg: string[] = ['<b>Recordatorios CRM</b>']
  if (incLines.length) {
    tg.push('')
    tg.push('<b>Incidencias abiertas</b>')
    for (const l of incLines) tg.push(`• ${esc(l.title)}\n${esc(l.err)}\n${l.link}`)
  }
  if (taskLines.length) {
    tg.push('')
    tg.push('<b>Checklist</b>')
    for (const l of taskLines) tg.push(`• ${esc(l)}`)
    tg.push(checkLink)
  }

  const bits: string[] = []
  if (incLines.length) bits.push(`${incLines.length} incidencia${incLines.length === 1 ? '' : 's'}`)
  if (taskLines.length) bits.push(`${taskLines.length} tarea${taskLines.length === 1 ? '' : 's'} de checklist`)

  return {
    subject: `Recordatorios · ${bits.join(' y ')}`,
    text: textParts.join('\n\n'),
    html: htmlParts.join(''),
    telegramHtml: tg.join('\n'),
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function runDueOpsReminders(): Promise<{
  incidents: number
  checklist: number
  sent: boolean
}> {
  const incidents = await claimDueIncidents().catch((e) => {
    console.warn('[ops-reminders] incidents', e)
    return [] as DueIncident[]
  })
  const tasks = await claimDueChecklist().catch((e) => {
    console.warn('[ops-reminders] checklist', e)
    return [] as DueTask[]
  })
  const digest = buildDigest(incidents, tasks)
  if (!digest) return { incidents: 0, checklist: 0, sent: false }
  await sendOpsAlert(digest)
  return { incidents: incidents.length, checklist: tasks.length, sent: true }
}

