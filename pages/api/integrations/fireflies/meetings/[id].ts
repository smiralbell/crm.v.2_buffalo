import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getMeetingById,
  ignoreMeeting,
  linkMeetingToLead,
  toMeetingDto,
  unlinkMeeting,
} from '@/lib/integrations/fireflies/store'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const id = String(req.query.id || '')
  if (!id) return res.status(400).json({ error: 'id requerido' })

  if (req.method === 'GET') {
    try {
      const row = await getMeetingById(id)
      if (!row) return res.status(404).json({ error: 'Reunión no encontrada' })
      const includeTranscript = String(req.query.transcript || '') === '1'
      return res.status(200).json({ ok: true, meeting: toMeetingDto(row, includeTranscript) })
    } catch (err) {
      console.error('[api/integrations/fireflies/meetings/[id] GET]', err)
      return res.status(500).json({ error: 'Error' })
    }
  }

  if (req.method === 'PATCH') {
    const action = String(req.body?.action || '')
    try {
      if (action === 'unlink') {
        const row = await unlinkMeeting(id)
        if (!row) return res.status(404).json({ error: 'Reunión no encontrada' })
        return res.status(200).json({ ok: true, meeting: toMeetingDto(row, false) })
      }

      if (action === 'ignore') {
        const row = await ignoreMeeting(id)
        if (!row) return res.status(404).json({ error: 'Reunión no encontrada' })
        return res.status(200).json({ ok: true, meeting: toMeetingDto(row, false) })
      }

      if (action === 'link') {
        const leadId = Number(req.body?.lead_id)
        if (!Number.isFinite(leadId) || leadId <= 0) {
          return res.status(400).json({ error: 'lead_id inválido' })
        }
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          select: { id: true, contact_id: true },
        })
        if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })
        const row = await linkMeetingToLead(id, lead.id, lead.contact_id, 'manual')
        if (!row) return res.status(404).json({ error: 'Reunión no encontrada' })
        const { routeAfterManualLink } = await import(
          '@/lib/integrations/fireflies/route-meeting'
        )
        const routed = await routeAfterManualLink(row)
        const refreshed = (await getMeetingById(id)) || row
        return res.status(200).json({
          ok: true,
          meeting: toMeetingDto(refreshed, false),
          routed,
        })
      }

      return res.status(400).json({ error: 'action debe ser link | unlink | ignore' })
    } catch (err) {
      console.error('[api/integrations/fireflies/meetings/[id] PATCH]', err)
      return res.status(500).json({ error: 'Error actualizando reunión' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
