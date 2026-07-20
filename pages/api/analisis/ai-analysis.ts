import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI } from '@/lib/auth'
import {
  ensureCrmAiAnalysesTable,
  generateCrmCompanyAiAnalysis,
  getLatestCrmCompanyAiAnalysis,
  saveCrmCompanyAiAnalysis,
} from '@/lib/analisis/ai-analysis'

export const config = {
  api: {
    responseLimit: false,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
  } catch {
    return
  }

  if (req.method === 'GET') {
    try {
      const latest = await getLatestCrmCompanyAiAnalysis()
      return res.status(200).json({ analysis: latest })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al leer análisis'
      return res.status(500).json({ error: msg })
    }
  }

  if (req.method === 'POST') {
    try {
      await ensureCrmAiAnalysesTable()
      const { summary, model, snapshot } = await generateCrmCompanyAiAnalysis()
      let id: string | null = null
      try {
        id = await saveCrmCompanyAiAnalysis(summary, model, snapshot)
      } catch (saveErr) {
        console.warn('[analisis/ai-analysis] no se pudo guardar', saveErr)
      }
      return res.status(200).json({
        analysis: {
          id: id || 'ephemeral',
          summary,
          model,
          created_at: new Date().toISOString(),
        },
        snapshot_preview: {
          open_count: snapshot.proyectos.open_count,
          open_setup_eur: snapshot.proyectos.open_setup_eur,
          open_mrr_eur: snapshot.proyectos.open_mrr_eur,
          generated_at: snapshot.generated_at,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al generar análisis'
      if (msg.includes('OPENROUTER_API_KEY')) {
        return res.status(503).json({ error: 'IA no configurada (OPENROUTER_API_KEY)' })
      }
      console.error('[analisis/ai-analysis]', err)
      return res.status(500).json({ error: msg })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
