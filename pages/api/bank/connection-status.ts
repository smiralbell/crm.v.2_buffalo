import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getBankConnectionStatus } from '@/lib/enable-banking/connection-status'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const status = await getBankConnectionStatus()
    return res.status(200).json(status)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al leer conexión bancaria'
    if (msg.includes('bank_connections') || msg.includes('does not exist')) {
      return res.status(200).json({
        connected: false,
        account_uid: null,
        valid_until: null,
        days_remaining: null,
        expires_soon: false,
        needs_migration: true,
      })
    }
    return res.status(500).json({ error: msg })
  }
}
