import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { InboundProcessorResult } from '@/lib/ingest/types'
import {
  advanceLeadOnGlobalByContactEmail,
  advanceLeadOnGlobalPipeline,
} from '@/lib/pipelines/onboarding-global'

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

export function onboardingFormIds(payload: unknown): { leadId: number | null; email: string | null } {
  const body = rec(payload)
  const cfg = rec(body.config || body.cfg)
  const datos = rec(body.datos)
  const leadRaw = cfg.leadId ?? body.leadId ?? datos.leadId
  const leadId = leadRaw != null ? parseInt(String(leadRaw), 10) : NaN
  const email = str(datos.contacto_email) || str(cfg.email) || str(body.email)
  return { leadId: Number.isInteger(leadId) && leadId > 0 ? leadId : null, email }
}

export function onboardingFormExternalId(payload: unknown): string {
  const { leadId, email } = onboardingFormIds(payload)
  const digest = createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex').slice(0, 16)
  return `onb:${leadId || email || 'x'}:${digest}`
}

export async function processOnboardingForm(payload: unknown): Promise<InboundProcessorResult> {
  const { leadId, email } = onboardingFormIds(payload)
  if (!leadId && !email) return { status: 'ignored', result: { reason: 'missing_lead_or_email' } }

  let result: { ok?: boolean; [k: string]: unknown }
  if (leadId) {
    result = await advanceLeadOnGlobalPipeline(leadId, 'onboarding_recibido')
    await prisma.lead
      .update({ where: { id: leadId }, data: { estado: 'activo', ultima_interaccion: new Date() } })
      .catch(() => undefined)
  } else {
    result = await advanceLeadOnGlobalByContactEmail(email!, 'onboarding_recibido')
  }
  return { status: 'processed', result: { leadId, email, ...(result || {}) } }
}
