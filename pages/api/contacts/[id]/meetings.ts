import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import {
  listMeetingsForContact,
  toMeetingDto,
} from '@/lib/integrations/fireflies/store'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const contactId = Number(req.query.id)
  if (!Number.isFinite(contactId) || contactId <= 0) {
    return res.status(400).json({ error: 'contact id inválido' })
  }

  try {
    const rows = await listMeetingsForContact(contactId)
    return res.status(200).json({
      ok: true,
      meetings: rows.map((r) => toMeetingDto(r, false)),
    })
  } catch (err) {
    console.error('[api/contacts/[id]/meetings]', err)
    return res.status(500).json({ error: 'Error listando reuniones del contacto' })
  }
}
