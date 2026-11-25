import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireMarketingAPI } from '@/lib/auth'
import { OutcomeError, followAction, getFollowups, runFollowAction } from '@/lib/marketing/sales'

/** Leads parados. GET lista · POST { action: contacted | snooze | task, lead_id, … } */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireMarketingAPI(req, res)
  } catch {
    return
  }
  try {
    if (req.method === 'GET') return res.status(200).json(await getFollowups(user))
    if (req.method === 'POST') {
      await runFollowAction(followAction.parse(req.body), user)
      return res.status(200).json({ ok: true })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message })
    if (err instanceof OutcomeError) return res.status(409).json({ error: err.message })
    console.error('[api/marketing/followups]', err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
