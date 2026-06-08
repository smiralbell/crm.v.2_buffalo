import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/webhooks/instantly/debug-logs
 * Lee los webhooks capturados en debug
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  const { limit = '50' } = req.query

  try {
    const logs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, payload, headers, created_at
       FROM "instantly_webhooks_debug"
       ORDER BY created_at DESC
       LIMIT $1`,
      parseInt(limit as string)
    )

    return res.json({ logs, count: logs.length })
  } catch (err: unknown) {
    console.error('Debug logs error:', err)
    return res.status(500).json({ error: String(err) })
  }
}
