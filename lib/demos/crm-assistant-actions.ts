import { prisma } from '@/lib/prisma'
import {
  createChecklistItem,
  listChecklistItems,
  updateChecklistItem,
} from '@/lib/checklist/store'
import { isChecklistColumnId, type ChecklistColumnId } from '@/lib/checklist/types'
import {
  insertTicketUpdate,
  updateTicketStatus,
} from '@/lib/tickets/updates'
import { createCalendarEvent } from '@/lib/google-calendar'
import {
  ensureAttachmentPublicUrl,
  type AssistantRequestContext,
} from './assistant-attachments'
import { runDomainAgents } from './crm-assistant-subagents'

function requireConfirm(args: Record<string, unknown>, preview: unknown) {
  if (args.confirm === true) return null
  return {
    needs_confirmation: true,
    message:
      'Acción preparada. Si el usuario confirma (sí / adelante / confirma), vuelve a llamar esta tool con confirm=true y los mismos parámetros.',
    preview,
  }
}

export async function appendLeadNote(leadId: number, note: string, confirm: boolean) {
  const preview = { lead_id: leadId, note_to_append: note }
  if (!confirm) return requireConfirm({ confirm }, preview)

  const rows = await prisma.$queryRaw<{ id: number; notas: string | null }[]>`
    SELECT id, notas FROM leads WHERE id = ${leadId} LIMIT 1
  `
  const lead = rows[0]
  if (!lead) return { ok: false, error: 'Lead no encontrado' }

  const stamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
  const block = `[WhatsApp asistente · ${stamp}]\n${note.trim()}`
  const next = lead.notas?.trim() ? `${lead.notas.trim()}\n\n${block}` : block

  await prisma.$executeRaw`
    UPDATE leads SET notas = ${next}, updated_at = NOW() WHERE id = ${leadId}
  `
  return { ok: true, lead_id: leadId, notas_preview: next.slice(-500) }
}

export async function updateLeadEstado(leadId: number, estado: string, confirm: boolean) {
  const allowed = [
    'frio',
    'caliente',
    'reunion',
    'propuesta',
    'negociando',
    'cerrado',
    'activo',
    'perdido',
  ]
  if (!allowed.includes(estado)) {
    return { ok: false, error: `estado inválido. Usa: ${allowed.join(', ')}` }
  }
  const preview = { lead_id: leadId, nuevo_estado: estado }
  if (!confirm) return requireConfirm({ confirm }, preview)

  const r = await prisma.$executeRaw`
    UPDATE leads SET estado = ${estado}, updated_at = NOW() WHERE id = ${leadId}
  `
  return { ok: true, lead_id: leadId, estado, rows: r }
}

export async function createContactAndLead(input: {
  nombre: string
  email?: string
  telefono?: string
  empresa?: string
  estado?: string
  notas?: string
  confirm: boolean
}) {
  const preview = { ...input, confirm: undefined }
  if (!input.confirm) return requireConfirm({ confirm: false }, preview)

  const nombre = input.nombre.trim()
  if (!nombre) return { ok: false, error: 'nombre obligatorio' }

  const contact = await prisma.contact.create({
    data: {
      nombre,
      email: input.email?.trim() || null,
      telefono: input.telefono?.trim() || null,
      empresa: input.empresa?.trim() || null,
    },
  })

  const lead = await prisma.lead.create({
    data: {
      contact_id: contact.id,
      estado: input.estado || 'frio',
      notas: input.notas?.trim() || null,
    },
  })

  return {
    ok: true,
    contact_id: contact.id,
    lead_id: lead.id,
    deep_link: `/leads/${lead.id}`,
  }
}

export async function checklistAdd(
  title: string,
  column_key: string | undefined,
  confirm: boolean
) {
  const column: ChecklistColumnId =
    column_key && isChecklistColumnId(column_key) ? column_key : 'inbox'
  const preview = { title, column_key: column }
  if (!confirm) return requireConfirm({ confirm }, preview)
  const item = await createChecklistItem({ title, column_key: column })
  return { ok: true, item, deep_link: '/checklist' }
}

export async function checklistComplete(id: number, confirm: boolean) {
  const preview = { id, done: true }
  if (!confirm) return requireConfirm({ confirm }, preview)
  const item = await updateChecklistItem(id, { done: true })
  return item ? { ok: true, item } : { ok: false, error: 'Item no encontrado' }
}

export async function checklistList() {
  const items = await listChecklistItems()
  return {
    open: items.filter((i) => !i.done).slice(0, 30),
    done_recent: items.filter((i) => i.done).slice(0, 10),
  }
}

export async function ticketReply(
  ticketId: string,
  message: string,
  status: string | undefined,
  confirm: boolean
) {
  const preview = { ticket_id: ticketId, message, status: status || null }
  if (!confirm) return requireConfirm({ confirm }, preview)

  await insertTicketUpdate({
    ticketId,
    authorName: 'Asistente WhatsApp CRM',
    message: message.trim(),
    status: status || null,
    isFromClient: false,
  })
  if (status) {
    await updateTicketStatus(ticketId, status)
  }
  return { ok: true, ticket_id: ticketId, status: status || 'unchanged' }
}

export async function ticketSetStatus(ticketId: string, status: string, confirm: boolean) {
  const allowed = ['open', 'in_progress', 'resolved', 'closed']
  if (!allowed.includes(status)) {
    return { ok: false, error: `status inválido: ${allowed.join(', ')}` }
  }
  if (!confirm) return requireConfirm({ confirm }, { ticket_id: ticketId, status })
  await updateTicketStatus(ticketId, status)
  return { ok: true, ticket_id: ticketId, status }
}

