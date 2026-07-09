import type { NextApiRequest, NextApiResponse } from 'next'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { generateProjectAiAnalysis } from '@/lib/gestion-proyecto/ai-analysis'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  if (!projectId) return res.status(400).json({ error: 'ID de proyecto requerido' })

  try {
    await requireProjectAccessAPI(req, res, projectId)

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { summary, model } = await generateProjectAiAnalysis(projectId)
    return res.status(200).json({
      analysis: {
        summary,
        model,
        created_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (['Forbidden', 'No session', 'Invalid session'].includes(msg)) return
    if (msg.includes('OPENROUTER')) {
      return res.status(503).json({ error: 'IA no configurada (OPENROUTER_API_KEY)' })
    }
    console.error('[gestion-proyecto/ai-analysis]', error)
    return res.status(500).json({ error: msg || 'Error al generar análisis' })
  }
}
