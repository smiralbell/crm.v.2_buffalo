import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import {
  getDemoFormularioBranding,
  getDemoFormularioOutbound,
  updateDemoFormularioBranding,
  updateDemoFormularioOutbound,
} from '@/lib/demos/demo-detail'
import { normalizeOutboundFormBranding } from '@/lib/demos/form-branding'
import { normalizeOutboundFormConfig } from '@/lib/demos/outbound-form'
import {
  getFormPublicAccess,
  regeneratePublicFormToken,
  setFormPassword,
} from '@/lib/demos/public-form-store'
import { getDemoById } from '@/lib/demos/store'

const fieldSchema = z.object({
  key: z.string(),
  label: z.string().min(1).max(80),
  enabled: z.boolean(),
  required: z.boolean(),
  placeholder: z.string().max(200).optional(),
})

const brandingSchema = z.object({
  logo_url: z.string().max(2000).nullable().optional(),
  color_primary: z.string().max(20),
  color_secondary: z.string().max(20),
})

const putSchema = z.object({
  fields: z.array(fieldSchema).min(1).optional(),
  branding: brandingSchema.optional(),
  password: z.string().min(4, 'Mínimo 4 caracteres').max(128).optional(),
  regenerate_token: z.boolean().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const id = parseInt(req.query.id as string, 10)
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  const demo = await getDemoById(id)
  if (!demo) return res.status(404).json({ error: 'Demo no encontrada' })
  if (demo.tipo !== 'voz') {
    return res.status(400).json({ error: 'Solo aplica a demos de voz' })
  }

  if (req.method === 'GET') {
    const [fields, access, branding] = await Promise.all([
      getDemoFormularioOutbound(id),
      getFormPublicAccess(id),
      getDemoFormularioBranding(id),
    ])
    return res.status(200).json({ fields, branding, ...access })
  }

  if (req.method === 'PUT') {
    try {
      const parsed = putSchema.parse(req.body)
      let access = await getFormPublicAccess(id)

      if (parsed.regenerate_token) {
        access = await regeneratePublicFormToken(id)
      }

      if (parsed.password) {
        access = await setFormPassword(id, parsed.password)
      }

      let fields = await getDemoFormularioOutbound(id)
      if (parsed.fields) {
        fields = await updateDemoFormularioOutbound(id, normalizeOutboundFormConfig(parsed.fields))
      }

      let branding = await getDemoFormularioBranding(id)
      if (parsed.branding) {
        branding = await updateDemoFormularioBranding(
          id,
          normalizeOutboundFormBranding({
            logo_url: parsed.branding.logo_url || null,
            color_primary: parsed.branding.color_primary,
            color_secondary: parsed.branding.color_secondary,
          })
        )
      }

      return res.status(200).json({ fields, branding, ...access })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' })
      }
      const msg = err instanceof Error ? err.message : 'Error al guardar'
      return res.status(500).json({ error: msg })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
