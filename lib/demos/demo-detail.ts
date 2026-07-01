import { query } from '@/lib/db'
import { getDemoVoiceMetrics } from './calls-store'
import { buildMetricsFromRows } from './metrics'
import {
  DEFAULT_OUTBOUND_FORM_FIELDS,
  normalizeOutboundFormConfig,
  type OutboundFormFieldConfig,
} from './outbound-form'
import {
  DEFAULT_OUTBOUND_FORM_BRANDING,
  normalizeOutboundFormBranding,
  type OutboundFormBranding,
} from './form-branding'
import { getFormPublicAccess } from './public-form-store'
import type { DemoMetrics } from './types'
import { getDemoById } from './store'

export async function getDemoFormularioOutbound(demoId: number): Promise<OutboundFormFieldConfig[]> {
  try {
    const result = await query<{ formulario_outbound: unknown }>(
      `SELECT formulario_outbound FROM demos WHERE id = $1`,
      [demoId]
    )
    const raw = result.rows[0]?.formulario_outbound
    if (!raw) return DEFAULT_OUTBOUND_FORM_FIELDS
    return normalizeOutboundFormConfig(raw)
  } catch {
    return DEFAULT_OUTBOUND_FORM_FIELDS
  }
}

export async function updateDemoFormularioOutbound(
  demoId: number,
  fields: OutboundFormFieldConfig[]
): Promise<OutboundFormFieldConfig[]> {
  const normalized = normalizeOutboundFormConfig(fields)
  await query(`UPDATE demos SET formulario_outbound = $1::jsonb WHERE id = $2`, [
    JSON.stringify(normalized),
    demoId,
  ])
  return normalized
}

export async function getDemoFormularioBranding(demoId: number): Promise<OutboundFormBranding> {
  try {
    const result = await query<{ formulario_branding: unknown }>(
      `SELECT formulario_branding FROM demos WHERE id = $1`,
      [demoId]
    )
    return normalizeOutboundFormBranding(result.rows[0]?.formulario_branding)
  } catch {
    return { ...DEFAULT_OUTBOUND_FORM_BRANDING }
  }
}

export async function updateDemoFormularioBranding(
  demoId: number,
  branding: OutboundFormBranding
): Promise<OutboundFormBranding> {
  const normalized = normalizeOutboundFormBranding(branding)
  await query(`UPDATE demos SET formulario_branding = $1::jsonb WHERE id = $2`, [
    JSON.stringify(normalized),
    demoId,
  ])
  return normalized
}

export async function getDemoMetrics(demoId: number): Promise<DemoMetrics> {
  const conversations = await query<{
    numero_telefono: string
    messages: unknown
    updated_at: Date
  }>(
    `SELECT numero_telefono, messages, updated_at
     FROM demo_conversaciones
     WHERE demo_id = $1
     ORDER BY updated_at DESC`,
    [demoId]
  )

  let errorPhones = new Set<string>()
  try {
    const errors = await query<{ phone: string }>(
      `SELECT DISTINCT phone
       FROM demo_webhook_logs
       WHERE demo_id = $1 AND level = 'error' AND phone IS NOT NULL`,
      [demoId]
    )
    errorPhones = new Set(errors.rows.map((r) => r.phone))
  } catch {
    // sin tabla de logs
  }

  return buildMetricsFromRows(
    conversations.rows.map((r) => ({
      numero_telefono: r.numero_telefono,
      messages: r.messages as never,
      updated_at: r.updated_at,
    })),
    errorPhones
  )
}

export async function getDemoWithMetrics(demoId: number) {
  const demo = await getDemoById(demoId)
  if (!demo) return null

  if (demo.tipo === 'voz') {
    const [voice_metrics, formulario_outbound, form_access, formulario_branding] =
      await Promise.all([
        getDemoVoiceMetrics(demoId),
        getDemoFormularioOutbound(demoId),
        getFormPublicAccess(demoId),
        getDemoFormularioBranding(demoId),
      ])
    const metrics = await getDemoMetrics(demoId)
    return {
      ...demo,
      metrics,
      voice_metrics,
      formulario_outbound,
      form_access,
      formulario_branding,
    }
  }

  const metrics = await getDemoMetrics(demoId)
  return { ...demo, metrics }
}
