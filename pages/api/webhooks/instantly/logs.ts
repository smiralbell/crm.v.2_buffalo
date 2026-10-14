import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/webhooks/instantly/logs
 * Obtiene los webhooks recibidos de Instantly
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }
  if (req.method !== 'GET') return res.status(405).end()

  const { limit = '100', offset = '0', event_type = '', email = '' } = req.query as Record<string, string>

  try {
    // Construir WHERE
    let where = ''
    const params: (string | number)[] = []
    if (event_type) {
      where += `event_type = $${params.length + 1}`
      params.push(event_type)
    }
    if (email) {
      if (where) where += ' AND '
      where += `email ILIKE $${params.length + 1}`
      params.push(`%${email}%`)
    }
    const whereClause = where ? `WHERE ${where}` : ''

    // Count total
    const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM "instantly_webhooks" ${whereClause}`,
      ...params
    )
    const total = Number(countResult[0]?.count || 0)

    // Get logs
    const logs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, event_type, email, campaign_id, campaign_name, status, created_at
       FROM "instantly_webhooks"
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      ...params,
      parseInt(limit),
      parseInt(offset)
    )

    return res.json({ logs, total, limit: parseInt(limit), offset: parseInt(offset) })

  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : ''
    if (code === '42P01' || (err instanceof Error && err.message.includes('does not exist'))) {
      return res.json({ logs: [], total: 0, limit: parseInt(limit), offset: parseInt(offset) })
    }
    console.error('Webhook logs error:', err)
    const msg = err instanceof Error ? err.message : 'Error'
    return res.status(500).json({ error: msg })
  }
}
