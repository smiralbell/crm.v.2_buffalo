import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI, requireColdCallAPI } from '@/lib/auth'
import { resolveCrmUserFkId } from '@/lib/crm-users'
import {
  createProspectRequest,
  listPendingProspectRequests,
  resolveProspectRequest,
} from '@/lib/coldcall/prospect-requests'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      await requireAdminAPI(req, res)
      const requests = await listPendingProspectRequests()
      return res.status(200).json({ requests, count: requests.length })
    }

    if (req.method === 'POST') {
      const user = await requireColdCallAPI(req, res)
      if (user.role !== 'comercial') {
        return res.status(403).json({ error: 'Solo comerciales pueden enviar solicitudes' })
      }

      const { campaign_id } = req.body as { campaign_id?: number | null }
      const campaignId =
        campaign_id != null && Number.isFinite(Number(campaign_id))
          ? Number(campaign_id)
          : null

      const requestedByUserId = await resolveCrmUserFkId(user.id)
      if (!requestedByUserId) {
        return res.status(400).json({ error: 'Usuario no vinculado al CRM' })
      }

      const result = await createProspectRequest({
        requestedByUserId,
        campaignId,
      })

      return res.status(result.created ? 201 : 200).json(result)
    }

    if (req.method === 'PATCH') {
      const admin = await requireAdminAPI(req, res)
      const { id } = req.body as { id?: number }
      if (!id || !Number.isFinite(Number(id))) {
        return res.status(400).json({ error: 'ID inválido' })
      }

      const resolvedByUserId = await resolveCrmUserFkId(admin.id)
      const request = await resolveProspectRequest(Number(id), resolvedByUserId ?? admin.id)
      if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' })

      return res.status(200).json({ request })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/prospect-requests]', error)
    const msg = error instanceof Error ? error.message : 'Error en solicitudes'
    return res.status(500).json({ error: msg })
  }
}
