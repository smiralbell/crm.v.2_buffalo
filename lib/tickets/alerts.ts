import { opsLink, sendOpsAlert } from '@/lib/ops-alerts'
import { PRIORITY_LABELS, type IngestedTicket, type TicketPriority } from './ingest'

function safe(s: string): string {
  return s.replace(/</g, '')
}

function line(label: string, value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? `${label}: ${v}` : null
}

function priorityLabel(priority: TicketPriority | string): string {
  return PRIORITY_LABELS[priority as TicketPriority] || priority
}

export function formatNewTicketAlert(input: {
  ticketId: string
  projectName: string
  ticket: Pick<
    IngestedTicket,
    'title' | 'description' | 'priority' | 'reporter_name' | 'reporter_email' | 'source'
  >
}): { subject: string; text: string; html: string; telegramHtml: string } {
  const title = input.ticket.title?.trim() || 'Sin título'
  const project = input.projectName.trim() || 'Proyecto'
  const ficha = opsLink(`/tickets/${input.ticketId}`)
  const desc = (input.ticket.description || '').trim().slice(0, 400)
  const body = [
    line('Cliente / proyecto', project),
    line('Prioridad', priorityLabel(input.ticket.priority)),
    line('Quién', input.ticket.reporter_name),
    line('Email', input.ticket.reporter_email),
    line('Origen', input.ticket.source),
    desc ? `Detalle: ${desc}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const subject = `Ticket: ${title} (${project})`
  return {
    subject,
    text: `${body}\n\nAbrir: ${ficha}`,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${safe(body)}</pre><p><a href="${ficha}">Abrir ticket</a></p>`,
    telegramHtml: `<b>${safe(subject)}</b>\n${safe(body)}\n${ficha}`,
  }
}

/** Mismo canal Gmail + Telegram. No tira el ingest si falla el aviso. */
export async function alertNewTicket(input: {
  ticketId: string
  projectName: string
  ticket: Pick<
    IngestedTicket,
    'title' | 'description' | 'priority' | 'reporter_name' | 'reporter_email' | 'source'
  >
}): Promise<void> {
  const msg = formatNewTicketAlert(input)
  try {
    await sendOpsAlert(msg)
  } catch (e) {
    console.warn('[tickets] aviso', e instanceof Error ? e.message : e)
  }
}
