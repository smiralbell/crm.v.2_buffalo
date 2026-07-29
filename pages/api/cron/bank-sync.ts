import type { NextApiRequest, NextApiResponse } from 'next'
import { EnableBankingApiError, EnableBankingConfigError } from '@/lib/enable-banking/client'
import {
  isBankSyncStale,
  runDailyBankSyncIfDue,
} from '@/lib/enable-banking/daily-sync-scheduler'
import { getLatestBankTestSession } from '@/lib/enable-banking/session-store'
import { syncEnableBankingTransactions } from '@/lib/enable-banking/sync-transactions'

/**
 * Sync bancaria programable (EasyPanel / crontab / Vercel Cron).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>  o  ?secret=<CRON_SECRET>
 * Query: force=1  → sync aunque el último sea reciente
 *        mode=full|incremental (default incremental)
 *
 * GET o POST.
 */
function authorize(req: NextApiRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return false

  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const querySecret =
    typeof req.query.secret === 'string' ? req.query.secret.trim() : ''
  const provided = bearer || querySecret
  return provided.length > 0 && provided === expected
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  if (!process.env.CRON_SECRET?.trim()) {
    return res.status(503).json({
      error: 'CRON_SECRET no configurado',
      hint: 'Define CRON_SECRET en el entorno para habilitar este endpoint',
    })
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  const force = req.query.force === '1' || req.query.force === 'true'
  const mode = req.query.mode === 'full' ? 'full' : 'incremental'

  try {
    if (!force) {
      const outcome = await runDailyBankSyncIfDue('cron')
      if (!outcome.ran) {
        return res.status(200).json({
          ok: true,
          ran: false,
          skipped: outcome.skipped,
          error: outcome.error || null,
        })
      }
      return res.status(200).json({ ok: true, ran: true, ...outcome.result })
    }

    const session = await getLatestBankTestSession()
    if (!session) {
      return res.status(404).json({ error: 'no_session', message: 'No hay conexión bancaria activa' })
    }
    if (!isBankSyncStale(session.last_synced_at) && !force) {
      return res.status(200).json({ ok: true, ran: false, skipped: 'already_fresh' })
    }

    const result = await syncEnableBankingTransactions({ mode })
    return res.status(200).json({ ok: true, ran: true, ...result })
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
