import { prisma } from '@/lib/prisma'
import { getPipelineCardContext } from '@/lib/pipelines/card-context'
import type {
  PipelineCardContext,
  PipelineTimelineItem,
} from '@/lib/pipelines/card-context.types'

export type LeadAlertKind =
  | 'meeting_upcoming'
  | 'meeting_stage'
  | 'payment_overdue'
  | 'payment_pending'
  | 'project_delayed'
  | 'project_no_start'
  | 'stale_lead'

export type LeadAlert = {
  id: string
  kind: LeadAlertKind
  severity: 'info' | 'warn' | 'bad'
  title: string
  message: string
  href?: string | null
}

export type LeadDetailBundle = {
  pipeline: PipelineCardContext | null
  timeline: PipelineTimelineItem[]
  alerts: LeadAlert[]
  proyecto: {
    id: string
    name: string
    status: string
    es_buffalo: boolean
    fecha_inicio_real: string | null
    fecha_fin_real: string | null
    dev_target_end_date: string | null
    tiempo_previsto: number | null
    href: string
  } | null
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

async function loadProyectoForLead(leadId: number) {
  try {
    const rows = await prisma.$queryRawUnsafe<
      {
        id: string
        name: string
        status: string
        es_buffalo: boolean
        fecha_inicio_real: Date | null
        fecha_fin_real: Date | null
        dev_target_end_date: Date | null
        tiempo_previsto: number | null
      }[]
    >(
      `
      SELECT
        id::text,
        name,
        status,
        COALESCE(es_buffalo, FALSE) AS es_buffalo,
        fecha_inicio_real,
        fecha_fin_real,
        dev_target_end_date,
        tiempo_previsto
      FROM proyectos
      WHERE lead_id = $1
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
      `,
      leadId
    )
    const p = rows[0]
    if (!p) return null
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      es_buffalo: Boolean(p.es_buffalo),
      fecha_inicio_real: p.fecha_inicio_real
        ? p.fecha_inicio_real.toISOString().slice(0, 10)
        : null,
      fecha_fin_real: p.fecha_fin_real ? p.fecha_fin_real.toISOString().slice(0, 10) : null,
      dev_target_end_date: p.dev_target_end_date
        ? p.dev_target_end_date.toISOString().slice(0, 10)
        : null,
      tiempo_previsto: p.tiempo_previsto != null ? Number(p.tiempo_previsto) : null,
      href: p.es_buffalo
        ? `/gestion-proyecto/proyectos/${p.id}`
        : `/onboarding/proyectos/${leadId}`,
    }
  } catch {
    return null
  }
}

async function loadInvoiceAlerts(
  email: string | null,
  contactName: string | null
): Promise<LeadAlert[]> {
  if (!email && !contactName) return []
  const emailNorm = email?.trim().toLowerCase() || null
  const nameNorm = contactName?.trim().toLowerCase() || null

  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        deleted_at: null,
        status: { in: ['sent', 'draft'] },
        bank_transaction_id: null,
      },
      select: {
        id: true,
        invoice_number: true,
        client_name: true,
        client_email: true,
        total: true,
        status: true,
        issue_date: true,
        due_date: true,
      },
      orderBy: { issue_date: 'desc' },
      take: 80,
    })

    const matched = invoices.filter((inv) => {
      const invEmail = inv.client_email?.trim().toLowerCase() || ''
      const invName = inv.client_name?.trim().toLowerCase() || ''
      if (emailNorm && invEmail && invEmail === emailNorm) return true
      if (nameNorm && invName && (invName === nameNorm || invName.includes(nameNorm))) return true
      return false
    })

    const alerts: LeadAlert[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const inv of matched.slice(0, 5)) {
      const due = inv.due_date ? new Date(inv.due_date) : null
      const overdue = inv.status === 'sent' && due && due.getTime() < today.getTime()
      const days = due ? Math.max(0, daysBetween(due, today)) : 0
      const amount = Number(inv.total || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })

      if (overdue) {
        alerts.push({
          id: `inv-overdue-${inv.id}`,
          kind: 'payment_overdue',
          severity: 'bad',
          title: `Factura vencida · ${inv.invoice_number}`,
          message: `${amount} € · ${days} día${days === 1 ? '' : 's'} de retraso`,
          href: `/invoices/${inv.id}`,
        })
      } else if (inv.status === 'sent') {
        alerts.push({
          id: `inv-pending-${inv.id}`,
          kind: 'payment_pending',
          severity: 'warn',
          title: `Pago pendiente · ${inv.invoice_number}`,
          message: `${amount} € enviada, aún sin cobrar`,
          href: `/invoices/${inv.id}`,
        })
      } else if (inv.status === 'draft') {
        alerts.push({
          id: `inv-draft-${inv.id}`,
          kind: 'payment_pending',
          severity: 'info',
          title: `Borrador de factura · ${inv.invoice_number}`,
          message: `${amount} € sin enviar`,
          href: `/invoices/${inv.id}`,
        })
      }
    }
    return alerts
  } catch {
    return []
  }
}

