import { notify } from '@/lib/notifications/notify'
import { notifyProjectIncident } from '@/lib/notifications/team-events'
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
  await notifyProjectIncident(input)
}
