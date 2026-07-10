import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { getCampaignById, saveCampaignScript } from '@/lib/coldcall/campaigns'
import {
  DEFAULT_SCRIPT_MARKDOWN_CA,
  DEFAULT_SCRIPT_MARKDOWN_ES,
} from '@/lib/coldcall/script-parser'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!requireColdCallAPI(req, res)) return

    const id = parseInt(String(req.query.id), 10)
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' })

    const campaign = await getCampaignById(id)
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' })

    if (req.method === 'GET') {
      return res.status(200).json({
        script_markdown_es: campaign.script_markdown_es || DEFAULT_SCRIPT_MARKDOWN_ES,
        script_markdown_ca: campaign.script_markdown_ca || DEFAULT_SCRIPT_MARKDOWN_CA,
        is_custom_es: Boolean(campaign.script_markdown_es?.trim()),
        is_custom_ca: Boolean(campaign.script_markdown_ca?.trim()),
      })
    }

    if (req.method === 'PUT') {
      const { script_markdown_es, script_markdown_ca } = req.body as {
        script_markdown_es?: string
        script_markdown_ca?: string
      }
      await saveCampaignScript(id, { script_markdown_es, script_markdown_ca })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[coldcall/campaigns/[id]/script]', error)
    return res.status(500).json({ error: 'Error al guardar guión' })
  }
}
