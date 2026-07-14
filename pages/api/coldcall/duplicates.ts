import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { getColdCallScope } from '@/lib/coldcall/scope'
import { assertCampaignAccess } from '@/lib/coldcall/scope'
import {
  findCrossCampaignDuplicates,
  planDuplicateCleanup,
  softDeleteProspects,
  type DuplicateCleanupStrategy,
} from '@/lib/coldcall/duplicates'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const scope = await getColdCallScope(user)

    if (req.method === 'GET') {
      const campaignIdParam = req.query.campaignId as string | undefined
      const campaignId = campaignIdParam ? parseInt(campaignIdParam, 10) : undefined

      if (campaignId != null && Number.isFinite(campaignId)) {
        try {
          await assertCampaignAccess(scope, campaignId)
        } catch {
          return res.status(403).json({ error: 'Acceso denegado' })
        }
      }

      const groups = await findCrossCampaignDuplicates(
        scope,
        Number.isFinite(campaignId) ? { campaignId } : {}
      )

      const duplicateProspectIds = new Set<number>()
      for (const g of groups) {
        for (const p of g.prospects) duplicateProspectIds.add(p.id)
      }

      return res.status(200).json({
        groups,
        summary: {
          groups: groups.length,
          prospects: duplicateProspectIds.size,
          removable: groups.reduce((n, g) => n + g.prospects.length - 1, 0),
        },
      })
    }

    if (req.method === 'POST') {
      const body = req.body as {
        campaign_id?: number
        strategy?: DuplicateCleanupStrategy
        keep_ids?: number[]
        dry_run?: boolean
      }

      const strategy = body.strategy ?? 'keep_most_calls'
      const campaignId = body.campaign_id
      if (campaignId != null) {
        try {
          await assertCampaignAccess(scope, campaignId)
        } catch {
          return res.status(403).json({ error: 'Acceso denegado' })
        }
      }

      const groups = await findCrossCampaignDuplicates(
        scope,
        campaignId != null ? { campaignId } : {}
      )

      if (!groups.length) {
        return res.status(200).json({
          ok: true,
          dry_run: Boolean(body.dry_run),
          deleted: 0,
          keep_ids: [],
          delete_ids: [],
        })
      }

      const plan = planDuplicateCleanup(groups, strategy, campaignId, body.keep_ids)

      if (body.dry_run) {
        return res.status(200).json({
          ok: true,
          dry_run: true,
          deleted: plan.delete_ids.length,
          keep_ids: plan.keep_ids,
          delete_ids: plan.delete_ids,
          groups,
        })
      }

      const deleted = await softDeleteProspects(scope, plan.delete_ids)
      return res.status(200).json({
        ok: true,
        dry_run: false,
        deleted,
        keep_ids: plan.keep_ids,
        delete_ids: plan.delete_ids,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/duplicates]', error)
    return res.status(500).json({ error: 'Error al procesar duplicados' })
  }
}
