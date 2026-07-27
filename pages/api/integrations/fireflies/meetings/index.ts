import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import {
  listRecentMeetings,
  listUnmatchedMeetings,
  toMeetingDto,
} from '@/lib/integrations/fireflies/store'
import { isFirefliesConfigured } from '@/lib/integrations/fireflies/client'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const unmatchedOnly = String(req.query.unmatched || '') === '1'
  const limit = Number(req.query.limit || 40)

  try {
    const rows = unmatchedOnly
      ? await listUnmatchedMeetings(limit)
      : await listRecentMeetings(limit)

    return res.status(200).json({
      ok: true,
      configured: isFirefliesConfigured(),
      meetings: rows.map((r) => toMeetingDto(r, false)),
    })
  } catch (err) {
    console.error('[api/integrations/fireflies/meetings]', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Error listando reuniones',
    })
  }
}
