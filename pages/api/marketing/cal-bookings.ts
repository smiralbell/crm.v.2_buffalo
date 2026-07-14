import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { isCalBookingsReady, listCalBookingsWithLeads } from '@/lib/marketing/cal-bookings'

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
  const period = (req.query.period as string) || currentPeriod

  const ready = await isCalBookingsReady()
  if (!ready) {
    return res.status(200).json({
      bookings: [],
      period,
      configured: false,
      table_missing: true,
    })
  }

  try {
    const bookings = await listCalBookingsWithLeads(period)
    return res.status(200).json({ bookings, period, configured: true })
  } catch (err) {
    console.error('[api/marketing/cal-bookings GET]', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Error al cargar reservas Cal.com',
      configured: true,
    })
  }
}
