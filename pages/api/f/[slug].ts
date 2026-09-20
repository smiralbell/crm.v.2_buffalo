import type { NextApiRequest, NextApiResponse } from 'next'
import { getActiveFormBySlug, saveSubmission } from '@/lib/onboarding/public-forms'

/**
 * Público (sin sesión CRM).
 * GET  /api/f/[slug]       → HTML activo
 * POST /api/f/[slug]       → guarda envío del formulario
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = String(req.query.slug || '')
    .trim()
    .toLowerCase()
  if (!slug) return res.status(400).json({ error: 'slug requerido' })

  try {
    const form = await getActiveFormBySlug(slug)
    if (!form) {
      return res.status(404).json({ error: 'Formulario no disponible' })
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        title: form.title,
        slug: form.slug,
        html: form.html,
      })
    }

    if (req.method === 'POST') {
      let payload: Record<string, unknown> = {}
      const body = req.body

      if (body && typeof body === 'object' && !Array.isArray(body)) {
        if (body.payload && typeof body.payload === 'object') {
          payload = body.payload as Record<string, unknown>
        } else {
          payload = body as Record<string, unknown>
        }
      }

      // Limpiar campos internos
      delete payload.__buffalo_form
      delete payload.slug

      const flat: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(payload)) {
        if (!key || key.startsWith('_')) continue
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          flat[key] = value
        } else if (Array.isArray(value)) {
          flat[key] = value.map(String)
        } else if (value == null) {
          flat[key] = null
        } else {
          flat[key] = String(value)
        }
      }

      if (Object.keys(flat).length === 0) {
        return res.status(400).json({ error: 'No se recibieron campos del formulario' })
      }

      const forwarded = req.headers['x-forwarded-for']
      const ip =
        typeof forwarded === 'string'
          ? forwarded.split(',')[0]?.trim()
          : Array.isArray(forwarded)
            ? forwarded[0]
            : req.socket.remoteAddress || null
      const userAgent =
        typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null

      const submission = await saveSubmission({
        formId: form.id,
        leadId: form.lead_id,
        payload: flat,
        ip,
        userAgent,
      })

      // Avance opcional de pipeline (no bloquea si falla)
      try {
        const { advanceLeadOnGlobalPipeline } = await import('@/lib/pipelines/onboarding-global')
        await advanceLeadOnGlobalPipeline(form.lead_id, 'onboarding_recibido')
      } catch {
        /* ignore */
      }

      try {
        const { logCrmActivity } = await import('@/lib/crm/activities')
        const { prisma } = await import('@/lib/prisma')
        const lead = await prisma.lead.findUnique({
          where: { id: form.lead_id },
          select: { contact_id: true },
        })
        if (lead?.contact_id) {
          await logCrmActivity({
            contactId: lead.contact_id,
            leadId: form.lead_id,
            kind: 'onboarding',
            title: `Formulario recibido: ${form.title}`,
            body: `Slug /f/${form.slug}`,
            meta: { form_id: form.id, submission_id: submission.id },
          })
        }
      } catch {
        /* ignore */
      }

      return res.status(201).json({
        success: true,
        message: 'Formulario enviado correctamente. Gracias.',
        submission_id: submission.id,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[api/f]', error)
    return res.status(500).json({ error: 'Error al procesar el formulario' })
  }
}
