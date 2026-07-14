import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { resolveCrmUserFkId } from '@/lib/crm-users'
import {
  defaultObjections,
  getUserObjections,
  normalizeObjections,
  resetUserObjections,
  saveUserObjections,
  type ColdCallObjection,
} from '@/lib/coldcall/objections'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const crmUserId = await resolveCrmUserFkId(user.id)
    if (!crmUserId) {
      return res.status(400).json({ error: 'Tu usuario no está vinculado al CRM. Contacta con admin.' })
    }

    if (req.method === 'GET') {
      const data = await getUserObjections(crmUserId)
      return res.status(200).json({
        objections: { es: data.es, ca: data.ca },
        is_custom: data.isCustom,
        defaults: { es: defaultObjections('es'), ca: defaultObjections('ca') },
      })
    }

    if (req.method === 'PUT') {
      const body = req.body as {
        es?: ColdCallObjection[]
        ca?: ColdCallObjection[]
        reset?: boolean
      }

      if (body.reset) {
        await resetUserObjections(crmUserId)
        const data = await getUserObjections(crmUserId)
        return res.status(200).json({ ok: true, objections: { es: data.es, ca: data.ca }, is_custom: false })
      }

      const es = normalizeObjections(body.es ?? [], 'es')
      const ca = normalizeObjections(body.ca ?? [], 'ca')
      await saveUserObjections(crmUserId, { es, ca })
      return res.status(200).json({ ok: true, objections: { es, ca }, is_custom: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/my-objections]', error)
    return res.status(500).json({ error: 'Error al guardar objeciones' })
  }
}
