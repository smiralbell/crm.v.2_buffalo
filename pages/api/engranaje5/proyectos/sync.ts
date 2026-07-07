import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { syncProyectoFromLead } from '@/lib/engranaje5/sync-proyecto'
import { z } from 'zod'

const bodySchema = z.object({
  leadId: z.number().int().positive(),
  configuracion: z.string().optional().nullable(),
  setupFee: z.number().optional().nullable(),
  monthlyFee: z.number().optional().nullable(),
  leadEstado: z.string().optional().nullable(),
})

function classifySyncError(msg: string): { status: number; error: string; hint?: string; detail?: string } {
  const lower = msg.toLowerCase()

  if (lower.includes('relation "proyectos" does not exist') || lower.includes('no existe la relación «proyectos»')) {
    return {
      status: 503,
      error: 'La tabla proyectos no existe en PostgreSQL.',
      hint: 'Ejecuta prisma/ENGRANAJE5_FULL_SCHEMA.sql en la base de datos del CRM.',
    }
  }

  if (lower.includes('column') && lower.includes('does not exist')) {
    return {
      status: 503,
      error: 'La tabla proyectos existe pero faltan columnas para el autoguardado.',
      hint: 'Ejecuta prisma/ALTER_PROYECTOS_SYNC_COLUMNS.sql en PostgreSQL.',
      detail: msg,
    }
  }

  if (lower.includes('23502') || lower.includes('not-null constraint')) {
    return {
      status: 503,
      error: 'Faltan valores obligatorios al crear el proyecto (columnas NOT NULL sin default).',
      hint: 'Ejecuta prisma/ALTER_PROYECTOS_SYNC_COLUMNS.sql y redeploy del CRM.',
      detail: msg,
    }
  }

  if (lower.includes('proyectos') && lower.includes('does not exist')) {
    return {
      status: 503,
      error: 'Error de esquema en la tabla proyectos.',
      hint: 'Ejecuta prisma/ENGRANAJE5_FULL_SCHEMA.sql y prisma/ALTER_PROYECTOS_SYNC_COLUMNS.sql.',
      detail: msg,
    }
  }

  return { status: 500, error: msg }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await requireAuthAPI(req, res)
    const body = bodySchema.parse(req.body)
    const result = await syncProyectoFromLead(body)

    if (result.skipped) {
      return res.status(200).json({ ok: true, skipped: true, reason: result.reason })
    }

    return res.status(200).json({
      ok: true,
      proyecto: {
        id: result.proyecto.id,
        name: result.proyecto.name,
        service_type: result.proyecto.service_type,
        status: result.proyecto.status,
        setup_fee_eur: result.proyecto.setup_fee_eur,
        monthly_fee_eur: result.proyecto.monthly_fee_eur,
        config_ref: result.proyecto.config_ref,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    const msg = error instanceof Error ? error.message : 'Error al sincronizar proyecto'
    const classified = classifySyncError(msg)
    if (classified.status === 500) {
      console.error('[engranaje5/sync]', error)
    }
    return res.status(classified.status).json({
      error: classified.error,
      ...(classified.hint ? { hint: classified.hint } : {}),
      ...(classified.detail && process.env.NODE_ENV === 'development' ? { detail: classified.detail } : {}),
    })
  }
}
