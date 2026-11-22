import { getPool } from '@/lib/db'
import { opsLink } from '@/lib/ops-alerts'
import { getProjectDevelopers } from '@/lib/project-access'
import { notify } from './notify'
import { madridParts, madridYmd } from './rules'

/**
 * Avisos del equipo (fase 2). Cada developer recibe solo lo suyo: lo que le
 * asignan a él y lo de sus proyectos. Nunca se avisa a alguien de lo que ha
 * hecho él mismo.
 */

const others = (ids: number[], actorId?: number | null) =>
  Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0 && id !== actorId)))

/** Te han puesto una tarea (suelta o de proyecto). */
export async function notifyTaskAssigned(input: {
  userIds: number[]
  actorId?: number | null
  actorName?: string | null
  taskId: string
  title: string
  projectName?: string | null
  dueDate?: string | null
  priority?: string | null
}): Promise<void> {
  const to = others(input.userIds, input.actorId)
  if (!to.length) return
  const where = input.projectName ? ` en ${input.projectName}` : ''
  const by = input.actorName ? ` (te la pone ${input.actorName})` : ''
  const subject = `Tarea nueva para ti${where}: ${input.title}`
  const text = [
    subject + by,
    input.dueDate ? `Fecha fin: ${input.dueDate}` : '',
    input.priority === 'high' ? 'Prioridad alta' : '',
    `Abrir: ${opsLink('/tareas')}`,
  ]
    .filter(Boolean)
    .join('\n')
  await notify({
    event: 'tarea_asignada',
    subject,
    text,
    url: '/tareas',
    userIds: to,
    data: { proyecto: input.projectName ?? null },
    dedupeKey: `tarea_asignada:${input.taskId}`,
  })
}

/** Te han asignado un ticket. */
export async function notifyTicketAssigned(input: {
  userId: number | null
  actorId?: number | null
  ticketId: string
  title: string
  projectName: string
  priority?: string | null
}): Promise<void> {
  const to = others(input.userId ? [input.userId] : [], input.actorId)
  if (!to.length) return
  const subject = `Ticket asignado (${input.projectName}): ${input.title}`
  await notify({
    event: 'ticket_asignado',
    subject,
    text: `${subject}\n\nAbrir: ${opsLink(`/tickets/${input.ticketId}`)}`,
    url: `/tickets/${input.ticketId}`,
    userIds: to,
    urgent: input.priority === 'critical',
    data: { prioridad: input.priority ?? null, proyecto: input.projectName },
    dedupeKey: `ticket_asignado:${input.ticketId}:${to[0]}`,
  })
}

/** Error en el sistema de uno de sus proyectos: a los developers asignados al proyecto. */
export async function notifyProjectIncident(input: {
  proyectoId: string
  proyectoName: string
  error: string
  incidentId: string | number
}): Promise<void> {
  const devs = await getProjectDevelopers(input.proyectoId)
  if (!devs.length) return
  const subject = `Incidencia en ${input.proyectoName}`
  await notify({
    event: 'incidencia_mi_proyecto',
    subject,
    text: `${subject}\n\n${input.error.slice(0, 600)}\n\nAbrir: ${opsLink(`/retencion/proyectos/${input.proyectoId}?tab=incidencias`)}`,
    url: `/retencion/proyectos/${input.proyectoId}?tab=incidencias`,
    userIds: devs.map((d) => d.id),
    urgent: true,
    data: { proyecto: input.proyectoName },
    dedupeKey: `incidencia:${input.incidentId}`,
  })
}

let lastDueRun = 0

/**
 * Una vez al día (a partir de las 7:00), a cada persona del equipo con WhatsApp:
 * sus tareas abiertas que vencen hoy o mañana, o que ya están vencidas. Sale
 * cuando diga su regla (por defecto, resumen de laborables a las 9).
 */
export async function maybeQueueDueTaskAlerts(now = new Date()): Promise<void> {
  if (Date.now() - lastDueRun < 15 * 60_000) return
  if (madridParts(now).h < 7) return
  lastDueRun = Date.now()
  const today = madridYmd(now)
  const tomorrow = madridYmd(now, 1)
  const pool = getPool()
  const users = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM crm_users
     WHERE active = TRUE AND role IN ('developer', 'project_manager') AND whatsapp_phone IS NOT NULL AND whatsapp_phone <> ''`
  )
  for (const u of users.rows) {
    const tasks = await pool
      .query<{ title: string; due: string; proyecto: string | null }>(
        `SELECT title, due_date::text AS due, NULL::text AS proyecto FROM crm_user_tasks
         WHERE user_id = $1 AND status <> 'done' AND due_date IS NOT NULL AND due_date <= $2::date
         UNION ALL
         SELECT t.title, t.due_date::text, p.name FROM project_dev_tasks t
         JOIN proyectos p ON p.id = t.project_id
         JOIN crm_user_projects up ON up.project_id = t.project_id AND up.user_id = $1
         WHERE t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date <= $2::date
           AND $1::int = ANY(t.assignee_user_ids)
         ORDER BY 2 LIMIT 40`,
        [u.id, tomorrow]
      )
      .catch(() => ({ rows: [] as { title: string; due: string; proyecto: string | null }[] }))
    if (!tasks.rows.length) continue
    const label = (d: string) => (d < today ? 'vencida' : d === today ? 'vence hoy' : 'vence mañana')
    const lines = tasks.rows.map((t) => `- ${t.title}${t.proyecto ? ` (${t.proyecto})` : ''}: ${label(t.due)}`)
    const late = tasks.rows.filter((t) => t.due < today).length
    const subject =
      late > 0 ? `Tienes ${late} tarea${late === 1 ? '' : 's'} vencida${late === 1 ? '' : 's'}` : `Tareas que vencen pronto (${tasks.rows.length})`
    await notify({
      event: 'tarea_vence',
      subject,
      text: `${subject}\n\n${lines.join('\n')}\n\nAbrir: ${opsLink('/tareas')}`,
      url: '/tareas',
      userIds: [u.id],
      dedupeKey: `tarea_vence:${today}`,
    })
  }
}
