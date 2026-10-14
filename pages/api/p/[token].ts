import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { query } from '@/lib/db'
import { resolvePortalToken } from '@/lib/portal/links'
import { insertTicket } from '@/lib/tickets/store'
import { alertTeamOfNewTicket } from '@/lib/tickets/team-alerts'

/**
 * Portal del cliente (público, sin sesión CRM; acceso por enlace mágico).
 * GET  /api/p/[token]  → proyecto + sus tickets con respuestas
 * POST /api/p/[token]  → abre un ticket nuevo
 */
const newTicketSchema = z.object({
  title: z.string().trim().min(3, 'Escribe un título').max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  reporter_name: z.string().trim().max(120).optional().nullable(),
  reporter_email: z.string().trim().email('Email no válido').max(200).optional().nullable().or(z.literal('')),
})

// Límite sencillo por enlace: 10 tickets por hora y proceso
const recent = new Map<string, number[]>()
function allowCreate(linkId: string): boolean {
  const now = Date.now()
  const list = (recent.get(linkId) || []).filter((t) => now - t < 3_600_000)
  if (list.length >= 10) return false
  list.push(now)
  recent.set(linkId, list)
  return true
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  const token = String(req.query.token || '')

  let access: Awaited<ReturnType<typeof resolvePortalToken>> = null
  try {
    access = await resolvePortalToken(token)
  } catch {
    access = null
  }
  if (!access) return res.status(404).json({ error: 'Enlace no válido o caducado' })

  try {
    if (req.method === 'GET') {
      const tickets = await query<{
        id: string
        title: string
        description: string | null
        priority: string
        status: string
        created_at: Date
        updated_at: Date
      }>(
        `SELECT id, title, description, priority, status, created_at, updated_at
           FROM tickets WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [access.projectId]
      )
      const ids = tickets.rows.map((t) => t.id)
      const updates = ids.length
        ? await query<{ ticket_id: string; author_name: string | null; message: string; status: string | null; is_from_client: boolean; created_at: Date }>(
            `SELECT ticket_id, author_name, message, status, is_from_client, created_at
               FROM ticket_updates WHERE ticket_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
            [ids]
          )
        : { rows: [] }
      const byTicket = new Map<string, typeof updates.rows>()
      for (const u of updates.rows) byTicket.set(u.ticket_id, [...(byTicket.get(u.ticket_id) || []), u])
      return res.status(200).json({
        project: { name: access.projectName },
        tickets: tickets.rows.map((t) => ({ ...t, updates: byTicket.get(t.id) || [] })),
      })
    }

    if (req.method === 'POST') {
      const data = newTicketSchema.parse(req.body || {})
      if (!allowCreate(access.linkId)) {
        return res.status(429).json({ error: 'Has abierto muchos tickets seguidos. Prueba en un rato.' })
      }
      const result = await insertTicket(access.projectId, {
        title: data.title,
        description: data.description || null,
        priority: data.priority || 'medium',
        status: 'open',
        reporter_name: data.reporter_name || null,
        reporter_email: data.reporter_email || null,
        source: 'portal',
        external_id: null,
        payload: { via: 'portal' },
        custom_fields: {},
      })
      void alertTeamOfNewTicket({
        ticketId: result.id,
        projectId: access.projectId,
        projectName: access.projectName,
        title: data.title,
        priority: data.priority || 'medium',
      })
      return res.status(201).json({ ok: true, ticket_id: result.id })
    }

    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0]?.message || 'Datos no válidos' })
    console.error('[portal]', e)
    return res.status(500).json({ error: 'No se pudo completar la operación' })
  }
}
