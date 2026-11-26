import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { EnableBankingApiError, EnableBankingConfigError } from '@/lib/enable-banking/client'
import { psuFromRequest, withPsu } from '@/lib/enable-banking/psu-context'
import { getLatestBankTestSession } from '@/lib/enable-banking/session-store'
import { syncEnableBankingTransactions } from '@/lib/enable-banking/sync-transactions'

/** Con ?auto=1 (al abrir Finanzas) no se repite si se sincronizó hace menos de esto. */
const AUTO_MIN_GAP_MS = 3 * 60_000

/**
 * POST: trae del banco los movimientos nuevos. Lo lanza alguien desde el CRM, así que va
 * con sus datos de PSU (IP y navegador) y no cuenta para el límite diario de PSD2.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    if (req.query.auto === '1') {
      const session = await getLatestBankTestSession()
      const last = session?.last_synced_at?.getTime() ?? 0
      if (session && Date.now() - last < AUTO_MIN_GAP_MS) {
        return res.status(200).json({ ok: true, skipped: 'fresh', inserted: 0, last_synced_at: session.last_synced_at })
      }
    }
    const mode = req.query.mode === 'full' ? 'full' : 'incremental'
    const result = await withPsu(psuFromRequest(req), () => syncEnableBankingTransactions({ mode }))
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof EnableBankingConfigError) {
      return res.status(503).json({ error: err.message })
    }
    if (err instanceof EnableBankingApiError) {
      return res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
        error: err.message,
      })
    }
    const msg = err instanceof Error ? err.message : 'Error al sincronizar'
    if (msg.includes('No hay conexión bancaria activa')) {
      return res.status(404).json({ error: 'no_session', message: msg })
    }
    return res.status(500).json({ error: msg })
  }
}
