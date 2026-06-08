import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/emails/metrics
 * Obtiene métricas de Instantly webhooks por fecha
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query

  try {
    // Crear tabla si no existe
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "instantly_webhooks" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "event_type" VARCHAR(255),
        "email" VARCHAR(255),
        "campaign_id" VARCHAR(255),
        "campaign_name" VARCHAR(255),
        "payload" JSONB,
        "status" VARCHAR(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    const yearNum = parseInt(year as string)
    const monthNum = parseInt(month as string)
    const monthStart = new Date(yearNum, monthNum - 1, 1).toISOString()
    const monthEnd = new Date(yearNum, monthNum, 1).toISOString()

    // Leer todos los webhooks del mes
    const webhooks = await prisma.$queryRawUnsafe<any[]>(
      `SELECT event_type, email, campaign_name, created_at
       FROM "instantly_webhooks"
       WHERE created_at >= $1 AND created_at < $2
       ORDER BY created_at DESC`,
      monthStart,
      monthEnd
    )

    // Agregar métricas
    const metrics = {
      emails_sent: 0,
      contacts_sent: new Set<string>(),
      replies: 0,
      interested: 0,
      bounced: 0,
      unsubscribed: 0,
      opens: 0,
      clicks: 0,
      by_event: {} as Record<string, number>,
      by_campaign: {} as Record<string, number>,
    }

    webhooks.forEach(w => {
      const evt = w.event_type || 'unknown'
      metrics.by_event[evt] = (metrics.by_event[evt] || 0) + 1
      metrics.by_campaign[w.campaign_name || 'unknown'] = (metrics.by_campaign[w.campaign_name || 'unknown'] || 0) + 1

      if (evt === 'email_sent') metrics.emails_sent++
      if (evt === 'email_sent' && w.email) metrics.contacts_sent.add(w.email)
      if (evt === 'reply_received') metrics.replies++
      if (evt === 'email_bounced') metrics.bounced++
      if (evt === 'lead_unsubscribed') metrics.unsubscribed++
      if (evt === 'email_opened') metrics.opens++
      if (evt === 'email_link_clicked') metrics.clicks++
    })

    return res.json({
      year: yearNum,
      month: monthNum,
      emails_sent: metrics.emails_sent,
      contacts_sent: metrics.contacts_sent.size,
      replies: metrics.replies,
      interested: 0,
      not_interested: 0,
      bounced: metrics.bounced,
      unsubscribed: metrics.unsubscribed,
      meetings_booked: 0,
      opens: metrics.opens,
      clicks: metrics.clicks,
      by_event: metrics.by_event,
      by_campaign: metrics.by_campaign,
      total_webhooks: webhooks.length,
    })
  } catch (err: unknown) {
    console.error('Email metrics error:', err)
    return res.status(500).json({ error: String(err) })
  }
}
