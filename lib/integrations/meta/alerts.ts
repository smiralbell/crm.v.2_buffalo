import { opsLink, sendOpsAlert } from '@/lib/ops-alerts'
import { formatMetaRef, type ParsedMetaLead } from '@/lib/integrations/meta/parse'

function line(label: string, value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? `${label}: ${v}` : null
}

export function formatMetaLeadAlert(input: {
  lead: ParsedMetaLead
  leadId: number
}): { subject: string; text: string; html: string; telegramHtml: string } {
  const who = input.lead.nombre || input.lead.email || input.lead.telefono || 'Nuevo lead'
  const campaign = formatMetaRef(input.lead.campaign_name, input.lead.campaign_id)
  const form = formatMetaRef(input.lead.form_name, input.lead.form_id)
  const page = formatMetaRef(input.lead.page_name, input.lead.page_id)
  const ficha = opsLink(`/leads/${input.leadId}`)
  const inbox = opsLink('/marketing?tab=meta')
  const body = [
    line('Nombre', input.lead.nombre),
    line('Email', input.lead.email),
    line('Teléfono', input.lead.telefono),
    line('Empresa', input.lead.empresa),
    line('Campaña', campaign),
    line('Formulario', form),
    line('Página', page),
    line('Plataforma', input.lead.platform),
  ]
    .filter(Boolean)
    .join('\n')

  const subject = `Lead Meta Ads: ${who}`
  const text = `${body}\n\nFicha: ${ficha}\nMeta Ads: ${inbox}`
  const safe = (s: string) => s.replace(/</g, '')
  return {
    subject,
    text,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${safe(body)}</pre><p><a href="${ficha}">Abrir ficha</a> · <a href="${inbox}">Meta Ads</a></p>`,
    telegramHtml: `<b>${safe(subject)}</b>\n${safe(body)}\n${ficha}`,
  }
}

/** Mismo canal Gmail + Telegram que incidencias y recordatorios. No tira el ingest si falla el aviso. */
export async function alertMetaLead(input: { lead: ParsedMetaLead; leadId: number }): Promise<void> {
  const msg = formatMetaLeadAlert(input)
  try {
    await sendOpsAlert(msg)
  } catch (e) {
    console.warn('[meta-leads] aviso', e instanceof Error ? e.message : e)
  }
}
