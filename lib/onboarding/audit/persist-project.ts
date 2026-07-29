import type { ConfiguradorConfig } from '@/lib/engranaje5/types'
import { prisma } from '@/lib/prisma'
import { syncProyectoFromLead } from '@/lib/engranaje5/sync-proyecto'

export { isAuditConfiguracion } from './config-detect'

/** Config mínima válida para que el lead aparezca en Proyectos como Auditoría. */
export function buildAuditProjectConfig(input: {
  leadId: number
  empresa?: string | null
  nombre?: string | null
  email?: string | null
  projectTypes?: string[]
}): ConfiguradorConfig {
  const typesLabel = (input.projectTypes || [])
    .filter((t) => t && t !== 'unclear')
    .join(', ')

  return {
    mode: 'custom',
    service_type: 'audit',
    leadId: input.leadId,
    empresa: input.empresa || undefined,
    nombre: input.nombre || undefined,
    email: input.email || undefined,
    title: 'Auditoría Buffalo AI',
    description:
      'Auditoría de procesos y oportunidades de automatización / agentes IA. En curso con el copiloto de onboarding.',
    scope_items: [
      'Reunión de descubrimiento y captura de contexto',
      'Análisis de proceso, volumen, ROI e integraciones',
      'Informe de hallazgos y propuesta de siguientes pasos',
    ],
    line_items: [
      {
        description: 'Auditoría Buffalo AI (presupuesto pendiente)',
        amount_eur: 0,
      },
    ],
    setup_total_eur: 0,
    monthly_fee_eur: null,
    onboarding_notes: [
      'audit_status:in_progress',
      typesLabel ? `tipos:${typesLabel}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

export function encodeConfiguracion(cfg: ConfiguradorConfig): string {
  return Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64')
}

/**
 * Guarda configuracion en el lead y sincroniza fila en proyectos.
 * Idempotente: si ya hay config de auditoría, la actualiza sin pisar un proyecto empaquetado distinto.
 */
export async function persistAuditProjectForLead(leadId: number): Promise<{
  ok: boolean
  skipped?: boolean
  reason?: string
}> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      contact: { select: { nombre: true, empresa: true, email: true } },
    },
  })
  if (!lead) return { ok: false, reason: 'Lead no encontrado' }

  let existing: ConfiguradorConfig | null = null
  if (lead.configuracion) {
    try {
      const json = Buffer.from(lead.configuracion, 'base64').toString('utf8')
      existing = JSON.parse(json) as ConfiguradorConfig
    } catch {
      try {
        existing = JSON.parse(lead.configuracion) as ConfiguradorConfig
      } catch {
        existing = null
      }
    }
  }

  // No sobrescribir un proyecto empaquetado / a medida ya presupuestado
  if (
    existing &&
    existing.service_type !== 'audit' &&
    (existing.voz || existing.chat || existing.dash || (existing.setup_total_eur && existing.setup_total_eur > 0))
  ) {
    return { ok: true, skipped: true, reason: 'Lead ya tiene otra configuración' }
  }

  const cfg = buildAuditProjectConfig({
    leadId,
    empresa: lead.contact?.empresa,
    nombre: lead.contact?.nombre,
    email: lead.contact?.email,
  })

  // Conservar presupuesto si ya se había rellenado en una pasada anterior
  if (existing?.service_type === 'audit') {
    if (existing.setup_total_eur && existing.setup_total_eur > 0) {
      cfg.setup_total_eur = existing.setup_total_eur
      cfg.line_items = existing.line_items?.length ? existing.line_items : cfg.line_items
    }
    if (existing.monthly_fee_eur != null) cfg.monthly_fee_eur = existing.monthly_fee_eur
    if (existing.scope_items?.length) cfg.scope_items = existing.scope_items
  }

  const encoded = encodeConfiguracion(cfg)

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      configuracion: encoded,
      notas: [
        lead.notas,
        '—',
        'Auditoría Buffalo AI en curso (copiloto).',
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000),
    },
  })

  await syncProyectoFromLead({
    leadId,
    configuracion: encoded,
    setupFee: cfg.setup_total_eur ?? 0,
    monthlyFee: cfg.monthly_fee_eur ?? null,
  })

  return { ok: true }
}
