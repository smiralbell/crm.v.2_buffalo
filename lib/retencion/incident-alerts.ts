import { notify } from '@/lib/notifications/notify'
import { notifyProjectIncident } from '@/lib/notifications/team-events'
import { scheduleReminder } from '@/lib/notifications/reminders'
import { opsLink } from '@/lib/ops-alerts'

export async function alertIncident(input: {
  proyectoId: string
  proyectoName: string
  error: string
  incidentId: string
}): Promise<void> {
  const title = `Incidencia: ${input.proyectoName}`
  const body = input.error.slice(0, 500)
  const link = opsLink(`/retencion/proyectos/${input.proyectoId}?tab=incidencias`)
  const safeTitle = title.replace(/</g, '')
  const safeBody = body.replace(/</g, '')
  // A los socios (según sus reglas) y a los developers del proyecto (solo lo suyo)
  await notify({
    event: 'incidencia_nueva',
    subject: title,
    text: `${body}\n\n${link}`,
    html: `<p>${safeBody}</p><p><a href="${link}">Abrir en el CRM</a></p>`,
    telegramHtml: `<b>${safeTitle}</b>\n${safeBody}\n${link}`,
    url: `/retencion/proyectos/${input.proyectoId}?tab=incidencias`,
    urgent: true,
    data: { proyecto: input.proyectoName },
  })
  // Recordatorio para los socios: cada 2 días hasta que se resuelva
  await scheduleReminder({
    event: 'recordatorio_incidencia',
    entityType: 'incidencia',
    entityId: input.incidentId,
    title: `Incidencia sin resolver: ${input.proyectoName}`,
    url: `/retencion/proyectos/${input.proyectoId}?tab=incidencias`,
    everyHours: 48,
    userIds: null,
  }).catch((e) => console.warn('[avisos] recordatorio incidencia', e instanceof Error ? e.message : e))
  await notifyProjectIncident(input)
}
