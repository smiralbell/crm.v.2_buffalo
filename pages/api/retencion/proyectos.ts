import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getAccessibleProjectIds } from '@/lib/project-access'
import { stripRetencionListRowForDeveloper } from '@/lib/retencion/developer-view'
import { prisma } from '@/lib/prisma'

type ProyectoRow = {
  id: string
  lead_id: number | null
  name: string
  config_ref: string | null
  status: string
  service_type: string
  setup_fee_eur: string | number | null
  monthly_fee_eur: string | number | null
  maint_plan: string | null
  has_mensualidad: boolean
  updated_at: Date
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await requireAuthAPI(req, res)
    const accessibleIds = await getAccessibleProjectIds(user)
    const isDeveloper = user.role === 'developer'

    let proyectos: ProyectoRow[]
    if (accessibleIds === null) {
      proyectos = await prisma.$queryRaw<ProyectoRow[]>`
        SELECT
          id, lead_id, name, config_ref, status, service_type,
          setup_fee_eur, monthly_fee_eur, maint_plan, has_mensualidad, updated_at
        FROM proyectos
        WHERE has_mensualidad = true AND lead_id IS NOT NULL
        ORDER BY updated_at DESC
      `
    } else if (accessibleIds.length === 0) {
      return res.status(200).json({ proyectos: [], total: 0 })
    } else {
      proyectos = await prisma.$queryRaw<ProyectoRow[]>`
        SELECT
          id, lead_id, name, config_ref, status, service_type,
          setup_fee_eur, monthly_fee_eur, maint_plan, has_mensualidad, updated_at
        FROM proyectos
        WHERE has_mensualidad = true
          AND lead_id IS NOT NULL
          AND id = ANY(${accessibleIds}::uuid[])
        ORDER BY updated_at DESC
      `
    }

    const leadIds = proyectos.map((p) => p.lead_id).filter((id): id is number => id != null)

    const leads = leadIds.length
      ? await prisma.lead.findMany({
          where: { id: { in: leadIds } },
          include: {
            contact: {
              select: {
                id: true,
                nombre: true,
                email: true,
                empresa: true,
                telefono: true,
              },
            },
          },
        })
      : []

    const leadMap = new Map(leads.map((l) => [l.id, l]))

    const rows = proyectos.map((p) => {
      const lead = p.lead_id ? leadMap.get(p.lead_id) : null
      return stripRetencionListRowForDeveloper(
        {
          id: p.id,
          lead_id: p.lead_id,
          name: p.name,
          config_ref: p.config_ref,
          status: p.status,
          service_type: p.service_type,
          setup_fee_eur: isDeveloper ? null : p.setup_fee_eur != null ? Number(p.setup_fee_eur) : null,
          monthly_fee_eur: isDeveloper ? null : p.monthly_fee_eur != null ? Number(p.monthly_fee_eur) : null,
          maint_plan: isDeveloper ? null : p.maint_plan,
          has_mensualidad: isDeveloper ? undefined : p.has_mensualidad,
          updated_at:
            p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at),
          contact: lead?.contact ?? null,
          lead_estado: lead?.estado ?? null,
        },
        user
      )
    })

    return res.status(200).json({ proyectos: rows, total: rows.length })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error interno'
    console.error('[retencion/proyectos]', error)
    return res.status(500).json({ error: msg })
  }
}
