import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { getCampaignById, saveCampaignPresentation } from '@/lib/coldcall/campaigns'
import { parseCampaignId, requireCampaignAccess } from '@/lib/coldcall/api-access'
import {
  DEFAULT_PRESENTATION_URL,
  isValidPresentationUrl,
  resolvePresentationUrl,
} from '@/lib/coldcall/presentation-link'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const id = parseCampaignId(req)
    if (id == null) return res.status(400).json({ error: 'ID inválido' })
    if (!(await requireCampaignAccess(req, res, user, id))) return

    const campaign = await getCampaignById(id)
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' })

    if (req.method === 'GET') {
      return res.status(200).json({
        presentation_url: campaign.presentation_url,
        effective_url: resolvePresentationUrl(campaign.presentation_url),
        default_url: DEFAULT_PRESENTATION_URL,
        is_custom: Boolean(campaign.presentation_url?.trim()),
      })
    }

    if (req.method === 'PUT') {
      const { presentation_url } = req.body as { presentation_url?: string | null }
      const value =
        presentation_url == null || presentation_url === ''
          ? null
          : String(presentation_url).trim()

      if (value && !isValidPresentationUrl(value)) {
        return res.status(400).json({ error: 'URL inválida (usa http:// o https://)' })
      }

      await saveCampaignPresentation(id, value)
      return res.status(200).json({
        ok: true,
        presentation_url: value,
        effective_url: resolvePresentationUrl(value),
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/campaigns/[id]/presentation]', error)
    return res.status(500).json({ error: 'Error al guardar presentación' })
  }
}
