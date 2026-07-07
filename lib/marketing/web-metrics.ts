import { prisma } from '@/lib/prisma'
import { queryChat } from '@/lib/db-chat'
import { AGENT_CHAT_HISTORY_TABLE } from '@/lib/agent-chat-history'

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

export interface WebLeadRow {
  id: number
  estado: string | null
  origen_principal: string | null
  created_at: string
  contact: {
    nombre: string | null
    email: string | null
    empresa: string | null
  } | null
}

export interface WebMarketingMetrics {
  period: string
  web_leads: number
  form_submissions: number
  chat_sessions: number
  chat_replied: number
  conversion_form_pct: number | null
  conversion_chat_pct: number | null
  recent_web_leads: WebLeadRow[]
  chat_available: boolean
}

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

async function fetchChatMetrics(): Promise<{
  chat_sessions: number
  chat_replied: number
  available: boolean
}> {
  try {
    const { rows } = await queryChat<{ session_id: string; has_user: boolean }>(
      `SELECT session_id,
              BOOL_OR(
                COALESCE(message->>'type', '') IN ('human', 'user')
                OR LOWER(COALESCE(message->>'role', '')) IN ('human', 'user')
                OR COALESCE(message #>> '{id,-1}', '') = 'HumanMessage'
              ) AS has_user
       FROM ${AGENT_CHAT_HISTORY_TABLE}
       GROUP BY session_id`
    )
    const chat_sessions = rows.length
    const chat_replied = rows.filter((r) => r.has_user).length
    return { chat_sessions, chat_replied, available: true }
  } catch {
    return { chat_sessions: 0, chat_replied: 0, available: false }
  }
}

export async function getWebMarketingMetrics(period: string): Promise<WebMarketingMetrics> {
  const { start, end } = periodBounds(period)
  const dateFilter = { created_at: { gte: start, lte: end } }

  const [web_leads, form_submissions, recentRaw, chat] = await Promise.all([
    prisma.lead.count({
      where: { ...dateFilter, ...webLeadWhere() },
    }),
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
    fetchChatMetrics(),
  ])

  const conversion_form_pct =
    web_leads > 0 ? Math.round((form_submissions / web_leads) * 1000) / 10 : null
  const conversion_chat_pct =
    chat.chat_sessions > 0
      ? Math.round((chat.chat_replied / chat.chat_sessions) * 1000) / 10
      : null

  return {
    period,
    web_leads,
    form_submissions,
    chat_sessions: chat.chat_sessions,
    chat_replied: chat.chat_replied,
    conversion_form_pct,
    conversion_chat_pct,
    recent_web_leads: recentRaw.map((l) => ({
      id: l.id,
      estado: l.estado,
      origen_principal: l.origen_principal,
      created_at: l.created_at.toISOString(),
      contact: l.contact,
    })),
    chat_available: chat.available,
  }
}
