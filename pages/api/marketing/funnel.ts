import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireMarketingAPI } from '@/lib/auth'
import { getFunnel } from '@/lib/marketing/sales'

const q = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  months: z.enum(['1', '3', '6']).default('3'),
})

/** Embudo por canal hasta el cierre (solo lectura). GET ?period=YYYY-MM&months=1|3|6 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireMarketingAPI(req, res)
  } catch {
    return
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { period, months } = q.parse(req.query)
    return res.status(200).json(await getFunnel(period, Number(months)))
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Periodo inválido' })
    console.error('[api/marketing/funnel]', err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
