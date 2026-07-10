import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { getCallSession } from '@/lib/coldcall/campaigns'
import {
  DEFAULT_SCRIPT_MARKDOWN_CA,
  DEFAULT_SCRIPT_MARKDOWN_ES,
  parseScriptMarkdown,
} from '@/lib/coldcall/script-parser'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireColdCallAPI(req, res)) return

  const id = parseInt(String(req.query.id), 10)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' })

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const leadIdParam = req.query.leadId as string | undefined
  const leadId = leadIdParam ? parseInt(leadIdParam, 10) : undefined

  const session = await getCallSession(id, Number.isFinite(leadId) ? leadId : undefined)
  if (!session) return res.status(404).json({ error: 'Campaña no encontrada' })

  const { campaign, lead, leadIds, index, prevId, nextId } = session
  const mdEs = campaign.script_markdown_es?.trim() || DEFAULT_SCRIPT_MARKDOWN_ES
  const mdCa = campaign.script_markdown_ca?.trim() || DEFAULT_SCRIPT_MARKDOWN_CA

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
      es: parseScriptMarkdown(mdEs),
      ca: parseScriptMarkdown(mdCa),
    },
  })
}
