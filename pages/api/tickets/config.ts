import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { listProjectTicketConfigs, saveProjectTicketConfig } from '@/lib/tickets/updates'
import { TICKETS_WEBHOOK_TOKEN, getTicketsWebhookUrl } from '@/lib/tickets/config'
import { incidentsWebhookToken, incidentsWebhookUrl } from '@/lib/retencion/incidents'

/** Lo que el panel de cada cliente necesita para hablar con el CRM (igual para todos). */
function connection(req: NextApiRequest) {
  return {
    tickets_webhook_url: getTicketsWebhookUrl(req),
    tickets_webhook_token: TICKETS_WEBHOOK_TOKEN,
    incidents_webhook_url: incidentsWebhookUrl(),
    incidents_webhook_token: incidentsWebhookToken(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method === 'GET') {
    try {
      const rows = await listProjectTicketConfigs()
      return res.status(200).json({
        connection: connection(req),
        projects: rows.map((p) => ({
          id: p.id,
          name: p.name,
          config_ref: p.config_ref,
          ticket_callback_url: p.ticket_callback_url,
          ticket_callback_token: p.ticket_callback_token,
          ticket_count: Number(p.ticket_count),
        })),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno'
      if (msg.includes('ticket_callback_url') || msg.includes('does not exist')) {
        return res.status(200).json({ connection: connection(req), projects: [], needs_migration: true })
      }
      return res.status(500).json({ error: msg })
    }
  }

  if (req.method === 'PATCH') {
    const { project_id, ticket_callback_url, ticket_callback_token } = req.body || {}
    if (!project_id || typeof project_id !== 'string') {
      return res.status(400).json({ error: 'project_id requerido' })
    }

    const callbackUrl =
      typeof ticket_callback_url === 'string' ? ticket_callback_url.trim() || null : null
    const callbackToken =
      typeof ticket_callback_token === 'string' ? ticket_callback_token.trim() || null : null

    try {
      await saveProjectTicketConfig({
        projectId: project_id,
        callbackUrl,
        callbackToken,
      })
      return res.status(200).json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno'
      return res.status(500).json({ error: msg })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
