import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  createForm,
  deleteForm,
  listFormsByLead,
  listSubmissions,
  updateForm,
} from '@/lib/onboarding/public-forms'
import { getPublicFormsBaseUrl } from '@/lib/onboarding/public-forms-url'

/** HTML completo (CSS + scripts + logos base64) puede superar 1 MB */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(2).max(64),
  html: z.string().min(1).max(12_000_000),
})

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(2).max(64).optional(),
  html: z.string().min(1).max(12_000_000).optional(),
  is_active: z.boolean().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)

    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    if (req.method === 'GET') {
      // Runtime, no build-time: cambiar el dominio de formularios en EasyPanel
      // solo requiere reiniciar el servicio, no reconstruir la imagen.
      const formsBaseUrl = getPublicFormsBaseUrl()
      const forms = await listFormsByLead(leadId)
      const formId = typeof req.query.formId === 'string' ? req.query.formId : null
      if (formId) {
        const submissions = await listSubmissions(formId, leadId)
        return res.status(200).json({ forms, submissions, formsBaseUrl })
      }
      return res.status(200).json({ forms, formsBaseUrl })
    }

    if (req.method === 'POST') {
      const data = createSchema.parse(req.body)
      const form = await createForm({
        leadId,
        title: data.title || 'Formulario',
        slug: data.slug,
        html: data.html,
      })
      return res.status(201).json({ form })
    }

    if (req.method === 'PATCH') {
      const data = updateSchema.parse(req.body)
      const form = await updateForm(data.id, leadId, {
        title: data.title,
        slug: data.slug,
        html: data.html,
        is_active: data.is_active,
      })
      return res.status(200).json({ form })
    }

    if (req.method === 'DELETE') {
      const id = typeof req.body?.id === 'string' ? req.body.id : (req.query.id as string)
      if (!id) return res.status(400).json({ error: 'id requerido' })
      const ok = await deleteForm(id, leadId)
      if (!ok) return res.status(404).json({ error: 'Formulario no encontrado' })
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    const msg = error instanceof Error ? error.message : 'Error'
    if (
      msg.includes('Slug') ||
      msg.includes('HTML') ||
      msg.includes('link ya está') ||
      msg.includes('no encontrado')
    ) {
      return res.status(400).json({ error: msg })
    }
    console.error('[onboarding/public-forms]', error)
    return res.status(500).json({ error: 'Error en formularios públicos' })
  }
}
