import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { listMeetingsForLead, toMeetingDto } from '@/lib/integrations/fireflies/store'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const leadId = Number(req.query.id)
  if (!Number.isFinite(leadId) || leadId <= 0) {
    return res.status(400).json({ error: 'lead id inválido' })
  }

  try {
    const rows = await listMeetingsForLead(leadId)
    return res.status(200).json({
      ok: true,
      meetings: rows.map((r) => toMeetingDto(r, false)),
    })
  } catch (err) {
    console.error('[api/leads/[id]/meetings]', err)
    return res.status(500).json({ error: 'Error listando reuniones del lead' })
  }
}
