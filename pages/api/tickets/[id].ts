import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTicketsWebhookUrl } from '@/lib/tickets/config'

const VALID_STATUS = new Set(['open', 'in_progress', 'resolved', 'closed'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const id = req.query.id as string
  if (!id) return res.status(400).json({ error: 'ID requerido' })

  if (req.method === 'GET') {
    try {
      const rows = await prisma.$queryRaw<
        {
          id: string
          project_id: string
          project_name: string
          config_ref: string | null
          title: string
          description: string | null
          priority: string
          status: string
          reporter_name: string | null
          reporter_email: string | null
          source: string
          external_id: string | null
          payload: unknown
          custom_fields: unknown
          created_at: Date
          updated_at: Date
        }[]
      >`
        SELECT
          t.id, t.project_id, p.name AS project_name, p.config_ref,
          t.title, t.description, t.priority, t.status,
          t.reporter_name, t.reporter_email, t.source, t.external_id,
          t.payload, t.custom_fields, t.created_at, t.updated_at
        FROM tickets t
        JOIN proyectos p ON p.id = t.project_id
        WHERE t.id = ${id}::uuid
        LIMIT 1
      `

      const row = rows[0]
      if (!row) return res.status(404).json({ error: 'Ticket no encontrado' })

      const fields = await prisma.$queryRaw<
        { field_key: string; sample_value: string | null; occurrence_count: number }[]
      >`
        SELECT field_key, sample_value, occurrence_count
        FROM ticket_field_discoveries
        WHERE project_id = ${row.project_id}::uuid
        ORDER BY occurrence_count DESC, field_key
      `

      return res.status(200).json({
        ticket: {
          ...row,
          created_at: row.created_at.toISOString(),
          updated_at: row.updated_at.toISOString(),
        },
        discovered_fields: fields,
        webhook_url: getTicketsWebhookUrl(req),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno'
      if (process.env.NODE_ENV === 'development') console.error('[tickets/[id] GET]', err)
      return res.status(500).json({ error: msg })
    }
  }

  if (req.method === 'PATCH') {
    const { status } = req.body || {}
    if (!status || !VALID_STATUS.has(status)) {
      return res.status(400).json({
        error: 'status inválido',
        allowed: Array.from(VALID_STATUS),
      })
    }

    try {
      await prisma.$executeRaw`
        UPDATE tickets SET status = ${status}, updated_at = NOW()
        WHERE id = ${id}::uuid
      `
      return res.status(200).json({ ok: true, status })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno'
      return res.status(500).json({ error: msg })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
