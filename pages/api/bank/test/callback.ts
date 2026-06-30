import type { NextApiRequest, NextApiResponse } from 'next'
import {
  authorizeSession,
  EnableBankingApiError,
  EnableBankingConfigError,
  type AuthorizeSessionResponse,
} from '@/lib/enable-banking/client'
import { buildFrontendReturnUrl } from '@/lib/enable-banking/config'
import { saveBankTestSession } from '@/lib/enable-banking/session-store'
import { syncEnableBankingTransactions } from '@/lib/enable-banking/sync-transactions'

function resolveValidUntil(session: AuthorizeSessionResponse): Date {
  const raw = session.access?.valid_until
  if (raw) {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  const fallback = new Date()
  fallback.setDate(fallback.getDate() + 90)
  return fallback
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const oauthError = req.query.error as string | undefined
  const oauthDesc = req.query.error_description as string | undefined
  if (oauthError) {
    const msg = oauthDesc || oauthError
    return res.redirect(buildFrontendReturnUrl(req, { status: 'error', message: msg }))
  }

  const code = req.query.code as string | undefined
  if (!code) {
    return res.redirect(
      buildFrontendReturnUrl(req, {
        status: 'error',
        message: 'No se recibió código de autorización del banco',
      })
    )
  }

  try {
    const session = await authorizeSession(code)
    const accountUids =
      session.accounts?.map((a) => a.uid).filter((uid): uid is string => Boolean(uid)) ?? []

    if (accountUids.length === 0) {
      return res.redirect(
        buildFrontendReturnUrl(req, {
          status: 'error',
          message: 'La sesión no incluyó ninguna cuenta bancaria',
        })
      )
    }

    await saveBankTestSession(accountUids, resolveValidUntil(session))

    try {
      await syncEnableBankingTransactions()
    } catch (syncErr) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[bank/test/callback] sync after connect', syncErr)
      }
    }

    return res.redirect(buildFrontendReturnUrl(req, { status: 'ok' }))
  } catch (err) {
    let message = 'Error al completar la autorización bancaria'
    if (err instanceof EnableBankingConfigError || err instanceof EnableBankingApiError) {
      message = err.message
    } else if (err instanceof Error) {
      message = err.message
    }
    if (process.env.NODE_ENV === 'development') console.error('[bank/test/callback]', err)
    return res.redirect(buildFrontendReturnUrl(req, { status: 'error', message }))
  }
}
