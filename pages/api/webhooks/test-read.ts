import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const logs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "instantly_webhooks_debug" ORDER BY created_at DESC LIMIT 10`
    )
    return res.json({ count: logs.length, logs })
  } catch (err: unknown) {
    return res.status(500).json({ error: String(err) })
  }
}
