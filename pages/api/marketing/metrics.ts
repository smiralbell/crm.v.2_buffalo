import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/marketing/metrics?period=2026-06
// Inversión por canal del mes pedido (por defecto, el actual) y los meses que hay.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const now = new Date()
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const requestedPeriod = (req.query.period as string) || currentPeriod

  try {
    const [rows, periods] = await Promise.all([
      prisma.marketingMetric.findMany({
        where: { period: requestedPeriod },
        orderBy: { channel: 'asc' },
        select: { id: true, channel: true, period: true, spend: true },
      }),
      prisma.marketingMetric.findMany({
        select: { period: true },
        distinct: ['period'],
        orderBy: { period: 'desc' },
      }),
    ])

    return res.status(200).json({
      period: requestedPeriod,
      periods: periods.map((p) => p.period),
      metrics: rows.map((m) => ({ ...m, spend: Number(m.spend) })),
    })
  } catch (error) {
    console.error('[api/marketing/metrics]', error)
    return res.status(500).json({ error: 'Error fetching marketing metrics' })
  }
}
