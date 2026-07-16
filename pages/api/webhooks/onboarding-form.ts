import type { NextApiRequest, NextApiResponse } from 'next'
import {
  advanceLeadOnGlobalByContactEmail,
  advanceLeadOnGlobalPipeline,
} from '@/lib/pipelines/onboarding-global'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/webhooks/onboarding-form
 * Recibe el formulario de onboarding del cliente (onboarding.html o n8n).
 * Avanza el lead a EN DESARROLLO en el pipeline global.
 *
 * Auth opcional: header Authorization: Bearer <ONBOARDING_FORM_WEBHOOK_TOKEN>
 * o sin token si ONBOARDING_FORM_WEBHOOK_TOKEN no está definido.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const expected = process.env.ONBOARDING_FORM_WEBHOOK_TOKEN?.trim()
  if (expected) {
    const auth = req.headers.authorization || ''
    const token = auth.replace(/^Bearer\s+/i, '').trim()
    if (token !== expected) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    const body = req.body || {}
    const cfg = body.config || body.cfg || {}
    const datos = body.datos || {}

    const leadIdRaw = cfg.leadId || body.leadId || datos.leadId
    const leadId = leadIdRaw != null ? parseInt(String(leadIdRaw), 10) : NaN

    const email =
      (datos.contacto_email || cfg.email || body.email || '').toString().trim() || null

    let result
    if (!Number.isNaN(leadId) && leadId > 0) {
      result = await advanceLeadOnGlobalPipeline(leadId, 'onboarding_recibido')
      await prisma.lead
        .update({
          where: { id: leadId },
          data: { estado: 'activo', ultima_interaccion: new Date() },
        })
        .catch(() => {})
    } else if (email) {
      result = await advanceLeadOnGlobalByContactEmail(email, 'onboarding_recibido')
    } else {
      return res.status(400).json({
        error: 'Falta leadId o email en el payload',
        ok: false,
      })
    }

    console.log('[webhooks/onboarding-form]', {
      leadId: Number.isNaN(leadId) ? null : leadId,
      email,
      result,
    })

    return res.status(200).json({ ...result, ok: result.ok !== false })
  } catch (err) {
    console.error('[webhooks/onboarding-form]', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Error interno',
    })
  }
}