export async function createProjectTask(input: {
  proyecto_id: string
  title: string
  priority?: string
  confirm: boolean
}) {
  const preview = { ...input, confirm: undefined }
  if (!input.confirm) return requireConfirm({ confirm: false }, preview)

  const title = input.title.trim()
  if (!title) return { ok: false, error: 'title obligatorio' }
  const priority = input.priority || 'medium'

  try {
    const maxPos = await prisma.$queryRaw<{ max_pos: number | null }[]>`
      SELECT MAX(position)::int AS max_pos
      FROM project_dev_tasks
      WHERE project_id = ${input.proyecto_id}::uuid AND status = 'pending'
    `
    const position = (maxPos[0]?.max_pos ?? -1) + 1
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO project_dev_tasks (project_id, title, status, priority, position)
      VALUES (${input.proyecto_id}::uuid, ${title}, 'pending', ${priority}, ${position})
      RETURNING id::text
    `
    if (!rows[0]) {
      return { ok: false, error: 'No se pudo crear la tarea' }
    }
    return {
      ok: true,
      task_id: rows[0].id,
      deep_link: `/gestion-proyecto/proyectos/${input.proyecto_id}`,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Error creando tarea de proyecto',
    }
  }
}

export async function updateProyectoStatus(input: {
  proyecto_id: string
  status: string
  confirm: boolean
}) {
  const allowed = ['development', 'active', 'paused', 'churned']
  if (!allowed.includes(input.status)) {
    return { ok: false, error: `status inválido: ${allowed.join(', ')}` }
  }
  if (!input.confirm) {
    return requireConfirm({ confirm: false }, {
      proyecto_id: input.proyecto_id,
      status: input.status,
    })
  }
  const r = await prisma.$executeRaw`
    UPDATE proyectos
    SET status = ${input.status}, updated_at = NOW()
    WHERE id = ${input.proyecto_id}::uuid
  `
  return {
    ok: true,
    proyecto_id: input.proyecto_id,
    status: input.status,
    rows: r,
    deep_link: `/gestion-proyecto/proyectos/${input.proyecto_id}`,
  }
}

export async function sendCrmEmail(input: {
  to: string
  subject: string
  body: string
  confirm: boolean
}) {
  if (!input.confirm) {
    return requireConfirm({ confirm: false }, {
      to: input.to,
      subject: input.subject,
      body_preview: input.body.slice(0, 400),
    })
  }
  try {
    const { sendMail } = await import('@/lib/mail/smtp')
    await sendMail({
      to: input.to.trim(),
      subject: input.subject.trim(),
      text: input.body,
      html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${input.body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre>`,
    })
    return { ok: true, to: input.to, subject: input.subject }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Error enviando email (¿SMTP configurado?)',
    }
  }
}

export async function createMeeting(input: {
  titulo: string
  descripcion?: string
  fecha_iso: string
  duracion_min?: number
  email_prospecto: string
  email_organizador?: string
  confirm: boolean
}) {
  const preview = { ...input, confirm: undefined }
  if (!input.confirm) return requireConfirm({ confirm: false }, preview)

  const organizador =
    input.email_organizador?.trim() ||
    process.env.CRM_ADMIN_EMAIL ||
    process.env.GOOGLE_CALENDAR_ORGANIZER_EMAIL
  if (!organizador) {
    return {
      ok: false,
      error: 'Falta email organizador (CRM_ADMIN_EMAIL o parámetro email_organizador)',
    }
  }

  const start = new Date(input.fecha_iso)
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: 'fecha_iso inválida (usa ISO 8601)' }
  }

  try {
    const created = await createCalendarEvent({
      titulo: input.titulo.trim(),
      descripcion: input.descripcion?.trim() || 'Reunión creada desde asistente WhatsApp CRM',
      fechaInicio: start,
      duracionMin: input.duracion_min || 30,
      emailProspecto: input.email_prospecto.trim(),
      emailOrganizador: organizador,
    })
    return {
      ok: true,
      event_id: created.eventId,
      meet_link: created.meetLink || null,
      html_link: created.event.htmlLink || null,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Error creando evento Google Calendar',
    }
  }
}

export async function queueDomainReport(
  ctx: AssistantRequestContext,
  domains: string[],
  title?: string
) {
  const data = await runDomainAgents(domains as any, '')
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const filename = `buffalo-informe-${stamp}.txt`
  const body = [
    title || 'Informe Buffalo CRM',
    `Generado: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`,
    '',
    JSON.stringify(data, null, 2),
  ].join('\n')

  const buffer = Buffer.from(body, 'utf8')
  const published = await ensureAttachmentPublicUrl({
    kind: 'document',
    filename,
    mime: 'text/plain; charset=utf-8',
    buffer,
    caption: title || 'Informe CRM',
  })
  ctx.attachments.push(published)
  ctx.actionsLog.push(`informe_adjunto:${filename}`)
  return {
    ok: true,
    queued_document: filename,
    public_url: published.publicUrl,
    note: 'El documento se enviará por WhatsApp junto a la respuesta de texto.',
  }
}

export async function queueTextDocument(
  ctx: AssistantRequestContext,
  filename: string,
  content: string,
  caption?: string
) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'nota.txt'
  const published = await ensureAttachmentPublicUrl({
    kind: 'document',
    filename: safe.endsWith('.txt') ? safe : `${safe}.txt`,
    mime: 'text/plain; charset=utf-8',
    buffer: Buffer.from(content, 'utf8'),
    caption: caption || safe,
  })
  ctx.attachments.push(published)
  ctx.actionsLog.push(`doc_adjunto:${published.filename}`)
  return {
    ok: true,
    queued_document: published.filename,
    public_url: published.publicUrl,
  }
}