async function loadPipelineStageAlert(contactId: number): Promise<LeadAlert | null> {
  try {
    const card = await prisma.pipelineCard.findFirst({
      where: {
        deleted_at: null,
        entity_id: String(contactId),
        entity_type: 'contact',
      },
      orderBy: { updated_at: 'desc' },
      select: { stage: true, id: true, pipeline_id: true },
    })
    if (!card?.stage) return null
    const stage = card.stage.toUpperCase()
    if (stage.includes('REUNI')) {
      return {
        id: `stage-reunion-${card.id}`,
        kind: 'meeting_stage',
        severity: 'warn',
        title: 'En columna Reunión',
        message: 'Hay que preparar / revisar la reunión de este lead',
        href: `/pipelines/${card.pipeline_id}`,
      }
    }
    if (stage.includes('FACTURA') || stage.includes('CONTRATO') || stage.includes('NEGOCI')) {
      return {
        id: `stage-pending-${card.id}`,
        kind: 'payment_pending',
        severity: 'info',
        title: `Pipeline · ${card.stage}`,
        message: 'Deal avanzado — revisa cobro y siguiente paso',
        href: `/pipelines/${card.pipeline_id}`,
      }
    }
    return null
  } catch {
    return null
  }
}

function projectAlerts(
  proyecto: LeadDetailBundle['proyecto']
): LeadAlert[] {
  if (!proyecto) return []
  const alerts: LeadAlert[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (proyecto.fecha_fin_real) return alerts

  if (proyecto.dev_target_end_date) {
    const target = new Date(proyecto.dev_target_end_date)
    if (target.getTime() < today.getTime()) {
      const days = daysBetween(target, today)
      alerts.push({
        id: `proj-delay-${proyecto.id}`,
        kind: 'project_delayed',
        severity: 'bad',
        title: 'Proyecto retrasado',
        message: `Fecha objetivo ${proyecto.dev_target_end_date} · ${days} día${days === 1 ? '' : 's'} de retraso`,
        href: proyecto.href,
      })
    }
  } else if (
    proyecto.fecha_inicio_real &&
    proyecto.tiempo_previsto != null &&
    proyecto.tiempo_previsto > 0
  ) {
    const start = new Date(proyecto.fecha_inicio_real)
    const expectedEnd = new Date(start)
    expectedEnd.setDate(expectedEnd.getDate() + Math.round(proyecto.tiempo_previsto))
    if (expectedEnd.getTime() < today.getTime()) {
      const days = daysBetween(expectedEnd, today)
      alerts.push({
        id: `proj-delay-prev-${proyecto.id}`,
        kind: 'project_delayed',
        severity: 'bad',
        title: 'Proyecto fuera de plazo previsto',
        message: `Previsto ${proyecto.tiempo_previsto} días desde inicio · ${days} de retraso`,
        href: proyecto.href,
      })
    }
  }

  if (proyecto.es_buffalo && !proyecto.fecha_inicio_real && proyecto.status === 'development') {
    alerts.push({
      id: `proj-nostart-${proyecto.id}`,
      kind: 'project_no_start',
      severity: 'warn',
      title: 'Proyecto sin fecha de inicio',
      message: 'Está en gestión pero no tiene fecha_inicio_real',
      href: proyecto.href,
    })
  }

  return alerts
}

/**
 * Bundle para la ficha de lead: historial pipeline + avisos (reunión, pagos, retrasos).
 */
export async function getLeadDetailBundle(input: {
  leadId: number
  contactId: number | null
  email: string | null
  contactName: string | null
  leadUpdatedAt: Date
  leadEstado: string | null
}): Promise<LeadDetailBundle> {
  const contactId = input.contactId
  const [pipeline, proyecto, invoiceAlerts, stageAlert] = await Promise.all([
    contactId ? getPipelineCardContext(contactId) : Promise.resolve(null),
    loadProyectoForLead(input.leadId),
    loadInvoiceAlerts(input.email, input.contactName),
    contactId ? loadPipelineStageAlert(contactId) : Promise.resolve(null),
  ])

  const alerts: LeadAlert[] = []

  if (pipeline?.upcoming_meeting) {
    const start = new Date(pipeline.upcoming_meeting.start_time)
    alerts.push({
      id: 'meeting-upcoming',
      kind: 'meeting_upcoming',
      severity: 'info',
      title: 'Reunión próxima',
      message: `${pipeline.upcoming_meeting.title || 'Reunión'} · ${start.toLocaleString('es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })}`,
      href: pipeline.upcoming_meeting.calendar_href || null,
    })
  }

  if (stageAlert && !pipeline?.upcoming_meeting) {
    alerts.push(stageAlert)
  } else if (stageAlert && stageAlert.kind !== 'meeting_stage') {
    alerts.push(stageAlert)
  }

  alerts.push(...invoiceAlerts)
  alerts.push(...projectAlerts(proyecto))

  // Lead frío sin tocar en >21 días
  const staleDays = daysBetween(input.leadUpdatedAt, new Date())
  const estado = (input.leadEstado || '').toLowerCase()
  if (
    staleDays >= 21 &&
    !['cerrado', 'perdido', 'activo'].includes(estado) &&
    !alerts.some((a) => a.kind === 'meeting_upcoming')
  ) {
    alerts.push({
      id: 'stale-lead',
      kind: 'stale_lead',
      severity: 'warn',
      title: 'Lead sin actividad reciente',
      message: `Lleva ${staleDays} días sin actualizarse — conviene un follow-up`,
      href: null,
    })
  }

  // Prioridad: bad > warn > info
  const rank = { bad: 0, warn: 1, info: 2 }
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity])

  return {
    pipeline,
    timeline: pipeline?.timeline || [],
    alerts,
    proyecto,
  }
}
