import { notify } from '@/lib/alerts'

/** Avisa a los administradores de que ha entrado un ticket. */
export async function alertTeamOfNewTicket(input: {
  ticketId: string
  projectId: string
  projectName: string
  title: string
  priority?: string | null
}): Promise<void> {
  const urgent = input.priority === 'critical' || input.priority === 'high'
  await notify({
    kind: 'ticket.nuevo',
    title: `Nuevo ticket · ${input.projectName}`,
    body: input.title,
    link: `/tickets/${input.ticketId}`,
    severity: urgent ? 'urgent' : 'info',
    dedupeKey: `ticket:${input.ticketId}`,
  })
}
