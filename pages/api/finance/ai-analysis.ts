import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import {
  generateFinanceAiAnalysis,
  getLatestFinanceAiAnalysis,
  saveFinanceAiAnalysis,
} from '@/lib/finance/ai-analysis'
import { parsePeriodFromQuery } from '@/lib/finance/period-presets'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method === 'GET') {
    try {
      const latest = await getLatestFinanceAiAnalysis()
      return res.status(200).json({ analysis: latest })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al leer análisis'
      return res.status(500).json({ error: msg })
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
      const period = parsePeriodFromQuery(
        (body.start as string) || (req.query.start as string),
        (body.end as string) || (req.query.end as string)
      )
      const { summary, model } = await generateFinanceAiAnalysis(period)
      let id: string | null = null
      try {
        id = await saveFinanceAiAnalysis(summary, model)
      } catch (saveErr) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[finance/ai-analysis] no se pudo guardar (¿tabla finance_ai_analyses?)', saveErr)
        }
      }
      return res.status(200).json({
        analysis: {
          id: id ?? 'unsaved',
          summary,
          model,
          created_at: new Date().toISOString(),
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al generar análisis IA'
      if (msg.includes('OPENROUTER_API_KEY')) {
        return res.status(503).json({ error: msg })
      }
      console.error('[finance/ai-analysis]', err)
      return res.status(500).json({ error: msg })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
