import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { ensureRecurringInvoiceColumns } from '@/lib/invoices/recurring'
import { sendRecurringEmailNow } from '@/lib/invoices/recurring-email'

/**
 * POST /api/invoices/recurring/[id]/email-send
 *   { mode: 'test', to?: string } → prueba a ti (o a quien digas), con la última factura si hay
 *   { mode: 'now' }               → manda ya la última factura creada al cliente
 */
const bodySchema = z.object({
  mode: z.enum(['test', 'now']),
  to: z.string().max(500).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  if (user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const id = req.query.id
  if (typeof id !== 'string' || !id) return res.status(400).json({ error: 'ID inválido' })

  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' })

  try {
    await ensureRecurringInvoiceColumns()
    const testTo = parsed.data.mode === 'test' ? parsed.data.to?.trim() || user.email : undefined
    const result = await sendRecurringEmailNow(id, parsed.data.mode, testTo)
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.status(200).json(result)
  } catch (error) {
    console.error('[recurring-email-send]', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo enviar' })
  }
}
