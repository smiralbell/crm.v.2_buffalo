import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { getCallSession } from '@/lib/coldcall/campaigns'
import { parseCampaignId, requireCampaignAccess } from '@/lib/coldcall/api-access'
import { resolveCrmUserFkId } from '@/lib/crm-users'
import { getUserObjections } from '@/lib/coldcall/objections'
import { getComercialPersonaForUserId } from '@/lib/coldcall/comercial-persona-loader'
import { applyPersonaToScriptBoxes } from '@/lib/coldcall/comercial-persona'
import {
  DEFAULT_SCRIPT_MARKDOWN_CA,
  DEFAULT_SCRIPT_MARKDOWN_ES,
  parseScriptMarkdown,
} from '@/lib/coldcall/script-parser'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const id = parseCampaignId(req)
    if (id == null) return res.status(400).json({ error: 'ID inválido' })
    if (!(await requireCampaignAccess(req, res, user, id))) return

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const leadIdParam = req.query.leadId as string | undefined
    const leadId = leadIdParam ? parseInt(leadIdParam, 10) : undefined

    const session = await getCallSession(id, Number.isFinite(leadId) ? leadId : undefined)
    if (!session) return res.status(404).json({ error: 'Campaña no encontrada' })

    const { campaign, lead, leadIds, index, prevId, nextId } = session
    const mdEs = campaign.script_markdown_es?.trim() || DEFAULT_SCRIPT_MARKDOWN_ES
    const mdCa = campaign.script_markdown_ca?.trim() || DEFAULT_SCRIPT_MARKDOWN_CA

    const persona = await getComercialPersonaForUserId(user.id)

    const crmUserId = await resolveCrmUserFkId(user.id)
    const objections = crmUserId
      ? await getUserObjections(crmUserId)
      : { es: [], ca: [], isCustom: false }

    return res.json({
      campaign,
      lead: lead
        ? {
            ...lead,
            created_at: lead.created_at instanceof Date ? lead.created_at.toISOString() : lead.created_at,
            calls: lead.calls.map((c) => ({
              ...c,
              fecha: c.fecha instanceof Date ? c.fecha.toISOString() : c.fecha,
            })),
            activities: lead.activities.map((a) => ({
              ...a,
              created_at: a.created_at instanceof Date ? a.created_at.toISOString() : a.created_at,
            })),
          }
        : null,
      leadIds,
      index,
      total: leadIds.length,
      prevId,
      nextId,
      script: {
        es: applyPersonaToScriptBoxes(parseScriptMarkdown(mdEs), persona),
        ca: applyPersonaToScriptBoxes(parseScriptMarkdown(mdCa), persona),
      },
      persona,
      objections: {
        es: objections.es,
        ca: objections.ca,
        is_custom: objections.isCustom,
      },
    })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/campaigns/[id]/call-session]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
