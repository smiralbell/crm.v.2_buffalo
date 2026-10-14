import { prisma } from '@/lib/prisma'
import {
  countPendingWebFormSubmissions,
  countWebFormSubmissions,
  isWebFormSubmissionsTableAvailable,
} from '@/lib/marketing/web-form-submissions'
import {
  countCalBookings,
  countUpcomingCalBookings,
  isCalBookingsReady,
} from '@/lib/marketing/cal-bookings'

export const WEB_LEAD_ORIGINS = [
  'web',
  'website',
  'landing',
  'formulario_web',
  'web_form',
  'web_chat',
  'chat_web',
  'chat_widget',
] as const

export const WEB_FORM_ORIGINS = [
  'formulario_web',
  'web_form',
  'form',
  'formulario',
] as const

export type { WebLeadRow, WebMarketingMetrics } from '@/lib/marketing/web-metrics.types'
import type { WebMarketingMetrics } from '@/lib/marketing/web-metrics.types'

function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number)
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m, 0, 23, 59, 59, 999)
  return { start, end }
}

function webLeadWhere() {
  return {
    OR: [
      { origen_principal: { in: [...WEB_LEAD_ORIGINS] } },
      { origen_principal: { contains: 'web', mode: 'insensitive' as const } },
      {
        contact: {
          messages: {
            some: {
              canal: { in: ['web', 'chat_web', 'widget', 'formulario_web', 'web_chat'] },
            },
          },
        },
      },
    ],
  }
}

function formLeadWhere() {
  return {
    OR: [
      { origen_principal: { in: [...WEB_FORM_ORIGINS] } },
      { origen_principal: { contains: 'formulario', mode: 'insensitive' as const } },
      {
        contact: {
          messages: {
            some: { canal: { in: ['formulario_web', 'web_form', 'form'] } },
          },
        },
      },
    ],
  }
}

export async function getWebMarketingMetrics(period: string): Promise<WebMarketingMetrics> {
  const { start, end } = periodBounds(period)
  const dateFilter = { created_at: { gte: start, lte: end } }

  const calReady = await isCalBookingsReady()

  const [web_leads, formFromTable, formFromLeads, recentRaw, formsTableOk, cal_bookings, cal_upcoming] =
    await Promise.all([
      prisma.lead.count({
        where: { ...dateFilter, ...webLeadWhere() },
      }),
      countWebFormSubmissions(period),
      prisma.lead.count({
        where: { ...dateFilter, ...formLeadWhere() },
      }),
      prisma.lead.findMany({
        where: { ...dateFilter, ...webLeadWhere() },
        include: {
          contact: { select: { nombre: true, email: true, empresa: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 12,
      }),
      isWebFormSubmissionsTableAvailable(),
      calReady ? countCalBookings(period) : Promise.resolve(0),
      calReady ? countUpcomingCalBookings() : Promise.resolve(0),
    ])

  const form_submissions = formsTableOk ? formFromTable : formFromLeads
  const form_submissions_pending = formsTableOk ? await countPendingWebFormSubmissions(period) : 0

  const conversion_form_pct =
    web_leads > 0 ? Math.round((form_submissions / web_leads) * 1000) / 10 : null

  return {
    period,
    web_leads,
    form_submissions,
    chat_sessions: 0,
    chat_replied: 0,
    conversion_form_pct,
    conversion_chat_pct: null,
    recent_web_leads: recentRaw.map((l) => ({
      id: l.id,
      estado: l.estado,
      origen_principal: l.origen_principal,
      created_at: l.created_at.toISOString(),
      contact: l.contact,
    })),
    chat_available: false,
    form_submissions_available: formsTableOk,
    form_submissions_pending,
    cal_bookings,
    cal_upcoming,
    cal_available: calReady,
  }
}
