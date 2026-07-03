import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { generateIncomeAiAnalysis } from '@/lib/finance/income-ai-analysis'

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
    const { start, end } = (req.body || {}) as { start?: string; end?: string }
    const { summary, model } = await generateIncomeAiAnalysis(start, end)
    return res.status(200).json({
      analysis: {
        summary,
        model,
        created_at: new Date().toISOString(),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al generar análisis'
    if (msg.includes('OPENROUTER_API_KEY')) {
      return res.status(503).json({ error: msg })
    }
    console.error('[finance/incomes-ai-analysis]', err)
    return res.status(500).json({ error: msg })
  }
}
