import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/marketing/metrics?period=2026-06
// Returns KPIs for the requested period (default: current month)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try { await requireAuthAPI(req, res) } catch { return }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Determine the period(s) to return
  const now = new Date()
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const requestedPeriod = (req.query.period as string) || currentPeriod

  try {
    // ── Per-channel metrics for requested period ──────────────────────────────
    const metrics = await prisma.marketingMetric.findMany({
      where: { period: requestedPeriod },
      orderBy: { channel: 'asc' },
    })

    // ── All periods available (for period selector) ───────────────────────────
    const periods = await prisma.marketingMetric.findMany({
      select: { period: true },
      distinct: ['period'],
      orderBy: { period: 'desc' },
    })

    // ── Email outreach history (last 6 months) ────────────────────────────────
    const emailHistory = await prisma.marketingMetric.findMany({
      where: { channel: 'email_outreach' },
      orderBy: { period: 'asc' },
      take: 12,
    })

    // ── CRM leads from email outreach ─────────────────────────────────────────
    const emailLeads = await prisma.lead.findMany({
      where: { origen_principal: 'email_outreach' },
      include: {
        contact: { select: { nombre: true, email: true, empresa: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    })

    // ── Meetings from email outreach (tasks created by webhook) ──────────────
    const meetingTasks = await prisma.task.count({
      where: {
        tarea: { contains: '(Instantly)' },
        pendiente: true,
      },
    })

    // ── Global KPIs: sum all channels for the period ──────────────────────────
    const globalMetric = metrics.reduce(
      (acc, m) => ({
        totalLeads:        acc.totalLeads        + (m.interested ?? 0) + (m.replies ?? 0),
        meetingsBooked:    acc.meetingsBooked    + m.meetings_booked,
        totalSpend:        acc.totalSpend        + Number(m.spend),
        emailsSent:        acc.emailsSent        + m.emails_sent,
        contactsSent:      acc.contactsSent      + m.contacts_sent,
        replies:           acc.replies           + m.replies,
        interested:        acc.interested        + m.interested,
        bounced:           acc.bounced           + m.bounced,
        unsubscribed:      acc.unsubscribed      + m.unsubscribed,
        notInterested:     acc.notInterested     + m.not_interested,
      }),
      {
        totalLeads: 0, meetingsBooked: 0, totalSpend: 0,
        emailsSent: 0, contactsSent: 0, replies: 0,
        interested: 0, bounced: 0, unsubscribed: 0, notInterested: 0,
      }
    )

    // ── Closed deals from email outreach (estado = 'cliente' or 'cerrado') ────
    const closedLeads = await prisma.lead.count({
      where: {
        origen_principal: 'email_outreach',
        estado: { in: ['cliente', 'cerrado'] },
      },
    })

    // ── Cash collected: sum of invoices linked to email outreach contacts ─────
    // We approximate: leads closed from email outreach × avg deal value
    const closedLeadsWithValue = await prisma.lead.findMany({
      where: {
        origen_principal: 'email_outreach',
        estado: { in: ['cliente', 'cerrado'] },
        valor: { not: null },
      },
      select: { valor: true },
    })
    const cashCollected = closedLeadsWithValue.reduce((s, l) => s + Number(l.valor ?? 0), 0)

    // ── CAC calculation ───────────────────────────────────────────────────────
    const emailMetric = metrics.find(m => m.channel === 'email_outreach')
    const emailSpend = emailMetric ? Number(emailMetric.spend) : 500 // default 500€/mes jessica
    const cac = closedLeads > 0 ? emailSpend / closedLeads : null

    return res.status(200).json({
      period: requestedPeriod,
      periods: periods.map(p => p.period),
      global: {
        ...globalMetric,
        closedLeads,
        cashCollected,
        cac,
      },
      metrics,          // one row per channel
      emailHistory,     // monthly trend for email outreach
      emailLeads: emailLeads.map(l => ({
        id: l.id,
        estado: l.estado,
        prioridad: l.prioridad,
        valor: l.valor ? Number(l.valor) : null,
        created_at: l.created_at.toISOString(),
        contact: l.contact,
      })),
      meetingTasks,
    })

  } catch (error) {
    console.error('[api/marketing/metrics]', error)
    return res.status(500).json({ error: 'Error fetching marketing metrics' })
  }
}
