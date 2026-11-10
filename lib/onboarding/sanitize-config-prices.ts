import type { CrmRole } from '@/lib/auth'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import type { ConfiguradorConfig } from '@/lib/engranaje5/types'
import { canSeeClientPrices, stripPriceLines } from '@/lib/price-visibility'

/**
 * Configuración del lead (base64 JSON) sin precios ni documentos con importes:
 * fuera setup, mensualidad, partidas con importe, facturas vinculadas,
 * propuesta, contrato y diagnóstico. Solo para LECTURA de quien no ve precios;
 * nunca debe volver a guardarse.
 */
export function sanitizeConfiguracionPrices(raw: string | null | undefined): string | null {
  if (!raw) return raw ?? null
  const cfg = parseConfiguradorConfig(raw)
  if (!cfg) return null
  const {
    setup_total_eur: _setup,
    monthly_fee_eur: _monthly,
    payment_split: _split,
    linked_invoices: _invoices,
    proposal_draft: _proposal,
    proposal_last_turn: _proposalTurn,
    contract_draft: _contract,
    notebook_diagnosis: _diagnosis,
    ...rest
  } = cfg
  const clean: ConfiguradorConfig = {
    ...rest,
    description: cfg.description != null ? stripPriceLines(cfg.description) : undefined,
    project_context: cfg.project_context != null ? stripPriceLines(cfg.project_context) : undefined,
    onboarding_notes: cfg.onboarding_notes != null ? stripPriceLines(cfg.onboarding_notes) : undefined,
    pre_kickoff_draft: cfg.pre_kickoff_draft != null ? stripPriceLines(cfg.pre_kickoff_draft) : undefined,
    line_items: cfg.line_items?.map((li) => ({ description: li.description, amount_eur: 0 })),
  }
  return Buffer.from(JSON.stringify(clean), 'utf8').toString('base64')
}

/** Quita valor y precios de la configuración de un lead si el rol no puede verlos. */
export function hideLeadPrices<T extends { valor?: unknown; configuracion?: string | null }>(
  lead: T,
  role: CrmRole | null | undefined
): T {
  if (canSeeClientPrices(role)) return lead
  return {
    ...lead,
    ...('valor' in lead ? { valor: null } : {}),
    ...('configuracion' in lead
      ? { configuracion: sanitizeConfiguracionPrices(lead.configuracion) }
      : {}),
  }
}
