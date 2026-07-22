import { prisma } from '@/lib/prisma'
import type { ProyectoContext } from './retention-agent'

export async function assertRetencionEligible(proyectoId: string): Promise<{
  ok: true
  row: {
    id: string
    name: string
    service_type: string
    status: string
    monthly_fee_eur: number | null
    maint_plan: string | null
    has_voz: boolean | null
    has_chat: boolean | null
    has_dash: boolean | null
    lead_id: number | null
    es_buffalo: boolean
    has_mensualidad: boolean
  }
} | { ok: false; error: string; status: number }> {
  const rows = await prisma.$queryRaw<
    {
      id: string
      name: string
      service_type: string
      status: string
      monthly_fee_eur: number | null
      maint_plan: string | null
      has_voz: boolean | null
      has_chat: boolean | null
      has_dash: boolean | null
      lead_id: number | null
      es_buffalo: boolean
      has_mensualidad: boolean
    }[]
  >`
    SELECT
      id::text, name, service_type, status,
      monthly_fee_eur::float8 AS monthly_fee_eur,
      maint_plan, has_voz, has_chat, has_dash, lead_id,
      COALESCE(es_buffalo, false) AS es_buffalo,
      COALESCE(has_mensualidad, false) AS has_mensualidad
    FROM proyectos
    WHERE id = ${proyectoId}::uuid
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return { ok: false, error: 'Proyecto no encontrado', status: 404 }
  if (!row.es_buffalo || !row.has_mensualidad) {
    return {
      ok: false,
      error: 'Solo proyectos Buffalo en marcha con mensualidad entran en Retención',
      status: 403,
    }
  }
  if (!['development', 'active', 'paused'].includes(row.status)) {
    return { ok: false, error: 'Proyecto no activo en retención', status: 403 }
  }
  return { ok: true, row }
}

export async function buildProyectoContext(proyectoId: string): Promise<ProyectoContext | null> {
  const check = await assertRetencionEligible(proyectoId)
  if (!check.ok) return null
  const { row } = check

  let contact_nombre: string | null = null
  let contact_empresa: string | null = null
  let lead_notas: string | null = null
  let configuracion_preview: string | null = null

  if (row.lead_id) {
    const lead = await prisma.lead.findUnique({
      where: { id: row.lead_id },
      select: {
        notas: true,
        configuracion: true,
        contact: { select: { nombre: true, empresa: true } },
      },
    })
    contact_nombre = lead?.contact?.nombre ?? null
    contact_empresa = lead?.contact?.empresa ?? null
    lead_notas = lead?.notas ?? null
    configuracion_preview = lead?.configuracion
      ? lead.configuracion.slice(0, 2500)
      : null
  }

  return {
    id: row.id,
    name: row.name,
    service_type: row.service_type,
    status: row.status,
    monthly_fee_eur: row.monthly_fee_eur,
    maint_plan: row.maint_plan,
    has_voz: Boolean(row.has_voz),
    has_chat: Boolean(row.has_chat),
    has_dash: Boolean(row.has_dash),
    contact_nombre,
    contact_empresa,
    lead_notas,
    configuracion_preview,
  }
}
