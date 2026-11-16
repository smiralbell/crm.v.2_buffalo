import { query } from '@/lib/db'
import { opsLink, sendOpsAlert } from '@/lib/ops-alerts'
import { ensureIncidentsTable } from '@/lib/retencion/incidents'

/**
 * Recordatorio diario de incidencias de Retención que siguen abiertas.
 * (Antes también recordaba el Checklist; ahora esas tareas viven en Tareas.)
 */

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

type DueIncident = {
  id: string
  proyecto_id: string
  proyecto_name: string
  error_text: string
  created_at: Date
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

function buildDigest(incidents: DueIncident[]): {
  subject: string
  text: string
  html: string
  telegramHtml: string
} | null {
  if (!incidents.length) return null

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

  const textParts = ['INCIDENCIAS ABIERTAS', ...incLines.map((l) => `• ${l.title}\n  ${l.err}\n  ${l.link}`)]

  const htmlParts: string[] = ['<p>Recordatorios del CRM Buffalo.</p>', '<p><b>Incidencias abiertas</b></p><ul>']
  for (const l of incLines) {
    htmlParts.push(`<li><a href="${l.link}">${esc(l.title)}</a><br/>${esc(l.err)}</li>`)
  }
  htmlParts.push('</ul>')

  const tg: string[] = ['<b>Recordatorios CRM</b>', '', '<b>Incidencias abiertas</b>']
  for (const l of incLines) tg.push(`• ${esc(l.title)}\n${esc(l.err)}\n${l.link}`)

  return {
    subject: `Recordatorios · ${incLines.length} incidencia${incLines.length === 1 ? '' : 's'}`,
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
  /** Siempre 0: el Checklist ya no existe (sus tareas están en Tareas) */
  checklist: number
  sent: boolean
}> {
  const incidents = await claimDueIncidents().catch((e) => {
    console.warn('[ops-reminders] incidents', e)
    return [] as DueIncident[]
  })
  const digest = buildDigest(incidents)
  if (!digest) return { incidents: 0, checklist: 0, sent: false }
  await sendOpsAlert({ ...digest, url: '/alertas' })
  return { incidents: incidents.length, checklist: 0, sent: true }
}
